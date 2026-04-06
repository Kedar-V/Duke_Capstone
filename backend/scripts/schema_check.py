"""Check the current schema state for deploy-time migration decisions."""
from sqlalchemy import create_engine, text
import os

engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
with engine.connect() as conn:
    has_alembic = bool(
        conn.execute(
            text("SELECT to_regclass('public.alembic_version') IS NOT NULL")
        ).scalar()
    )
    has_projects = bool(
        conn.execute(
            text("SELECT to_regclass('public.projects') IS NOT NULL")
        ).scalar()
    )
    has_client = bool(
        conn.execute(
            text("SELECT to_regclass('public.client_intake_forms') IS NOT NULL")
        ).scalar()
    )
    rev = ""
    if has_alembic:
        rev = (
            conn.execute(
                text(
                    "SELECT coalesce("
                    "(SELECT version_num FROM alembic_version LIMIT 1), '')"
                )
            ).scalar()
            or ""
        )

print(
    f"{str(has_alembic).lower()}|{str(has_projects).lower()}"
    f"|{str(has_client).lower()}|{rev}"
)
