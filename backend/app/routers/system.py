"""System router for app version updates, telemetry, and platform metadata."""
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..models.system_settings import SystemSetting
from ..utils.responses import success_response

router = APIRouter(prefix="/system", tags=["System"])

DEFAULT_APP_VERSION_CONFIG = {
    "latest_version": "0.0.86",
    "min_version": "0.0.70",
    "download_url": "/Corona888.apk",
    "release_notes": "Fix balance validation and display in Dragon & Tiger, Roulette, Teen Patti, and slots.",
    "force_update": False,
}


@router.get("/app-version")
def get_app_version(db: Session = Depends(get_db)):
    """Return latest released APK version for in-app update prompts."""
    row = db.query(SystemSetting).filter(SystemSetting.key == "app_version_config").first()
    if not row or not row.value:
        return success_response(DEFAULT_APP_VERSION_CONFIG)
    data = DEFAULT_APP_VERSION_CONFIG.copy()
    data.update(row.value)
    return success_response(data)
