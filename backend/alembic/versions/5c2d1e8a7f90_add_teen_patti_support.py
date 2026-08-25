"""add teen patti support

Revision ID: 5c2d1e8a7f90
Revises: 4b1c8f2a9e01
Create Date: 2026-08-22 18:55:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '5c2d1e8a7f90'
down_revision: Union[str, None] = '4b1c8f2a9e01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create tables
    op.create_table(
        'teen_patti_tables',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('mode', sa.Enum('VIRTUAL', 'REAL', name='teen_patti_table_mode'), nullable=False),
        sa.Column('status', sa.Enum('OPEN', 'RUNNING', 'FINISHED', name='teen_patti_table_status'), nullable=False),
        sa.Column('max_players', sa.Integer(), nullable=False),
        sa.Column('boot_amount', sa.BigInteger(), nullable=False),
        sa.Column('turn_seconds', sa.Integer(), nullable=False),
        sa.Column('is_private', sa.Boolean(), nullable=False),
        sa.Column('join_code', sa.String(length=8), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_teen_patti_tables_join_code'), 'teen_patti_tables', ['join_code'], unique=True)

    op.create_table(
        'teen_patti_hand_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('table_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('mode', sa.String(length=10), nullable=False),
        sa.Column('boot', sa.BigInteger(), nullable=False),
        sa.Column('pot', sa.BigInteger(), nullable=False),
        sa.Column('winner_seat', sa.Integer(), nullable=False),
        sa.Column('won', sa.Boolean(), nullable=False),
        sa.Column('payout', sa.BigInteger(), nullable=False),
        sa.Column('hand_json', sa.Text(), nullable=False),
        sa.Column('client_seed', sa.String(length=120), nullable=False),
        sa.Column('nonce', sa.BigInteger(), nullable=False),
        sa.Column('server_seed', sa.String(length=64), nullable=False),
        sa.Column('server_seed_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['table_id'], ['teen_patti_tables.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_teen_patti_hand_history_table_id'), 'teen_patti_hand_history', ['table_id'], unique=False)
    op.create_index(op.f('ix_teen_patti_hand_history_user_id'), 'teen_patti_hand_history', ['user_id'], unique=False)

    # 2. Add Teen Patti entry to games catalog
    op.execute(sa.text("""
        INSERT INTO games (id, name, slug, game_type, description, status, min_bet, max_bet, created_at, updated_at)
        VALUES (
            'a9b8c7d6-e5f4-4321-abcd-0987654321fe',
            'Teen Patti',
            'teen-patti',
            'MULTIPLAYER',
            'Classic 3-card Indian poker with Blind, Chaal, Raise, Side-show, and Showdown.',
            'ACTIVE',
            100,
            100000,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (slug) DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM games WHERE slug = 'teen-patti'"))
    op.drop_index(op.f('ix_teen_patti_hand_history_user_id'), table_name='teen_patti_hand_history')
    op.drop_index(op.f('ix_teen_patti_hand_history_table_id'), table_name='teen_patti_hand_history')
    op.drop_table('teen_patti_hand_history')
    op.drop_index(op.f('ix_teen_patti_tables_join_code'), table_name='teen_patti_tables')
    op.drop_table('teen_patti_tables')
    sa.Enum(name='teen_patti_table_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='teen_patti_table_mode').drop(op.get_bind(), checkfirst=True)
