import os
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.crypto import CryptoError, encrypt_teammate_choice
from app.db import engine


MIGRATION_SQL = [
    "ALTER TABLE teammate_preferences ADD COLUMN IF NOT EXISTS student_id_hash text",
    "ALTER TABLE teammate_preferences ADD COLUMN IF NOT EXISTS payload_ciphertext text",
    "ALTER TABLE teammate_preferences ALTER COLUMN student_id DROP NOT NULL",
    "ALTER TABLE teammate_preferences ALTER COLUMN preference DROP NOT NULL",
    "ALTER TABLE teammate_preferences DROP CONSTRAINT IF EXISTS uq_teammate_pref_user_student",
    "ALTER TABLE teammate_preferences ADD CONSTRAINT uq_teammate_pref_user_student_hash UNIQUE (user_id, student_id_hash)",
]


def run_migration(conn) -> None:
    for stmt in MIGRATION_SQL:
        conn.execute(text(stmt))


def backfill(conn) -> int:
    rows = conn.execute(
        text(
            """
            select id, student_id, preference
            from teammate_preferences
            where payload_ciphertext is null
              and student_id is not null
              and preference is not null
            """
        )
    ).fetchall()

    updated = 0
    for row in rows:
        token, student_hash = encrypt_teammate_choice(
            int(row.student_id), row.preference
        )
        conn.execute(
            text(
                """
                update teammate_preferences
                set payload_ciphertext = :token,
                    student_id_hash = :student_hash,
                    student_id = null,
                    preference = null
                where id = :id
                """
            ),
            {
                "token": token,
                "student_hash": student_hash,
                "id": row.id,
            },
        )
        updated += 1

    return updated


def main() -> None:
    if not os.getenv("TEAMMATE_PREFS_KEY"):
        raise SystemExit("TEAMMATE_PREFS_KEY must be set before running backfill")

    try:
        with engine.begin() as conn:
            run_migration(conn)
            updated = backfill(conn)
    except CryptoError as exc:
        raise SystemExit(str(exc)) from exc

    print(f"Backfill complete. Encrypted {updated} rows.")


if __name__ == "__main__":
    main()
