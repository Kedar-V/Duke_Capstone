"""Sync production schema for assignment rules, project status, and comments.

Revision ID: 0009_prod_schema_sync
Revises: 0008_role_profiles
Create Date: 2026-04-03
"""

from alembic import op

revision = "0009_prod_schema_sync"
down_revision = "0008_role_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS project_status TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
        """
    )
    op.execute(
        """
        ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ
        """
    )
    op.execute(
        """
        UPDATE projects
        SET project_status = 'published'
        WHERE project_status IS NULL
        """
    )
    op.execute(
        """
        UPDATE projects
        SET project_status = 'published'
        WHERE lower(trim(project_status)) NOT IN ('draft', 'published', 'archived')
        """
    )
    op.execute(
        """
        ALTER TABLE projects
        ALTER COLUMN project_status SET DEFAULT 'draft'
        """
    )
    op.execute(
        """
        ALTER TABLE projects
        ALTER COLUMN project_status SET NOT NULL
        """
    )

    op.execute(
        """
        ALTER TABLE cohorts
        ADD COLUMN IF NOT EXISTS rankings_editable_until TIMESTAMPTZ
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS assignment_rule_configs (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          cohort_id BIGINT REFERENCES cohorts(id) ON DELETE SET NULL,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          team_size INTEGER NOT NULL DEFAULT 4 CHECK (team_size BETWEEN 2 AND 8),
          enforce_same_cohort BOOLEAN NOT NULL DEFAULT TRUE,
          hard_avoid BOOLEAN NOT NULL DEFAULT TRUE,
          max_low_preference_per_team INTEGER NOT NULL DEFAULT 1 CHECK (max_low_preference_per_team BETWEEN 0 AND 8),
          weight_project_preference INTEGER NOT NULL DEFAULT 55 CHECK (weight_project_preference BETWEEN 0 AND 100),
          weight_project_rating INTEGER NOT NULL DEFAULT 15 CHECK (weight_project_rating BETWEEN 0 AND 100),
          weight_mutual_want INTEGER NOT NULL DEFAULT 25 CHECK (weight_mutual_want BETWEEN 0 AND 100),
          weight_fairness INTEGER NOT NULL DEFAULT 10 CHECK (weight_fairness BETWEEN 0 AND 100),
          weight_skill_balance INTEGER NOT NULL DEFAULT 10 CHECK (weight_skill_balance BETWEEN 0 AND 100),
          penalty_avoid INTEGER NOT NULL DEFAULT 100 CHECK (penalty_avoid BETWEEN 0 AND 1000),
          notes TEXT,
          extra_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS assignment_preview_runs (
          id BIGSERIAL PRIMARY KEY,
          rule_config_id BIGINT NOT NULL REFERENCES assignment_rule_configs(id) ON DELETE CASCADE,
          cohort_id BIGINT REFERENCES cohorts(id) ON DELETE SET NULL,
          initiated_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          input_fingerprint TEXT NOT NULL,
          preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          quality_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          integrity_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS assignment_saved_runs (
          id BIGSERIAL PRIMARY KEY,
          rule_config_id BIGINT NOT NULL REFERENCES assignment_rule_configs(id) ON DELETE CASCADE,
          cohort_id BIGINT REFERENCES cohorts(id) ON DELETE SET NULL,
          source_preview_run_id BIGINT REFERENCES assignment_preview_runs(id) ON DELETE SET NULL,
          saved_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          input_fingerprint TEXT,
          notes TEXT,
          preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        """
        ALTER TABLE assignment_rule_configs
        ADD COLUMN IF NOT EXISTS weight_project_rating INTEGER NOT NULL DEFAULT 15
        """
    )

    op.execute(
        """
        INSERT INTO assignment_rule_configs (
          name,
          cohort_id,
          is_active,
          team_size,
          enforce_same_cohort,
          hard_avoid,
          max_low_preference_per_team,
          weight_project_preference,
          weight_project_rating,
          weight_mutual_want,
          weight_fairness,
          weight_skill_balance,
          penalty_avoid,
          notes,
          extra_rules
        )
        SELECT
          'Default Assignment Rules',
          NULL,
          TRUE,
          4,
          TRUE,
          TRUE,
          1,
          55,
          15,
          25,
          10,
          10,
          100,
          'Seeded default config',
          '{}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM assignment_rule_configs)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_comments (
          id BIGSERIAL PRIMARY KEY,
          project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          comment TEXT NOT NULL,
          is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
          resolved_at TIMESTAMPTZ,
          resolved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS project_comments")
    op.execute("DROP TABLE IF EXISTS assignment_saved_runs")
    op.execute("DROP TABLE IF EXISTS assignment_preview_runs")
    op.execute("DROP TABLE IF EXISTS assignment_rule_configs")
    op.execute("ALTER TABLE cohorts DROP COLUMN IF EXISTS rankings_editable_until")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS archived_at")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS published_at")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS project_status")
