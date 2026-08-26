"""add ludo turn timeout fields

Revision ID: 6a38e66b805b
Revises: 605ad3473791
Create Date: 2026-08-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6a38e66b805b"
down_revision: Union[str, Sequence[str], None] = "605ad3473791"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ludo_matches",
        sa.Column(
            "turn_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "ludo_players",
        sa.Column(
            "consecutive_timeouts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    op.alter_column(
        "ludo_players",
        "consecutive_timeouts",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("ludo_players", "consecutive_timeouts")
    op.drop_column("ludo_matches", "turn_started_at")
