"""add_dragon_tiger_support

Revision ID: 14a7ef3d2c9b
Revises: 9f1c2a7e4b11
Create Date: 2026-08-20 01:10:00.000000
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "14a7ef3d2c9b"
down_revision: Union[str, Sequence[str], None] = "9f1c2a7e4b11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("game_rounds", sa.Column("result_data", sa.JSON(), nullable=True))

    op.execute("ALTER TYPE game_prediction ADD VALUE IF NOT EXISTS 'DRAGON'")
    op.execute("ALTER TYPE game_prediction ADD VALUE IF NOT EXISTS 'TIGER'")
    op.execute("ALTER TYPE game_prediction ADD VALUE IF NOT EXISTS 'TIE'")

    bind = op.get_bind()
    dragon_game_id = bind.execute(
        sa.text("SELECT id FROM games WHERE slug = :slug LIMIT 1"),
        {"slug": "dragon-tiger"},
    ).scalar()
    if dragon_game_id is None:
        dragon_game_id = uuid.uuid4()
        bind.execute(
            sa.text(
                """
                INSERT INTO games (
                    id, name, slug, game_type, description, icon_url, status, min_bet, max_bet, config, created_at, updated_at
                )
                VALUES (
                    :id,
                    'Dragon Tiger',
                    'dragon-tiger',
                    'DRAGON_TIGER',
                    'Fast card battle: Dragon vs Tiger.',
                    '🐉',
                    'ACTIVE',
                    1000,
                    200000,
                    CAST(:config AS json),
                    NOW(),
                    NOW()
                )
                """
            ),
            {
                "id": dragon_game_id,
                "config": """{
                  "round_duration_seconds": 60,
                  "betting_duration_seconds": 50,
                  "allowed_bets": {"dragon": true, "tiger": true, "tie": true},
                  "payouts": {"dragon": 1.0, "tiger": 1.0, "tie": 11.0},
                  "deck": {"type": "STANDARD_52_CARD", "cards_per_round": 2}
                }""",
            },
        )


def downgrade() -> None:
    op.drop_column("game_rounds", "result_data")
