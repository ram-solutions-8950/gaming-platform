# Root conftest - shared fixtures that do NOT require a database
import os
import pytest

# The app migrates to head during startup, but tests manage their own schema
# via Base.metadata.create_all against TEST_DATABASE_URL. Leaving the startup
# migration on would make every TestClient(app) run Alembic against the
# development database instead.
os.environ["AUTO_MIGRATE"] = "false"

from app.config import settings  # noqa: E402

settings.AUTO_MIGRATE = False


@pytest.fixture
def zero_winning_fee(db):
	"""Make payout assertions deterministic despite shared integration DB state."""
	from app.models.fee_configuration import FeeConfiguration

	config = db.query(FeeConfiguration).first()
	if config is None:
		config = FeeConfiguration(
			game_entry_fee_percent=0,
			winning_fee_percent=0,
			withdrawal_fee_percent=0,
		)
		db.add(config)
	else:
		config.winning_fee_percent = 0
		config.game_commission_overrides = None
	db.commit()
	return config
