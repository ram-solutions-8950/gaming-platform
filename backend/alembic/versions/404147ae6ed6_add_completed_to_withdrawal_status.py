"""add_completed_to_withdrawal_status

Revision ID: 404147ae6ed6
Revises: b06d1dfe2438
Create Date: 2026-08-19 21:17:11.757124

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '404147ae6ed6'
down_revision: Union[str, Sequence[str], None] = 'b06d1dfe2438'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add COMPLETED to withdrawal_status enum if not exists
    op.execute("ALTER TYPE withdrawal_status ADD VALUE IF NOT EXISTS 'COMPLETED'")


def downgrade() -> None:
    # Postgres does not support removing enum values easily
    pass
