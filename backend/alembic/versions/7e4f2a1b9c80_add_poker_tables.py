"""add_poker_tables

Revision ID: 7e4f2a1b9c80
Revises: 6d3e2f1a8b90
Create Date: 2026-08-23 01:31:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '7e4f2a1b9c80'
down_revision = '6d3e2f1a8b90'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'poker_tables',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_practice', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('small_blind', sa.Integer(), nullable=False),
        sa.Column('big_blind', sa.Integer(), nullable=False),
        sa.Column('min_buy_in', sa.Integer(), nullable=False),
        sa.Column('max_buy_in', sa.Integer(), nullable=False),
        sa.Column('max_players', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'poker_hands',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('table_id', sa.String(), sa.ForeignKey('poker_tables.id'), nullable=False),
        sa.Column('dealer_seat_idx', sa.Integer(), nullable=False),
        sa.Column('small_blind', sa.Integer(), nullable=False),
        sa.Column('big_blind', sa.Integer(), nullable=False),
        sa.Column('community_cards', sa.JSON(), nullable=False),
        sa.Column('pot', sa.Integer(), nullable=False),
        sa.Column('winners_summary', sa.JSON(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'poker_players',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('table_id', sa.String(), sa.ForeignKey('poker_tables.id'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('seat_index', sa.Integer(), nullable=False),
        sa.Column('stack', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'poker_actions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hand_id', sa.String(), sa.ForeignKey('poker_hands.id'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('sequence_num', sa.Integer(), nullable=False),
        sa.Column('action_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.execute(sa.text("""
        INSERT INTO games (id, name, slug, game_type, description, status, min_bet, max_bet, created_at, updated_at)
        VALUES (
            'c2b3a4d5-e6f7-8901-abcd-9876543210fe',
            'Texas Holdem Poker',
            'poker',
            'POKER',
            'Classic Texas Holdem multiplayer cash poker tables with real-time community cards & showdowns.',
            'ACTIVE',
            100,
            1000000,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (slug) DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
    """))

def downgrade() -> None:
    op.execute(sa.text("DELETE FROM games WHERE slug = 'poker'"))
    op.drop_table('poker_actions')
    op.drop_table('poker_players')
    op.drop_table('poker_hands')
    op.drop_table('poker_tables')
