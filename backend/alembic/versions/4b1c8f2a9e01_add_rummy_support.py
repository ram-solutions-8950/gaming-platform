"""add rummy support

Revision ID: 4b1c8f2a9e01
Revises: 15b8ef4d3c9c
Create Date: 2026-08-22 18:25:00.000000

"""
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "4b1c8f2a9e01"
down_revision: Union[str, Sequence[str], None] = "15b8ef4d3c9c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create Enums if not exist
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rummy_table_mode') THEN
                CREATE TYPE rummy_table_mode AS ENUM ('real_money', 'free');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rummy_table_status') THEN
                CREATE TYPE rummy_table_status AS ENUM ('open', 'running', 'finished');
            END IF;
        END$$;
        """
    )

    # 2. Create rummy_tables table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rummy_tables (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(80) NOT NULL DEFAULT 'Deals Rummy',
            mode rummy_table_mode NOT NULL DEFAULT 'free',
            status rummy_table_status NOT NULL DEFAULT 'open',
            max_players INTEGER NOT NULL DEFAULT 2,
            num_deals INTEGER NOT NULL DEFAULT 2,
            entry_fee_paise BIGINT NOT NULL DEFAULT 0,
            pool_limit INTEGER,
            turn_seconds INTEGER NOT NULL DEFAULT 30,
            starting_chips INTEGER NOT NULL DEFAULT 160,
            is_private BOOLEAN NOT NULL DEFAULT FALSE,
            join_code VARCHAR(8) UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE
        );
        CREATE INDEX IF NOT EXISTS ix_rummy_tables_join_code ON rummy_tables (join_code);
        """
    )

    # 3. Create rummy_rounds table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rummy_rounds (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            table_id UUID NOT NULL REFERENCES rummy_tables(id) ON DELETE CASCADE,
            winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            deals_played INTEGER NOT NULL DEFAULT 0,
            result_json TEXT NOT NULL DEFAULT '{}',
            prize_pool_paise BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE
        );
        CREATE INDEX IF NOT EXISTS ix_rummy_rounds_table_id ON rummy_rounds (table_id);
        """
    )

    # 4. Create rummy_matchmaking_queue table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rummy_matchmaking_queue (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            max_players INTEGER NOT NULL DEFAULT 2,
            num_deals INTEGER NOT NULL DEFAULT 2,
            entry_fee_paise BIGINT NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
            table_id UUID,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE
        );
        CREATE INDEX IF NOT EXISTS ix_rummy_matchmaking_queue_user_id ON rummy_matchmaking_queue (user_id);
        """
    )

    # 5. Insert game catalog entry for Rummy if not exists
    rummy_config = json.dumps({
        "min_bet": 1000,
        "max_bet": 100000,
        "house_edge": 0.05,
        "turn_timeout": 30,
        "rules": "13-card Deals & Pool Rummy. Valid show requires at least 2 sequences, including 1 pure sequence.",
    })

    op.execute(
        sa.text(
            """
            INSERT INTO games (id, name, slug, game_type, description, status, min_bet, max_bet, config, created_at, updated_at)
            SELECT 
                gen_random_uuid(),
                'Indian Rummy',
                'rummy',
                'MULTIPLAYER',
                '13-card Indian Deals and Pool Rummy with real-time multiplayer, smart auto-grouping and instant settlement.',
                'ACTIVE',
                0,
                100000,
                CAST(:config AS json),
                NOW(),
                NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM games WHERE slug = 'rummy'
            );
            """
        ).bindparams(config=rummy_config)
    )


def downgrade() -> None:
    op.execute("DELETE FROM games WHERE slug = 'rummy';")
    op.execute("DROP TABLE IF EXISTS rummy_matchmaking_queue CASCADE;")
    op.execute("DROP TABLE IF EXISTS rummy_rounds CASCADE;")
    op.execute("DROP TABLE IF EXISTS rummy_tables CASCADE;")
    op.execute("DROP TYPE IF EXISTS rummy_table_status;")
    op.execute("DROP TYPE IF EXISTS rummy_table_mode;")
