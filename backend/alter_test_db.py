import psycopg2
db_url = 'postgresql://postgres:liladhar%40bhuan@localhost:5432/gaming_test_db'
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()
try:
    cur.execute("ALTER TYPE withdrawal_status ADD VALUE IF NOT EXISTS 'COMPLETED'")
    print('Added COMPLETED to enum')
except Exception as e:
    print(f"Error: {e}")
finally:
    cur.close()
    conn.close()
