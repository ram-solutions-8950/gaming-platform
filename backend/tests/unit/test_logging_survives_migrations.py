"""Regression test for the production logging blackout.

Migrations run in-process during application startup, and Alembic's
``env.py`` calls ``logging.config.fileConfig``. That function defaults to
``disable_existing_loggers=True``, which switches off every logger created
before it -- uvicorn's access and error loggers, and all app loggers. The
observed effect in production was a backend that emitted six log lines in
four days and then nothing, while happily serving thousands of requests.

These tests pin both halves of the fix: the call site passes the flag, and
loggers genuinely keep working after the config is applied.
"""
from __future__ import annotations

import logging
from logging.config import fileConfig
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"
ENV_PY = BACKEND_ROOT / "alembic" / "env.py"


def test_env_py_does_not_disable_existing_loggers():
    source = ENV_PY.read_text()
    assert "fileConfig(" in source, "alembic/env.py no longer configures logging"
    assert "disable_existing_loggers=False" in source, (
        "alembic/env.py must call fileConfig(..., disable_existing_loggers=False); "
        "the default of True silences uvicorn and every app logger for the "
        "remaining life of the process"
    )


@pytest.mark.skipif(not ALEMBIC_INI.exists(), reason="alembic.ini not present")
def test_app_logger_still_emits_after_alembic_logging_config():
    """Apply Alembic's logging config the way startup does, then log."""
    from app.utils.logging import configure_logging, get_logger

    logger = get_logger("test_blackout_probe")

    records: list[logging.LogRecord] = []

    class Capture(logging.Handler):
        def emit(self, record):
            records.append(record)

    capture = Capture()
    logger.addHandler(capture)
    try:
        # This is the exact call alembic/env.py makes during startup.
        fileConfig(str(ALEMBIC_INI), disable_existing_loggers=False)
        configure_logging()

        assert not logger.disabled, "app logger was disabled by Alembic's config"
        logger.info("probe after migrations")

        assert any(r.getMessage() == "probe after migrations" for r in records), (
            "app logger stopped emitting after Alembic configured logging"
        )

        for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            assert not logging.getLogger(name).disabled, (
                f"{name} was left disabled; request and error logs would vanish"
            )
    finally:
        logger.removeHandler(capture)


def test_app_loggers_do_not_double_emit():
    """propagate must stay off, or Alembic's root handler duplicates every line."""
    from app.utils.logging import get_logger

    logger = get_logger("test_propagate_probe")
    assert logger.propagate is False, (
        "app loggers must not propagate: Alembic installs a handler on the "
        "root logger, so propagation would print every line twice"
    )
