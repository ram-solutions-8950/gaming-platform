"""add_game_id_to_rounds_and_bets

Revision ID: 9f1c2a7e4b11
Revises: 692fc7699888
Create Date: 2026-08-20 00:50:00.000000
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9f1c2a7e4b11"
down_revision: Union[str, Sequence[str], None] = "692fc7699888"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    colour_prediction_game_id = bind.execute(
        sa.text("SELECT id FROM games WHERE slug = :slug LIMIT 1"),
        {"slug": "colour-prediction"},
    ).scalar()

    if colour_prediction_game_id is None:
        colour_prediction_game_id = uuid.uuid4()
        bind.execute(
            sa.text(
                """
                INSERT INTO games (
                    id, name, slug, game_type, description, status, min_bet, max_bet, created_at, updated_at
                )
                VALUES (
                    :id, 'Colour Prediction', 'colour-prediction', 'COLOUR_PREDICTION',
                    'Colour prediction game', 'ACTIVE', 1000, 100000, NOW(), NOW()
                )
                """
            ),
            {"id": colour_prediction_game_id},
        )

    op.add_column("game_rounds", sa.Column("game_id", sa.UUID(), nullable=True))
    op.add_column("game_bets", sa.Column("game_id", sa.UUID(), nullable=True))

    bind.execute(
        sa.text("UPDATE game_rounds SET game_id = :game_id WHERE game_id IS NULL"),
        {"game_id": colour_prediction_game_id},
    )
    bind.execute(
        sa.text("UPDATE game_bets SET game_id = :game_id WHERE game_id IS NULL"),
        {"game_id": colour_prediction_game_id},
    )

    op.alter_column("game_rounds", "game_id", nullable=False)
    op.alter_column("game_bets", "game_id", nullable=False)

    op.create_index(op.f("ix_game_rounds_game_id"), "game_rounds", ["game_id"], unique=False)
    op.create_index(op.f("ix_game_bets_game_id"), "game_bets", ["game_id"], unique=False)

    op.create_foreign_key(
        "fk_game_rounds_game_id_games",
        "game_rounds",
        "games",
        ["game_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_game_bets_game_id_games",
        "game_bets",
        "games",
        ["game_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_game_bets_game_id_games", "game_bets", type_="foreignkey")
    op.drop_constraint("fk_game_rounds_game_id_games", "game_rounds", type_="foreignkey")
    op.drop_index(op.f("ix_game_bets_game_id"), table_name="game_bets")
    op.drop_index(op.f("ix_game_rounds_game_id"), table_name="game_rounds")
    op.drop_column("game_bets", "game_id")
    op.drop_column("game_rounds", "game_id")
