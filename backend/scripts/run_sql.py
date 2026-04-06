"""Execute a SQL file against the database using a raw psycopg2 connection.

Usage: python run_sql.py <path_to_sql_file>

This bypasses SQLAlchemy's text() which cannot handle multi-statement SQL.
"""
import sys
import os
import psycopg2


def main():
    if len(sys.argv) < 2:
        print("Usage: python run_sql.py <sql_file_path>", file=sys.stderr)
        sys.exit(1)

    sql_path = sys.argv[1]
    db_url = os.environ.get("DATABASE_URL", "")

    # Convert SQLAlchemy-style URL to psycopg2-style
    # e.g. postgresql+psycopg2://user:pass@host/db -> postgresql://user:pass@host/db
    dsn = db_url.replace("+psycopg2", "")

    if not dsn:
        print("DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)

    with open(sql_path, "r") as f:
        sql = f.read()

    conn = psycopg2.connect(dsn)
    conn.autocommit = True  # Let the SQL file manage its own transactions
    try:
        cur = conn.cursor()
        cur.execute(sql)
        cur.close()
        print(f"OK: {sql_path} executed successfully")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
