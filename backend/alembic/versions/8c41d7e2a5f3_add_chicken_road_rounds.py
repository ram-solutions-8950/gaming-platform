"""add chicken_road_rounds: Chicken Road rounds move from process memory to the database

Revision ID: 8c41d7e2a5f3
Revises: 6da470c1c7b5
Create Date: 2026-09-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '8c41d7e2a5f3'
down_revision: Union[str, Sequence[str], None] = '6da470c1c7b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded: some environments already have this table from a create_all run.
    if sa.inspect(op.get_bind()).has_table("chicken_road_rounds"):
        return
    op.create_table(
        "chicken_road_rounds",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("difficulty", sa.String(length=10), nullable=False),
        sa.Column("multipliers", sa.JSON(), nullable=False),
        sa.Column("bet_amount", sa.BigInteger(), nullable=False),
        sa.Column("hit_lane", sa.Integer(), nullable=True),
        sa.Column("current_lane", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lost_lane", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="ACTIVE"),
        sa.Column("multiplier", sa.Float(), nullable=True),
        sa.Column("payout", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chicken_road_rounds_user_id", "chicken_road_rounds", ["user_id"])
    op.create_index(
        "uq_chicken_road_rounds_one_active",
        "chicken_road_rounds",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )


def downgrade() -> None:
    op.drop_index("uq_chicken_road_rounds_one_active", table_name="chicken_road_rounds")
    op.drop_index("ix_chicken_road_rounds_user_id", table_name="chicken_road_rounds")
    op.drop_table("chicken_road_rounds")
