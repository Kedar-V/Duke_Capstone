"""Print diagnostic info about the current database schema."""
import os
from sqlalchemy import create_engine, text

engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
with engine.connect() as conn:
    print(
        "alembic_version:",
        conn.execute(
            text(
                "SELECT coalesce("
                "(SELECT version_num FROM alembic_version LIMIT 1), '')"
            )
        ).scalar(),
    )
    print(
        "projects:",
        conn.execute(text("SELECT to_regclass('public.projects')")).scalar(),
    )
    print(
        "project_comments:",
        conn.execute(
            text("SELECT to_regclass('public.project_comments')")
        ).scalar(),
    )
