"""Add project_id, soft delete, and audit log

Revision ID: 0001_project_id_soft_delete
Revises: None
Create Date: 2026-03-18
"""
from alembic import op

revision = "0001_project_id_soft_delete"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE client_intake_forms ADD COLUMN IF NOT EXISTS project_id bigserial")
    op.execute("ALTER TABLE client_intake_forms ADD COLUMN IF NOT EXISTS slug text")
    op.execute("ALTER TABLE client_intake_forms ADD COLUMN IF NOT EXISTS deleted_at timestamptz")
    op.execute("UPDATE client_intake_forms SET project_id = nextval('client_intake_forms_project_id_seq') WHERE project_id IS NULL")
    op.execute(
        "UPDATE client_intake_forms SET slug = lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL"
    )
    op.execute("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_org_name_fkey")
    op.execute("ALTER TABLE ranking_items DROP CONSTRAINT IF EXISTS ranking_items_org_name_fkey")
    op.execute("ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_org_name_fkey")
    op.execute("ALTER TABLE client_intake_forms DROP CONSTRAINT IF EXISTS client_intake_forms_pkey")
    op.execute("ALTER TABLE client_intake_forms ADD CONSTRAINT client_intake_forms_pkey PRIMARY KEY (project_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_client_intake_org_name ON client_intake_forms(org_name)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_client_intake_slug ON client_intake_forms(slug)")

    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz")

    op.execute("ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS project_id bigint")
    op.execute("UPDATE cart_items ci SET project_id = p.project_id FROM client_intake_forms p WHERE ci.project_id IS NULL AND ci.org_name = p.org_name")
    op.execute("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_pkey")
    op.execute("ALTER TABLE cart_items ADD CONSTRAINT cart_items_pkey PRIMARY KEY (cart_id, project_id)")
    op.execute("ALTER TABLE cart_items ADD CONSTRAINT cart_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES client_intake_forms(project_id) ON DELETE CASCADE")
    op.execute("ALTER TABLE cart_items DROP COLUMN IF EXISTS org_name CASCADE")

    op.execute("ALTER TABLE ranking_items ADD COLUMN IF NOT EXISTS project_id bigint")
    op.execute("UPDATE ranking_items ri SET project_id = p.project_id FROM client_intake_forms p WHERE ri.project_id IS NULL AND ri.org_name = p.org_name")
    op.execute("ALTER TABLE ranking_items DROP CONSTRAINT IF EXISTS ranking_items_pkey")
    op.execute("ALTER TABLE ranking_items DROP CONSTRAINT IF EXISTS ranking_items_org_name_fkey")
    op.execute("ALTER TABLE ranking_items ADD CONSTRAINT ranking_items_pkey PRIMARY KEY (ranking_id, project_id)")
    op.execute("ALTER TABLE ranking_items ADD CONSTRAINT ranking_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES client_intake_forms(project_id) ON DELETE CASCADE")
    op.execute("ALTER TABLE ranking_items DROP COLUMN IF EXISTS org_name CASCADE")

    op.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS project_id bigint")
    op.execute("UPDATE ratings r SET project_id = p.project_id FROM client_intake_forms p WHERE r.project_id IS NULL AND r.org_name = p.org_name")
    op.execute("ALTER TABLE ratings DROP CONSTRAINT IF EXISTS uq_ratings_user_project")
    op.execute("ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_org_name_fkey")
    op.execute("ALTER TABLE ratings ADD CONSTRAINT uq_ratings_user_project UNIQUE (user_id, project_id)")
    op.execute("ALTER TABLE ratings ADD CONSTRAINT ratings_project_id_fkey FOREIGN KEY (project_id) REFERENCES client_intake_forms(project_id) ON DELETE CASCADE")
    op.execute("ALTER TABLE ratings DROP COLUMN IF EXISTS org_name CASCADE")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_audit_log (
          id bigserial primary key,
          admin_user_id bigint not null references users(id) on delete cascade,
          action text not null,
          target_type text not null,
          target_id text,
          details jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_audit_log")
    op.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS org_name text")
    op.execute("ALTER TABLE ranking_items ADD COLUMN IF NOT EXISTS org_name text")
    op.execute("ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS org_name text")
    op.execute("ALTER TABLE client_intake_forms DROP COLUMN IF EXISTS deleted_at")
    op.execute("ALTER TABLE client_intake_forms DROP COLUMN IF EXISTS slug")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS deleted_at")
    op.execute("ALTER TABLE client_intake_forms DROP CONSTRAINT IF EXISTS uq_client_intake_org")
