# Root conftest - shared fixtures that do NOT require a database
import os

# The app migrates to head during startup, but tests manage their own schema
# via Base.metadata.create_all against TEST_DATABASE_URL. Leaving the startup
# migration on would make every TestClient(app) run Alembic against the
# development database instead.
os.environ["AUTO_MIGRATE"] = "false"

from app.config import settings  # noqa: E402

settings.AUTO_MIGRATE = False
