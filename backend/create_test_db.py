import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
db_url = os.getenv("TEST_DATABASE_URL")
if not db_url:
    print("TEST_DATABASE_URL not found")
    exit(1)

# Connect to the default postgres database to create the test db
# e.g. postgresql://postgres:password@localhost:5432/gaming_test_db -> .../postgres
import urllib.parse
parsed = urllib.parse.urlparse(db_url)
default_url = parsed._replace(path="/postgres").geturl()
db_name = parsed.path.lstrip("/")

print(f"Connecting to {default_url} to ensure {db_name} exists...")

try:
    conn = psycopg2.connect(default_url)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{db_name}'")
    exists = cur.fetchone()
    if not exists:
        print(f"Creating database {db_name}...")
        cur.execute(f"CREATE DATABASE {db_name}")
        print("Done.")
    else:
        print(f"Database {db_name} already exists.")
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
