"""update_dragon_tiger_payouts

Revision ID: 7c3e9a1f5d02
Revises: 6a38e66b805b
Create Date: 2026-09-03 00:00:00.000000

Dragon/Tiger payout changes from 1x profit (2x total return) to a 2x total-return
multiplier, and Tie from 11x to 10x total return. See DEFAULT_CONFIG in
app/services/game_engines/dragon_tiger.py for the authoritative multiplier semantics
(total return including stake, not profit-only).

Only rewrites rows still holding the old default payouts, so any deliberate admin
customization made via the Games admin panel is left untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7c3e9a1f5d02"
down_revision: Union[str, Sequence[str], None] = "6a38e66b805b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE games
            SET config = (
                jsonb_set(
                    jsonb_set(
                        jsonb_set(config::jsonb, '{payouts,dragon}', '2.0', true),
                        '{payouts,tiger}', '2.0', true
                    ),
                    '{payouts,tie}', '10.0', true
                )
            )::json
            WHERE slug = 'dragon-tiger'
              AND config IS NOT NULL
              AND (config -> 'payouts' ->> 'dragon')::numeric = 1.0
              AND (config -> 'payouts' ->> 'tiger')::numeric = 1.0
              AND (config -> 'payouts' ->> 'tie')::numeric = 11.0
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE games
            SET config = (
                jsonb_set(
                    jsonb_set(
                        jsonb_set(config::jsonb, '{payouts,dragon}', '1.0', true),
                        '{payouts,tiger}', '1.0', true
                    ),
                    '{payouts,tie}', '11.0', true
                )
            )::json
            WHERE slug = 'dragon-tiger'
              AND config IS NOT NULL
              AND (config -> 'payouts' ->> 'dragon')::numeric = 2.0
              AND (config -> 'payouts' ->> 'tiger')::numeric = 2.0
              AND (config -> 'payouts' ->> 'tie')::numeric = 10.0
            """
        )
    )
