"""Normalize project table naming and org uniqueness

Revision ID: 0002_projects_normalization
Revises: 0001_project_id_soft_delete
Create Date: 2026-03-20
"""

from alembic import op

revision = "0002_projects_normalization"
down_revision = "0001_project_id_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.projects') IS NULL
             AND to_regclass('public.client_intake_forms') IS NOT NULL THEN
            ALTER TABLE public.client_intake_forms RENAME TO projects;
          END IF;
        END $$;
        """
    )

    op.execute("DROP INDEX IF EXISTS idx_client_intake_org_name")
    op.execute("DROP INDEX IF EXISTS idx_projects_org_name")
    op.execute("ALTER TABLE projects DROP CONSTRAINT IF EXISTS client_intake_forms_org_name_key")
    op.execute("ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_org_name_key")
    op.execute("CREATE INDEX IF NOT EXISTS idx_projects_org_name ON projects(org_name)")

    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.client_intake_forms') IS NULL THEN
            CREATE VIEW public.client_intake_forms AS
            SELECT * FROM public.projects;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.client_intake_forms")

    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.client_intake_forms') IS NULL
             AND to_regclass('public.projects') IS NOT NULL THEN
            ALTER TABLE public.projects RENAME TO client_intake_forms;
          END IF;
        END $$;
        """
    )

    op.execute("DROP INDEX IF EXISTS idx_projects_org_name")
    op.execute(
        "ALTER TABLE client_intake_forms ADD CONSTRAINT client_intake_forms_org_name_key UNIQUE (org_name)"
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_client_intake_org_name ON client_intake_forms(org_name)")
