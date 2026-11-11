"""Run blocking database work off the event loop.

This service talks to Postgres through psycopg2, which is synchronous. A
single uvicorn worker runs one event loop, so a blocking call made directly
inside an ``async def`` stops *every* request and *every* websocket for the
whole process until it returns.

That is not hypothetical here: wallet writes take ``SELECT ... FOR UPDATE``
row locks, so one player's settlement can park the loop while it waits on
another transaction. With a dozen players on short game rounds the loop
spends much of its time parked, every client's polling request times out,
and the UI falls back to showing zeros.

FastAPI already does the right thing for plain ``def`` endpoints: it runs
them in a worker thread. These helpers extend the same treatment to the
``async def`` handlers that cannot be converted because they genuinely await
something (a broadcast, an upload, a websocket frame).

Usage::

    result = await in_thread(engine.place_bet, db, user_id=uid, amount=amt)

The callable runs in anyio's worker-thread pool, which FastAPI also uses for
sync endpoints. Keep ``DB_POOL_SIZE + DB_MAX_OVERFLOW`` at or above that
thread count so an offloaded call never waits on a connection it could have
had.
"""
from __future__ import annotations

import functools
from typing import Any, Callable, TypeVar

from anyio import to_thread

T = TypeVar("T")


async def in_thread(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Await ``fn(*args, **kwargs)`` executed in a worker thread."""
    return await to_thread.run_sync(functools.partial(fn, *args, **kwargs))
