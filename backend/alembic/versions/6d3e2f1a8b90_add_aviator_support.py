"""add aviator support

Revision ID: 6d3e2f1a8b90
Revises: 5c2d1e8a7f90
Create Date: 2026-08-22 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '6d3e2f1a8b90'
down_revision: Union[str, None] = '5c2d1e8a7f90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create aviator_rounds table
    op.create_table(
        'aviator_rounds',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('nonce', sa.Integer(), nullable=False),
        sa.Column('server_seed_hash', sa.String(length=64), nullable=False),
        sa.Column('server_seed', sa.String(length=64), nullable=True),
        sa.Column('crash_multiplier', sa.Float(), nullable=True),
        sa.Column('status', sa.Enum('BETTING', 'FLYING', 'CRASHED', 'SETTLED', name='aviator_round_status'), nullable=False),
        sa.Column('betting_started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('flight_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('crashed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('settled_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. Create aviator_bets table
    op.create_table(
        'aviator_bets',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('round_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('slot', sa.Integer(), nullable=False),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('auto_cashout', sa.Float(), nullable=True),
        sa.Column('status', sa.Enum('ACTIVE', 'CASHED_OUT', 'LOST', name='aviator_bet_status'), nullable=False),
        sa.Column('cashout_multiplier', sa.Float(), nullable=True),
        sa.Column('payout', sa.BigInteger(), nullable=True),
        sa.Column('cashed_out_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['round_id'], ['aviator_rounds.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_aviator_bets_user_id'), 'aviator_bets', ['user_id'], unique=False)
    op.create_index(op.f('ix_aviator_bets_round_id'), 'aviator_bets', ['round_id'], unique=False)

    # 3. Add Aviator entry to games catalog
    op.execute(sa.text("""
        INSERT INTO games (id, name, slug, game_type, description, status, min_bet, max_bet, created_at, updated_at)
        VALUES (
            'b1a2c3d4-e5f6-7890-abcd-1234567890ab',
            'Aviator',
            'aviator',
            'CRASH',
            'Place your bet and cash out before the plane flies away! Provably fair crash game.',
            'ACTIVE',
            100,
            1000000,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (slug) DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM games WHERE slug = 'aviator'"))
    op.drop_index(op.f('ix_aviator_bets_round_id'), table_name='aviator_bets')
    op.drop_index(op.f('ix_aviator_bets_user_id'), table_name='aviator_bets')
    op.drop_table('aviator_bets')
    op.drop_table('aviator_rounds')
    sa.Enum(name='aviator_bet_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='aviator_round_status').drop(op.get_bind(), checkfirst=True)
