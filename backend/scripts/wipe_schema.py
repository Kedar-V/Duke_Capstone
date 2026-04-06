"""Wipe the public schema and recreate it empty.

Usage: python wipe_schema.py
"""
import os
import psycopg2


def main():
    db_url = os.environ.get("DATABASE_URL", "")
    dsn = db_url.replace("+psycopg2", "")

    if not dsn:
        print("DATABASE_URL is not set")
        raise SystemExit(1)

    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        cur = conn.cursor()
        cur.execute("DROP SCHEMA IF EXISTS public CASCADE")
        cur.execute("CREATE SCHEMA public")
        cur.close()
        print("OK: public schema wiped and recreated")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
