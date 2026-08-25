import secrets

def roll_dice() -> int:
    return secrets.randbelow(6) + 1
