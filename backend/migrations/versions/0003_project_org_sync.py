"""Sync project org_name from company links

Revision ID: 0003_project_org_sync
Revises: 0002_projects_normalization
Create Date: 2026-03-20
"""

from alembic import op

revision = "0003_project_org_sync"
down_revision = "0002_projects_normalization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO companies (name, industry, website, logo_url)
        SELECT DISTINCT p.org_name, p.org_industry, p.org_website, NULL
        FROM projects p
        WHERE p.deleted_at IS NULL
          AND p.org_name IS NOT NULL
          AND btrim(p.org_name) <> ''
        ON CONFLICT (name) DO NOTHING;
        """
    )

    op.execute(
        """
        INSERT INTO project_companies (project_id, company_id)
        SELECT p.project_id, c.id
        FROM projects p
        JOIN companies c ON c.name = p.org_name
        LEFT JOIN project_companies pc ON pc.project_id = p.project_id
        WHERE p.deleted_at IS NULL
          AND pc.project_id IS NULL
        ON CONFLICT (project_id) DO NOTHING;
        """
    )

    op.execute(
        """
        UPDATE projects p
        SET org_name = c.name
        FROM project_companies pc
        JOIN companies c ON c.id = pc.company_id
        WHERE p.project_id = pc.project_id
          AND p.org_name IS DISTINCT FROM c.name;
        """
    )

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


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_sync_project_org_name_company ON companies")
    op.execute("DROP FUNCTION IF EXISTS sync_project_org_name_from_company()")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_project_org_name_link ON project_companies")
    op.execute("DROP FUNCTION IF EXISTS sync_project_org_name_from_link()")
