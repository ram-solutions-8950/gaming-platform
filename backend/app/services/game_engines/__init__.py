from .base import GameEngine
from .colour_prediction import ColourPredictionEngine
from .dragon_tiger import DragonTigerEngine


_ENGINES: dict[str, GameEngine] = {
    "colour-prediction": ColourPredictionEngine(),
    "dragon-tiger": DragonTigerEngine(),
}


def get_engine(slug: str = "colour-prediction") -> GameEngine:
    engine = _ENGINES.get(slug)
    if not engine:
        raise ValueError(f"Unsupported game engine: {slug}")
    return engine


def list_engines() -> list[GameEngine]:
    return list(_ENGINES.values())
