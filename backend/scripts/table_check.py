"""Check whether a specific table exists in the public schema."""
import sys
import os
from sqlalchemy import create_engine, text

if len(sys.argv) < 2:
    print("Usage: python table_check.py <table_name>", file=sys.stderr)
    sys.exit(1)

table_name = sys.argv[1]
engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
with engine.connect() as conn:
    exists = bool(
        conn.execute(
            text(f"SELECT to_regclass('public.{table_name}') IS NOT NULL")
        ).scalar()
    )
    print(str(exists).lower())
