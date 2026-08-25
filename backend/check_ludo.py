from app.database import engine
from sqlalchemy import text

MATCH_ID = "d8f44441-7039-4ebf-8c97-c6abf1abc5c0"

with engine.connect() as conn:
    result = conn.execute(
        text("""
            SELECT
                id,
                user_id,
                color,
                consecutive_timeouts
            FROM ludo_players
            WHERE match_id = :match_id
            ORDER BY seat_index
        """),
        {"match_id": MATCH_ID},
    )

    print("\nPLAYERS:")
    for row in result:
        print(row)

    result = conn.execute(
        text("""
            SELECT
                id,
                status,
                current_turn_color,
                turn_started_at,
                turn_timeout_seconds,
                version
            FROM ludo_matches
            WHERE id = :match_id
        """),
        {"match_id": MATCH_ID},
    )

    print("\nMATCH:")
    for row in result:
        print(row)