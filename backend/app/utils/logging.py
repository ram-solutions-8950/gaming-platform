"""Application logging.

Kept deliberately simple, with two hard-won constraints:

* ``propagate`` is off. The Alembic config installs a handler on the root
  logger, so leaving propagation on duplicates every line once migrations
  have run.
* Levels come from ``LOG_LEVEL`` so production can be turned up without a
  redeploy of code changes.

See also ``alembic/env.py``: ``fileConfig`` must not disable existing
loggers, or everything configured here stops emitting mid-startup.
"""
import logging
import os
import sys

_DEFAULT_LEVEL = "INFO"
_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
_DATEFMT = "%Y-%m-%dT%H:%M:%SZ"


def _level() -> int:
    """Resolve the configured level.

    Read through ``settings`` rather than ``os.getenv``: pydantic loads the
    .env file into the settings object, not into the process environment, so
    a LOG_LEVEL set there would otherwise be silently ignored. The import is
    local and guarded because logging is used during early startup, before
    configuration is necessarily importable.
    """
    name = _DEFAULT_LEVEL
    try:
        from ..config import settings

        name = getattr(settings, "LOG_LEVEL", None) or os.getenv(
            "LOG_LEVEL", _DEFAULT_LEVEL
        )
    except Exception:
        name = os.getenv("LOG_LEVEL", _DEFAULT_LEVEL)
    return getattr(logging, str(name).upper(), logging.INFO)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter(fmt=_FORMAT, datefmt=_DATEFMT))
        logger.addHandler(handler)
        # Root has an Alembic-installed handler; propagating would double
        # every line.
        logger.propagate = False
    logger.setLevel(_level())
    return logger


def configure_logging() -> None:
    """Normalise third-party loggers at startup.

    Called from the app lifespan *after* migrations, so it also repairs
    anything Alembic's logging config disturbed.
    """
    level = _level()

    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter(fmt=_FORMAT, datefmt=_DATEFMT))
        root.addHandler(handler)
    root.setLevel(level)

    # Alembic may have disabled or re-levelled these; put them back so
    # request and error logs keep flowing for the life of the process.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        lg = logging.getLogger(name)
        lg.disabled = False
        lg.setLevel(level)
        # uvicorn installs its own handlers. Propagating as well would send
        # each line to the root handler too and print everything twice; only
        # fall back to propagation when the logger has no handler of its own.
        lg.propagate = not lg.handlers

    # Noisy at INFO, useful at DEBUG.
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.DEBUG if level <= logging.DEBUG else logging.WARNING
    )
