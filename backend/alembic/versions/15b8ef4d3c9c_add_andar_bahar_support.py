"""add_andar_bahar_support

Revision ID: 15b8ef4d3c9c
Revises: 14a7ef3d2c9b
Create Date: 2026-08-22 13:30:00.000000
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "15b8ef4d3c9c"
down_revision: Union[str, Sequence[str], None] = "3a4b59aa8650"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE game_prediction ADD VALUE IF NOT EXISTS 'ANDAR'")
    op.execute("ALTER TYPE game_prediction ADD VALUE IF NOT EXISTS 'BAHAR'")

    bind = op.get_bind()
    ab_game_id = bind.execute(
        sa.text("SELECT id FROM games WHERE slug = :slug LIMIT 1"),
        {"slug": "andar-bahar"},
    ).scalar()
    if ab_game_id is None:
        ab_game_id = uuid.uuid4()
        bind.execute(
            sa.text(
                """
                INSERT INTO games (
                    id, name, slug, game_type, description, icon_url, status, min_bet, max_bet, config, created_at, updated_at
                )
                VALUES (
                    :id,
                    'Andar Bahar',
                    'andar-bahar',
                    'ANDAR_BAHAR',
                    'Traditional Indian card game: Andar vs Bahar.',
                    '🎴',
                    'ACTIVE',
                    1000,
                    500000,
                    CAST(:config AS json),
                    NOW(),
                    NOW()
                )
                """
            ),
            {
                "id": ab_game_id,
                "config": """{
                  "round_duration_seconds": 30,
                  "betting_duration_seconds": 15,
                  "allowed_bets": {"andar": true, "bahar": true},
                  "payouts": {"andar": 0.9, "bahar": 1.0}
                }""",
            },
        )


def downgrade() -> None:
    pass
