"""Add role profile scaffolding with linked student user_id

Revision ID: 0008_role_profiles
Revises: 0007_drop_proj_sec_ind_other
Create Date: 2026-03-20
"""

from alembic import op

revision = "0008_role_profiles"
down_revision = "0007_drop_proj_sec_ind_other"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE students
        ADD COLUMN IF NOT EXISTS user_id BIGINT
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_students_user_id'
            ) THEN
                ALTER TABLE students
                ADD CONSTRAINT fk_students_user_id
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_students_user_id
        ON students(user_id)
        WHERE user_id IS NOT NULL
        """
    )

    # Backfill user_id from matching email addresses when possible.
    op.execute(
        """
        UPDATE students s
        SET user_id = u.id
        FROM users u
        WHERE s.user_id IS NULL
          AND s.email IS NOT NULL
          AND u.email IS NOT NULL
          AND lower(trim(s.email)) = lower(trim(u.email))
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS faculty_profiles (
            user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            department TEXT,
            title TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS faculty_profiles")
    op.execute("DROP INDEX IF EXISTS uq_students_user_id")
    op.execute("ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_students_user_id")
    op.execute("ALTER TABLE students DROP COLUMN IF EXISTS user_id")
