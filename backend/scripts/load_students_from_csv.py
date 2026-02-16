import csv
import os
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import engine


def load_students(csv_path: str) -> int:
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    if not rows:
        return 0

    inserted = 0
    with engine.begin() as conn:
        for row in rows:
            student_id = row.get("student_id")
            name = row.get("student_name")
            if not student_id or not name:
                continue
            conn.execute(
                text(
                    """
                    insert into students (id, full_name)
                    values (:id, :name)
                    on conflict (id) do update
                    set full_name = excluded.full_name
                    """
                ),
                {"id": int(student_id), "name": name.strip()},
            )
            inserted += 1

    return inserted


def main() -> None:
    csv_path = os.getenv(
        "STUDENTS_CSV",
        str(Path(__file__).resolve().parents[1] / "data" / "students.csv"),
    )
    if not Path(csv_path).exists():
        raise SystemExit(f"CSV not found: {csv_path}")

    inserted = load_students(csv_path)
    print(f"Loaded {inserted} students from {csv_path}.")


if __name__ == "__main__":
    main()
