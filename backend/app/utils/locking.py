"""Row-level locking helpers.

``SELECT ... FOR UPDATE`` on its own is **not** enough to make a
read-modify-write safe in SQLAlchemy. If the entity is already in the
session's identity map — because something earlier in the same transaction
loaded it, directly or through a relationship — the lock is taken but the
ORM hands back the *cached* instance and leaves its attributes untouched.
The guard then runs against a value a concurrent transaction has already
superseded, and the commit silently discards that other transaction's work.

Concretely, this is how a wallet loses a credit:

    bal = get_balance(db, uid)        # caches Wallet(balance=100)
    ...                               # another session commits +700
    w = lock_wallet(db, uid)          # lock acquired, but balance is still 100
    w.balance -= 50                   # writes 50, not 750

and how a deposit gets credited twice, or a withdrawal refunded twice: the
status check reads the pre-transition value and passes a second time.

``populate_existing=True`` forces the freshly locked row's values onto the
instance, so the lock and the data always come from the same read. Every
``FOR UPDATE`` load in this codebase must go through these helpers.
"""
from __future__ import annotations

from typing import Optional, Type, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

T = TypeVar("T")


def lock_one(db: Session, entity: Type[T], *criteria) -> Optional[T]:
    """Lock the first row matching ``criteria`` and return it with fresh values.

    Returns ``None`` when no row matches, mirroring ``Query.first()``.
    """
    return (
        db.execute(
            select(entity)
            .where(*criteria)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        .scalars()
        .first()
    )


def lock_all(
    db: Session,
    entity: Type[T],
    *criteria,
    order_by=None,
    limit: Optional[int] = None,
    skip_locked: bool = False,
) -> list:
    """Lock every row matching ``criteria`` and return them with fresh values.

    ``skip_locked`` steps over rows another transaction already holds, which
    is what you want for queue-draining (two matchmakers should take
    different players, not block on the same ones).
    """
    stmt = select(entity).where(*criteria)
    if order_by is not None:
        if isinstance(order_by, (list, tuple)):
            stmt = stmt.order_by(*order_by)
        else:
            stmt = stmt.order_by(order_by)
    if limit is not None:
        stmt = stmt.limit(limit)
    stmt = stmt.with_for_update(skip_locked=skip_locked).execution_options(
        populate_existing=True
    )
    return list(db.execute(stmt).scalars().all())
