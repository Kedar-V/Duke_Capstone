"""Move org-level project attributes to companies

Revision ID: 0005_move_org_attrs
Revises: 0004_drop_project_org
Create Date: 2026-03-20
"""

from alembic import op

revision = "0005_move_org_attrs"
down_revision = "0004_drop_project_org"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry_other TEXT")

    op.execute(
        """
        WITH ranked AS (
          SELECT
            pc.company_id,
            p.org_industry,
            p.org_industry_other,
            p.org_website,
            row_number() OVER (
              PARTITION BY pc.company_id
              ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST, p.project_id DESC
            ) AS rn
          FROM projects p
          JOIN project_companies pc ON pc.project_id = p.project_id
          WHERE p.deleted_at IS NULL
        )
        UPDATE companies c
        SET
          industry = COALESCE(c.industry, r.org_industry),
          industry_other = COALESCE(c.industry_other, r.org_industry_other),
          website = COALESCE(c.website, r.org_website)
        FROM ranked r
        WHERE r.rn = 1
          AND c.id = r.company_id;
        """
    )

    op.execute("DROP VIEW IF EXISTS public.client_intake_forms")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS org_industry")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS org_industry_other")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS org_website")
    op.execute("CREATE VIEW public.client_intake_forms AS SELECT * FROM public.projects")


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.client_intake_forms")
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_industry TEXT")
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_industry_other TEXT")
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_website TEXT")

    op.execute(
        """
        UPDATE projects p
        SET
          org_industry = c.industry,
          org_industry_other = c.industry_other,
          org_website = c.website
        FROM project_companies pc
        JOIN companies c ON c.id = pc.company_id
        WHERE p.project_id = pc.project_id;
        """
    )

    op.execute("CREATE VIEW public.client_intake_forms AS SELECT * FROM public.projects")
