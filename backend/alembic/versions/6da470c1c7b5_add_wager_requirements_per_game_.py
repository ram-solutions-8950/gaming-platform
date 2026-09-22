"""add wager requirements, per-game commission, referral percentage settings

Revision ID: 6da470c1c7b5
Revises: 6a38e66b805b
Create Date: 2026-09-22 16:30:21.845707

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '6da470c1c7b5'
down_revision: Union[str, Sequence[str], None] = '6a38e66b805b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # --- Deposit play-through (wager) requirements -------------------------
    # Guarded: some environments already have this table from a create_all run.
    if not _has_table("wager_requirements"):
        op.create_table(
            "wager_requirements",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("deposit_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("required_amount", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("completed_amount", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("is_fulfilled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["deposit_id"], ["deposits.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("deposit_id", name="wager_requirements_deposit_id_key"),
        )
        op.create_index("ix_wager_requirements_user_id", "wager_requirements", ["user_id"])
        op.create_index(
            "ix_wager_requirements_user_pending", "wager_requirements", ["user_id", "is_fulfilled"]
        )

    # --- Per-game commission overrides ------------------------------------
    if not _has_column("fee_configurations", "game_commission_overrides"):
        op.add_column(
            "fee_configurations",
            sa.Column("game_commission_overrides", sa.JSON(), nullable=True),
        )

    # --- Refer & Win: percentage rewards + minimum qualifying deposit ------
    if not _has_column("referral_settings", "reward_type"):
        op.add_column(
            "referral_settings",
            sa.Column("reward_type", sa.String(length=20), nullable=False, server_default="PERCENTAGE"),
        )
        op.alter_column("referral_settings", "reward_type", server_default=None)

    if not _has_column("referral_settings", "reward_percentage"):
        op.add_column(
            "referral_settings",
            sa.Column(
                "reward_percentage",
                sa.Numeric(precision=5, scale=2),
                nullable=False,
                server_default="10.00",
            ),
        )
        op.alter_column("referral_settings", "reward_percentage", server_default=None)

    if not _has_column("referral_settings", "min_deposit_amount"):
        op.add_column(
            "referral_settings",
            sa.Column("min_deposit_amount", sa.BigInteger(), nullable=False, server_default="10000"),
        )
        op.alter_column("referral_settings", "min_deposit_amount", server_default=None)


def downgrade() -> None:
    if _has_column("referral_settings", "min_deposit_amount"):
        op.drop_column("referral_settings", "min_deposit_amount")
    if _has_column("referral_settings", "reward_percentage"):
        op.drop_column("referral_settings", "reward_percentage")
    if _has_column("referral_settings", "reward_type"):
        op.drop_column("referral_settings", "reward_type")
    if _has_column("fee_configurations", "game_commission_overrides"):
        op.drop_column("fee_configurations", "game_commission_overrides")
    if _has_table("wager_requirements"):
        op.drop_index("ix_wager_requirements_user_pending", table_name="wager_requirements")
        op.drop_index("ix_wager_requirements_user_id", table_name="wager_requirements")
        op.drop_table("wager_requirements")
