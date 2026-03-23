"""Drop project sector and company industry_other

Revision ID: 0007_drop_proj_sec_ind_other
Revises: 0006_company_sector
Create Date: 2026-03-20
"""

from alembic import op

revision = "0007_drop_proj_sec_ind_other"
down_revision = "0006_company_sector"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.client_intake_forms")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS project_sector")
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS industry_other")
    op.execute("CREATE VIEW public.client_intake_forms AS SELECT * FROM public.projects")


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.client_intake_forms")
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_sector TEXT")
    op.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry_other TEXT")
    op.execute("CREATE VIEW public.client_intake_forms AS SELECT * FROM public.projects")
