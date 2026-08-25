from sqlalchemy.orm import Session
from typing import Optional, List
import uuid
from datetime import datetime, timezone

from ...models.ludo import (
    LudoMatch,
    LudoPlayer,
    LudoToken,
    LudoMatchStatus,
    LudoColor,
)


def get_match_with_lock(
    db: Session,
    match_id: uuid.UUID,
) -> Optional[LudoMatch]:
    return (
        db.query(LudoMatch)
        .filter(LudoMatch.id == match_id)
        .with_for_update()
        .first()
    )


def get_match(
    db: Session,
    match_id: uuid.UUID,
) -> Optional[LudoMatch]:
    return (
        db.query(LudoMatch)
        .filter(LudoMatch.id == match_id)
        .first()
    )


def create_initial_tokens(
    db: Session,
    player_id: uuid.UUID,
) -> List[LudoToken]:

    tokens = []

    for i in range(4):
        token = LudoToken(
            player_id=player_id,
            token_index=i,
            position=-1,
            is_home=False,
        )

        db.add(token)
        tokens.append(token)

    return tokens


def next_turn(match: LudoMatch) -> None:
    """
    Move the game to the next active player.

    Every time a new turn starts, reset the turn timer.
    """

    order = [
        LudoColor.RED,
        LudoColor.GREEN,
        LudoColor.YELLOW,
        LudoColor.BLUE,
    ]

    current_idx = (
        order.index(match.current_turn_color)
        if match.current_turn_color in order
        else -1
    )

    for i in range(1, 5):

        next_color = order[
            (current_idx + i) % 4
        ]

        player = next(
            (
                p
                for p in match.players
                if p.color == next_color
            ),
            None,
        )

        # Player exists and has not finished
        if player and player.rank is None:

            match.current_turn_color = next_color

            # IMPORTANT:
            # Reset timer for the new player's turn.
            match.turn_started_at = datetime.now(
                timezone.utc
            )

            # Reset stale dice state.
            match.last_dice_roll = None

            return

    # No active players remain.
    match.status = LudoMatchStatus.COMPLETED

    match.current_turn_color = None

    match.turn_started_at = None

    match.completed_at = datetime.now(
        timezone.utc
    )