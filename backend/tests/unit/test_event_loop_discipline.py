"""Guards against blocking the event loop, and against nesting the table lock.

This service talks to Postgres through psycopg2, which is synchronous, and runs
a single uvicorn worker -- one event loop for every request and every
websocket. A blocking call made directly inside an ``async def`` therefore
stops the whole process until it returns, and wallet writes take
``SELECT ... FOR UPDATE`` row locks, so "until it returns" can mean "until
another transaction commits". With a dozen players on short rounds the loop
spent much of its time parked, every poll timed out, and the UI fell back to
showing zero balances.

Plain ``def`` endpoints are safe: FastAPI runs them in a worker thread. These
tests cover the ``async def`` code that cannot be converted, where the work has
to be handed to ``in_thread`` explicitly.

The second test covers the other half of that rework. Offloading introduces an
``await`` where there was none, so the in-memory poker engine -- which has no
internal locking -- is serialised behind a per-table ``asyncio.Lock``. That
lock is not reentrant, and the handlers call into each other, so a nested
acquire would wedge a table permanently while it is holding players' chips.
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[2] / "app"

# Session methods that go to the database and therefore block.
BLOCKING_SESSION_CALLS = {
    "query", "commit", "execute", "refresh", "flush",
    "scalar", "scalars", "rollback", "merge", "get",
}

# The realtime modules, where one blocking call stalls every connected player.
REALTIME_MODULES = [
    "websocket/poker_ws.py",
    "websocket/ludo.py",
    "websocket/aviator_ws.py",
    "websocket/ludo_matchmaking.py",
    "routers/poker.py",
    "routers/ludo.py",
]


def _blocking_calls_in_async_bodies(source: str) -> list[tuple[int, str, str]]:
    """Blocking calls written directly in an ``async def`` body.

    Nested plain ``def``s are skipped on purpose: those are the functions
    handed to ``in_thread``, so their database work runs in a worker thread.
    """
    found: list[tuple[int, str, str]] = []

    class Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.enclosing_async: list[str] = []

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
            self.enclosing_async.append(node.name)
            for child in node.body:
                self.visit(child)
            self.enclosing_async.pop()

        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            return  # runs in a thread; not our problem

        def visit_Call(self, node: ast.Call) -> None:
            if self.enclosing_async:
                func = node.func
                where = self.enclosing_async[-1]
                if isinstance(func, ast.Attribute) and func.attr in BLOCKING_SESSION_CALLS:
                    # Only flag it when the receiver looks like a Session.
                    receiver = func.value
                    name = getattr(receiver, "id", None) or getattr(receiver, "attr", None)
                    if name in {"db", "session", "s", "db_session"}:
                        found.append((node.lineno, where, f"{name}.{func.attr}()"))
                elif isinstance(func, ast.Name) and func.id == "SessionLocal":
                    found.append((node.lineno, where, "SessionLocal()"))
            self.generic_visit(node)

    Visitor().visit(ast.parse(source))
    return found


@pytest.mark.parametrize("relative_path", REALTIME_MODULES)
def test_realtime_modules_do_not_block_the_event_loop(relative_path):
    path = APP / relative_path
    if not path.exists():
        pytest.skip(f"{relative_path} not present")

    offenders = _blocking_calls_in_async_bodies(path.read_text())

    assert not offenders, "\n".join(
        [
            f"{relative_path} runs blocking database work on the event loop. "
            "Move it into a plain function and await it through "
            "`app.utils.async_db.in_thread`:",
            *(f"  line {line}: {call} inside `async def {func}`" for line, func, call in offenders),
        ]
    )


def test_poker_locked_helpers_never_acquire_the_table_lock():
    """`*_locked` means "the caller already holds it".

    ``asyncio.Lock`` is not reentrant. ``run_bot_turns`` awaits
    ``deal_next_hand_locked``, which awaits ``tidy_seats_locked``; if any of
    them took the lock itself the table would deadlock forever, mid-hand, with
    real chips committed to the pot.
    """
    source = (APP / "websocket" / "poker_ws.py").read_text()
    tree = ast.parse(source)

    offenders: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not node.name.endswith("_locked"):
            continue
        for inner in ast.walk(node):
            if isinstance(inner, ast.Call) and isinstance(inner.func, ast.Name):
                if inner.func.id == "table_lock":
                    offenders.append(f"{node.name}() acquires table_lock at line {inner.lineno}")

    assert not offenders, (
        "a `*_locked` helper acquires the table lock its caller already holds; "
        "asyncio locks are not reentrant, so this deadlocks the table: "
        + "; ".join(offenders)
    )


def test_poker_lock_is_held_for_every_engine_mutation_entry_point():
    """The top-level entry points must each take the lock somewhere."""
    source = (APP / "websocket" / "poker_ws.py").read_text()
    tree = ast.parse(source)

    must_lock = {
        "on_seat_taken",
        "_run_turn_clock",
        "_cash_out_when_gone",
        "cash_out_all_tables",
        "run_bot_turns",
        "poker_websocket_endpoint",
        "_on_player_gone",
    }
    seen = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name in must_lock:
            uses_lock = any(
                isinstance(inner, ast.AsyncWith) for inner in ast.walk(node)
            )
            if uses_lock:
                seen.add(node.name)

    missing = sorted(must_lock - seen)
    assert not missing, (
        "these poker entry points mutate engine state without holding the "
        f"table lock: {missing}"
    )
