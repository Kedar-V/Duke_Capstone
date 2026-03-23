"""Add sector column to companies

Revision ID: 0006_company_sector
Revises: 0005_move_org_attrs
Create Date: 2026-03-20
"""

from alembic import op

revision = "0006_company_sector"
down_revision = "0005_move_org_attrs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS sector TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS sector")
