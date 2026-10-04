from app.app_version import LATEST_APP_VERSION
from app.models.system_settings import SystemSetting


def test_public_app_version_never_uses_stale_database_release(client, db):
    db.add(SystemSetting(
        key="app_version_config",
        value={
            "latest_version": "0.0.86",
            "min_version": "0.0.70",
            "download_url": "/Corona888.apk",
            "release_notes": "Older release",
            "force_update": False,
        },
        description="Version update regression test",
    ))
    db.commit()

    response = client.get("/api/v1/system/app-version")

    assert response.status_code == 200
    assert response.json()["data"]["latest_version"] == LATEST_APP_VERSION