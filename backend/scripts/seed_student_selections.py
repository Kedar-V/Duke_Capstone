import argparse
import random
import sys
from collections import defaultdict
from pathlib import Path

from sqlalchemy import text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.crypto import encrypt_teammate_choice
from app.db import engine


def _ensure_students_from_users(conn) -> int:
    rows = conn.execute(
        text(
            """
            select id, email, coalesce(nullif(display_name, ''), split_part(email, '@', 1)) as name, cohort_id
            from users
            where deleted_at is null
              and role = 'student'
              and email is not null
            """
        )
    ).mappings().all()

    inserted = 0
    for row in rows:
        result = conn.execute(
            text(
                """
                insert into students (full_name, email, program, cohort_id)
                values (:full_name, :email, null, :cohort_id)
                on conflict (email) do update
                set full_name = excluded.full_name,
                    cohort_id = excluded.cohort_id
                """
            ),
            {
                "full_name": str(row["name"]),
                "email": str(row["email"]).lower(),
                "cohort_id": row["cohort_id"],
            },
        )
        if result.rowcount:
            inserted += 1
    return inserted


def seed_student_selections(
    seed: int,
    submitted_ratio: float,
    *,
    submit_all: bool,
    ignore_cohort: bool,
) -> dict:
    metrics = {
        "students_seeded": 0,
        "ratings_upserted": 0,
        "cart_items_upserted": 0,
        "ranking_items_upserted": 0,
        "teammate_prefs_upserted": 0,
    }

    with engine.begin() as conn:
        _ensure_students_from_users(conn)

        users = conn.execute(
            text(
                """
                select id, email, cohort_id
                from users
                where deleted_at is null
                  and role = 'student'
                order by id asc
                """
            )
        ).mappings().all()

        if not users:
            return metrics

        projects_by_cohort = defaultdict(list)
        for row in conn.execute(
            text(
                """
                select project_id, cohort_id
                from client_intake_forms
                where deleted_at is null
                order by project_id asc
                """
            )
        ).mappings().all():
            projects_by_cohort[row["cohort_id"]].append(int(row["project_id"]))

        student_rows = conn.execute(
            text(
                """
                select id, email, cohort_id
                from students
                where email is not null
                """
            )
        ).mappings().all()
        students_by_cohort = defaultdict(list)
        student_id_by_email = {}
        for row in student_rows:
            email = str(row["email"]).lower()
            student_id_by_email[email] = int(row["id"])
            students_by_cohort[row["cohort_id"]].append(int(row["id"]))

        for user in users:
            user_id = int(user["id"])
            cohort_id = user["cohort_id"]
            user_email = str(user["email"]).lower() if user["email"] else ""

            if ignore_cohort:
                available_projects = []
                for cohort_projects in projects_by_cohort.values():
                    available_projects.extend(cohort_projects)
                available_projects = sorted(set(available_projects))
            else:
                available_projects = list(projects_by_cohort.get(cohort_id, []))
                if not available_projects:
                    available_projects = list(projects_by_cohort.get(None, []))
            if not available_projects:
                continue

            rng = random.Random(seed + user_id)
            sample_count = min(10, len(available_projects))
            selected_projects = rng.sample(available_projects, sample_count)

            cart_row = conn.execute(
                text(
                    """
                    insert into carts (user_id, status)
                    values (:user_id, 'open')
                    on conflict do nothing
                    returning id
                    """
                ),
                {"user_id": user_id},
            ).mappings().first()

            if cart_row:
                cart_id = int(cart_row["id"])
            else:
                cart_id = int(
                    conn.execute(
                        text(
                            """
                            select id
                            from carts
                            where user_id = :user_id
                              and status = 'open'
                            order by id desc
                            limit 1
                            """
                        ),
                        {"user_id": user_id},
                    ).scalar_one()
                )

            ranking_row = conn.execute(
                text(
                    """
                    insert into rankings (user_id, is_submitted, submitted_at)
                    values (:user_id, false, null)
                    on conflict (user_id) do update
                    set updated_at = now(),
                        is_submitted = false,
                        submitted_at = null
                    returning id
                    """
                ),
                {"user_id": user_id},
            ).mappings().first()
            ranking_id = int(ranking_row["id"])

            conn.execute(text("delete from cart_items where cart_id = :cart_id"), {"cart_id": cart_id})
            conn.execute(
                text("delete from ranking_items where ranking_id = :ranking_id"),
                {"ranking_id": ranking_id},
            )

            for rank, project_id in enumerate(selected_projects, start=1):
                rating_value = rng.randint(6, 10)
                conn.execute(
                    text(
                        """
                        insert into ratings (user_id, project_id, rating)
                        values (:user_id, :project_id, :rating)
                        on conflict (user_id, project_id) do update
                        set rating = excluded.rating,
                            updated_at = now()
                        """
                    ),
                    {"user_id": user_id, "project_id": project_id, "rating": rating_value},
                )
                metrics["ratings_upserted"] += 1

                conn.execute(
                    text(
                        """
                        insert into cart_items (cart_id, project_id)
                        values (:cart_id, :project_id)
                        on conflict (cart_id, project_id) do nothing
                        """
                    ),
                    {"cart_id": cart_id, "project_id": project_id},
                )
                metrics["cart_items_upserted"] += 1

                conn.execute(
                    text(
                        """
                        insert into ranking_items (ranking_id, project_id, rank)
                        values (:ranking_id, :project_id, :rank)
                        on conflict (ranking_id, project_id) do update
                        set rank = excluded.rank
                        """
                    ),
                    {"ranking_id": ranking_id, "project_id": project_id, "rank": rank},
                )
                metrics["ranking_items_upserted"] += 1

            mark_submitted = (sample_count == 10 and rng.random() < submitted_ratio) or (
                submit_all and sample_count == 10
            )
            conn.execute(
                text(
                    """
                    update rankings
                    set is_submitted = :is_submitted,
                        submitted_at = case when :is_submitted then now() else null end,
                        updated_at = now()
                    where id = :ranking_id
                    """
                ),
                {"ranking_id": ranking_id, "is_submitted": mark_submitted},
            )

            teammate_pool = [sid for sid in students_by_cohort.get(cohort_id, []) if sid != student_id_by_email.get(user_email)]
            rng.shuffle(teammate_pool)
            want_ids = teammate_pool[: min(3, len(teammate_pool))]
            remaining = [sid for sid in teammate_pool if sid not in want_ids]
            avoid_ids = remaining[: min(2, len(remaining))]

            conn.execute(
                text("delete from teammate_preferences where user_id = :user_id"),
                {"user_id": user_id},
            )

            for sid in want_ids:
                comment = "Seeded want preference"
                ciphertext, student_hash = encrypt_teammate_choice(sid, "want", comment)
                conn.execute(
                    text(
                        """
                        insert into teammate_preferences (
                          user_id,
                          student_id_hash,
                          payload_ciphertext,
                          student_id,
                          preference
                        )
                        values (:user_id, :student_id_hash, :payload_ciphertext, :student_id, 'want')
                        on conflict (user_id, student_id_hash) do update
                        set payload_ciphertext = excluded.payload_ciphertext,
                            student_id = excluded.student_id,
                            preference = excluded.preference
                        """
                    ),
                    {
                        "user_id": user_id,
                        "student_id_hash": student_hash,
                        "payload_ciphertext": ciphertext,
                        "student_id": sid,
                    },
                )
                metrics["teammate_prefs_upserted"] += 1

            for sid in avoid_ids:
                comment = "Seeded avoid preference"
                ciphertext, student_hash = encrypt_teammate_choice(sid, "avoid", comment)
                conn.execute(
                    text(
                        """
                        insert into teammate_preferences (
                          user_id,
                          student_id_hash,
                          payload_ciphertext,
                          student_id,
                          preference
                        )
                        values (:user_id, :student_id_hash, :payload_ciphertext, :student_id, 'avoid')
                        on conflict (user_id, student_id_hash) do update
                        set payload_ciphertext = excluded.payload_ciphertext,
                            student_id = excluded.student_id,
                            preference = excluded.preference
                        """
                    ),
                    {
                        "user_id": user_id,
                        "student_id_hash": student_hash,
                        "payload_ciphertext": ciphertext,
                        "student_id": sid,
                    },
                )
                metrics["teammate_prefs_upserted"] += 1

            metrics["students_seeded"] += 1

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed student project and teammate selections")
    parser.add_argument("--seed", type=int, default=20260319, help="Deterministic RNG seed base")
    parser.add_argument(
        "--submitted-ratio",
        type=float,
        default=0.35,
        help="Fraction of students with 10 picks to mark as submitted",
    )
    parser.add_argument(
        "--submit-all",
        action="store_true",
        help="Mark all seeded rankings with 10 projects as submitted",
    )
    parser.add_argument(
        "--ignore-cohort",
        action="store_true",
        help="Seed from all active projects regardless of student cohort",
    )
    args = parser.parse_args()

    submitted_ratio = max(0.0, min(1.0, args.submitted_ratio))
    metrics = seed_student_selections(
        seed=args.seed,
        submitted_ratio=submitted_ratio,
        submit_all=args.submit_all,
        ignore_cohort=args.ignore_cohort,
    )

    print("Seed complete:")
    for key, value in metrics.items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
