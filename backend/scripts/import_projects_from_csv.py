import csv
import os
import sys
from pathlib import Path

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.models import ClientIntakeForm, Cohort, Company, ProjectCompany


def _split_list(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _get_or_create_cohort(db, name: str):
    if not name:
        return None
    cohort = db.execute(select(Cohort).where(Cohort.name == name)).scalars().first()
    if cohort:
        return cohort
    cohort = Cohort(name=name)
    db.add(cohort)
    db.commit()
    db.refresh(cohort)
    return cohort


def import_projects(csv_path: str) -> int:
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    if not rows:
        return 0

    inserted = 0
    with SessionLocal() as db:
        for row in rows:
            org_name = (row.get("org_name") or "").strip()
            if not org_name:
                continue

            slug = (row.get("slug") or "").strip()
            if not slug:
                slug = org_name.lower().replace(" ", "-")

            existing = (
                db.execute(select(ClientIntakeForm).where(ClientIntakeForm.slug == slug))
                .scalars()
                .first()
            )
            if existing:
                continue

            cohort_name = (row.get("cohort") or "").strip()
            cohort = _get_or_create_cohort(db, cohort_name) if cohort_name else None

            company = db.execute(select(Company).where(Company.name == org_name)).scalars().first()
            if not company:
                company = Company(
                    name=org_name,
                    industry=(row.get("org_industry") or None),
                    website=(row.get("org_website") or None),
                )
                db.add(company)
                db.flush()

            project = ClientIntakeForm(
                slug=slug,
                raw={},
                contact_name=(row.get("contact_name") or None),
                contact_email=(row.get("contact_email") or None),
                project_title=(row.get("project_title") or None),
                project_summary=(row.get("project_summary") or None),
                project_description=(row.get("project_description") or None),
                required_skills=_split_list(row.get("required_skills") or ""),
                technical_domains=_split_list(row.get("technical_domains") or ""),
                cohort_id=cohort.id if cohort else None,
            )
            db.add(project)
            db.flush()
            db.add(ProjectCompany(project_id=project.project_id, company_id=company.id))
            inserted += 1

        db.commit()

    return inserted


def main() -> None:
    csv_path = os.getenv(
        "PROJECTS_CSV",
        str(Path(__file__).resolve().parents[1] / "data" / "projects.csv"),
    )
    if not Path(csv_path).exists():
        raise SystemExit(f"CSV not found: {csv_path}")

    inserted = import_projects(csv_path)
    print(f"Imported {inserted} projects from {csv_path}.")


if __name__ == "__main__":
    main()
