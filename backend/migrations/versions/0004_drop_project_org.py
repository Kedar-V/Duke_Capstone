"""Drop projects.org_name and use companies as sole organization source

Revision ID: 0004_drop_project_org
Revises: 0003_project_org_sync
Create Date: 2026-03-20
"""

from alembic import op

revision = "0004_drop_project_org"
down_revision = "0003_project_org_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_sync_project_org_name_company ON companies")
    op.execute("DROP FUNCTION IF EXISTS sync_project_org_name_from_company()")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_project_org_name_link ON project_companies")
    op.execute("DROP FUNCTION IF EXISTS sync_project_org_name_from_link()")

    op.execute("DROP VIEW IF EXISTS public.client_intake_forms")
    op.execute("DROP INDEX IF EXISTS idx_projects_org_name")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS org_name")

    op.execute(
        """
        CREATE VIEW public.client_intake_forms AS
        SELECT * FROM public.projects;
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.client_intake_forms")

    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_name TEXT")
    op.execute(
        """
        UPDATE projects p
        SET org_name = c.name
        FROM project_companies pc
        JOIN companies c ON c.id = pc.company_id
        WHERE p.project_id = pc.project_id
          AND (p.org_name IS NULL OR btrim(p.org_name) = '');
        """
    )
    op.execute("UPDATE projects SET org_name = 'Unknown organization' WHERE org_name IS NULL OR btrim(org_name) = ''")
    op.execute("ALTER TABLE projects ALTER COLUMN org_name SET NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS idx_projects_org_name ON projects(org_name)")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION sync_project_org_name_from_link()
        RETURNS trigger AS $$
        BEGIN
          UPDATE projects p
          SET org_name = c.name
          FROM companies c
          WHERE p.project_id = NEW.project_id
            AND c.id = NEW.company_id
            AND p.org_name IS DISTINCT FROM c.name;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_sync_project_org_name_link ON project_companies;
        CREATE TRIGGER trg_sync_project_org_name_link
        AFTER INSERT OR UPDATE OF company_id ON project_companies
        FOR EACH ROW
        EXECUTE FUNCTION sync_project_org_name_from_link();
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION sync_project_org_name_from_company()
        RETURNS trigger AS $$
        BEGIN
          UPDATE projects p
          SET org_name = NEW.name
          FROM project_companies pc
          WHERE pc.company_id = NEW.id
            AND p.project_id = pc.project_id
            AND p.org_name IS DISTINCT FROM NEW.name;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_sync_project_org_name_company ON companies;
        CREATE TRIGGER trg_sync_project_org_name_company
        AFTER UPDATE OF name ON companies
        FOR EACH ROW
        EXECUTE FUNCTION sync_project_org_name_from_company();
        """
    )

    op.execute(
        """
        CREATE VIEW public.client_intake_forms AS
        SELECT * FROM public.projects;
        """
    )
