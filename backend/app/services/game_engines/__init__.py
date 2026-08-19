from .base import GameEngine
from .colour_prediction import ColourPredictionEngine


_ENGINES: dict[str, GameEngine] = {
    "colour-prediction": ColourPredictionEngine(),
}


def get_engine(slug: str = "colour-prediction") -> GameEngine:
    engine = _ENGINES.get(slug)
    if not engine:
        raise ValueError(f"Unsupported game engine: {slug}")
    return engine
