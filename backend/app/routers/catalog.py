from datetime import datetime, timedelta, timezone
import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user
from ..crypto import decrypt_teammate_choice, encrypt_teammate_choice
from ..db import get_db
from ..models import (
    Cart,
    CartItem,
    ClientIntakeForm,
    Company,
    Cohort,
    ProjectCompany,
    Rating,
    Ranking,
    RankingItem,
    Student,
    TeammatePreference,
    User,
    UserProfile,
)
from ..schemas import (
    CartItemIn,
    CartOut,
    CohortOut,
    DomainOut,
    FilterOptionsOut,
    OrganizationOut,
    ProjectCardOut,
    ProjectDetailOut,
    ProjectOut,
    RankingsIn,
    RankingsOut,
    RatingIn,
    RatingOut,
    SkillOut,
    StatsOut,
    StudentOut,
    TeammateChoicesIn,
    TeammateChoicesOut,
    UserSummaryOut,
    SearchProjectsIn,
)

router = APIRouter(prefix="/api", tags=["catalog"])
logger = logging.getLogger(__name__)
_rankings_submission_schema_ready = False
_company_schema_ready = False
_cohort_schema_ready = False


def _ensure_rankings_submission_schema(db: Session) -> None:
    global _rankings_submission_schema_ready
    if _rankings_submission_schema_ready:
        return

    db.execute(
        text(
            "ALTER TABLE rankings ADD COLUMN IF NOT EXISTS is_submitted boolean NOT NULL DEFAULT false"
        )
    )
    db.execute(
        text("ALTER TABLE rankings ADD COLUMN IF NOT EXISTS submitted_at timestamptz")
    )
    db.commit()
    _rankings_submission_schema_ready = True


def _ensure_company_schema(db: Session) -> None:
    global _company_schema_ready
    if _company_schema_ready:
        return

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS companies (
              id BIGSERIAL PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
              industry TEXT,
              website TEXT,
              logo_url TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS project_companies (
                            project_id BIGINT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
              company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )

    db.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT"))

    db.commit()
    _company_schema_ready = True


def _ensure_cohort_schema(db: Session) -> None:
    global _cohort_schema_ready
    if _cohort_schema_ready:
        return

    db.execute(
        text(
            "ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS rankings_editable_until timestamptz"
        )
    )
    db.commit()
    _cohort_schema_ready = True


def _company_logo_map(db: Session, project_ids: list[int]) -> dict[int, Optional[str]]:
    _ensure_company_schema(db)
    if not project_ids:
        return {}

    rows = db.execute(
        select(ProjectCompany.project_id, Company.logo_url)
        .join(Company, Company.id == ProjectCompany.company_id)
        .where(ProjectCompany.project_id.in_(project_ids))
    ).all()
    return {project_id: logo_url for project_id, logo_url in rows}


def _company_name_map(db: Session, project_ids: list[int]) -> dict[int, str]:
    _ensure_company_schema(db)
    if not project_ids:
        return {}

    rows = db.execute(
        select(ProjectCompany.project_id, Company.name)
        .join(Company, Company.id == ProjectCompany.company_id)
        .where(ProjectCompany.project_id.in_(project_ids))
    ).all()
    return {project_id: name for project_id, name in rows if name}


def _company_name_for_project(db: Session, project_id: int) -> Optional[str]:
    _ensure_company_schema(db)
    row = db.execute(
        select(Company.name)
        .join(ProjectCompany, ProjectCompany.company_id == Company.id)
        .where(ProjectCompany.project_id == project_id)
    ).first()
    return row[0] if row else None


def _company_profile_map(db: Session, project_ids: list[int]) -> dict[int, tuple[str, Optional[str], Optional[str], Optional[str]]]:
    _ensure_company_schema(db)
    if not project_ids:
        return {}

    rows = db.execute(
        select(
            ProjectCompany.project_id,
            Company.name,
            Company.industry,
            Company.website,
            Company.logo_url,
        )
        .join(Company, Company.id == ProjectCompany.company_id)
        .where(ProjectCompany.project_id.in_(project_ids))
    ).all()
    return {
        project_id: (name, industry, website, logo_url)
        for project_id, name, industry, website, logo_url in rows
        if name
    }


def _company_profile_for_project(db: Session, project_id: int) -> Optional[tuple[str, Optional[str], Optional[str], Optional[str]]]:
    _ensure_company_schema(db)
    row = db.execute(
        select(
            Company.name,
            Company.industry,
            Company.website,
            Company.logo_url,
        )
        .join(ProjectCompany, ProjectCompany.company_id == Company.id)
        .where(ProjectCompany.project_id == project_id)
    ).first()
    return row if row else None


def _company_logo_for_project(db: Session, project_id: int) -> Optional[str]:
    _ensure_company_schema(db)
    row = db.execute(
        select(Company.logo_url)
        .join(ProjectCompany, ProjectCompany.company_id == Company.id)
        .where(ProjectCompany.project_id == project_id)
    ).first()
    return row[0] if row else None


def _project_cover_image_url(row: ClientIntakeForm) -> Optional[str]:
    raw = row.raw if isinstance(row.raw, dict) else {}
    value = raw.get("cover_image_url") if isinstance(raw, dict) else None
    if isinstance(value, str):
        return value.strip() or None
    return None


def _submission_deadline_utc() -> Optional[datetime]:
    raw = (os.getenv("RANKINGS_SUBMISSION_DEADLINE_UTC") or "").strip()
    if not raw:
        return None

    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        logger.warning("Invalid RANKINGS_SUBMISSION_DEADLINE_UTC: %s", raw)
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _cohort_submission_deadline_utc(db: Session, cohort_id: Optional[int]) -> Optional[datetime]:
    if cohort_id is None:
        return None

    _ensure_cohort_schema(db)
    row = (
        db.execute(select(Cohort.rankings_editable_until).where(Cohort.id == cohort_id))
        .scalars()
        .first()
    )
    if not row:
        return None

    if row.tzinfo is None:
        return row.replace(tzinfo=timezone.utc)
    return row.astimezone(timezone.utc)


def _effective_submission_deadline_utc(db: Session, current_user: User) -> Optional[datetime]:
    cohort_deadline = _cohort_submission_deadline_utc(db, current_user.cohort_id)
    if cohort_deadline:
        return cohort_deadline
    return _submission_deadline_utc()


def _is_ranking_locked(db: Session, current_user: User) -> bool:
    deadline = _effective_submission_deadline_utc(db, current_user)
    if not deadline:
        return False
    return datetime.now(timezone.utc) > deadline


def _enforce_submission_deadline(db: Session, current_user: User) -> None:
    deadline = _effective_submission_deadline_utc(db, current_user)
    if not deadline:
        return
    if datetime.now(timezone.utc) > deadline:
        raise HTTPException(status_code=400, detail="Ranking submission window is closed")



@router.get("/organizations", response_model=List[OrganizationOut])
def list_organizations(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    _ensure_company_schema(db)
    if current_user and current_user.role == "student" and current_user.cohort_id:
        rows = db.execute(
            select(Company.name, Company.industry)
            .join(ProjectCompany, ProjectCompany.company_id == Company.id)
            .join(ClientIntakeForm, ClientIntakeForm.project_id == ProjectCompany.project_id)
            .where(
                ClientIntakeForm.deleted_at.is_(None),
                ClientIntakeForm.cohort_id == current_user.cohort_id,
            )
            .distinct()
        ).all()
    else:
        rows = db.execute(select(Company.name, Company.industry).distinct()).all()
    return [
        OrganizationOut(
            id=index + 1, name=org_name, industry=industry, company_size=None
        )
        for index, (org_name, industry) in enumerate(sorted(rows, key=lambda x: x[0]))
    ]


@router.get("/domains", response_model=List[DomainOut])
def list_domains(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    stmt = select(ClientIntakeForm.technical_domains).where(
        ClientIntakeForm.deleted_at.is_(None)
    )
    if current_user and current_user.role == "student" and current_user.cohort_id:
        stmt = stmt.where(ClientIntakeForm.cohort_id == current_user.cohort_id)
    rows = db.execute(stmt).scalars().all()
    values: set[str] = set()
    for item in rows:
        if isinstance(item, list):
            values.update([v for v in item if v])
    return [
        DomainOut(id=index + 1, name=value)
        for index, value in enumerate(sorted(values))
    ]


@router.get("/skills", response_model=List[SkillOut])
def list_skills(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    stmt = select(ClientIntakeForm.required_skills).where(
        ClientIntakeForm.deleted_at.is_(None)
    )
    if current_user and current_user.role == "student" and current_user.cohort_id:
        stmt = stmt.where(ClientIntakeForm.cohort_id == current_user.cohort_id)
    rows = db.execute(stmt).scalars().all()
    values: set[str] = set()
    for item in rows:
        if isinstance(item, list):
            values.update([v for v in item if v])
    return [
        SkillOut(id=index + 1, name=value) for index, value in enumerate(sorted(values))
    ]


@router.get("/students", response_model=List[StudentOut])
def list_students(
    cohort_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    if current_user and current_user.role == "student":
        if not current_user.cohort_id:
            return []
        cohort_id = current_user.cohort_id
    stmt = select(Student).order_by(Student.full_name.asc())
    if cohort_id:
        stmt = stmt.where(Student.cohort_id == cohort_id)
    student_rows = db.execute(stmt).scalars().all()
    if student_rows:
        if current_user and current_user.email:
            student_rows = [row for row in student_rows if (row.email or "").lower() != current_user.email.lower()]
        return student_rows

    # Fallback: when cohort roster in students table is empty, expose student-role users.
    user_stmt = select(User).where(User.deleted_at.is_(None), User.role == "student")
    if cohort_id:
        user_stmt = user_stmt.where(User.cohort_id == cohort_id)
    user_stmt = user_stmt.order_by(User.display_name.asc().nullslast(), User.email.asc().nullslast())
    user_rows = db.execute(user_stmt).scalars().all()

    out: list[StudentOut] = []
    for row in user_rows:
        if current_user and current_user.id == row.id:
            continue
        display_name = (row.display_name or "").strip()
        fallback_name = (row.email.split("@")[0] if row.email else "Student").replace(".", " ").title()
        out.append(
            StudentOut(
                id=row.id,
                full_name=display_name or fallback_name,
                email=row.email,
                program=None,
            )
        )
    return out


@router.get("/cohorts", response_model=List[CohortOut])
def list_cohorts(db: Session = Depends(get_db)):
    _ensure_cohort_schema(db)
    rows = db.execute(select(Cohort).order_by(Cohort.name.asc())).scalars().all()
    return [
        CohortOut(
            id=row.id,
            name=row.name,
            program=row.program,
            year=row.year,
            rankings_editable_until=row.rankings_editable_until,
        )
        for row in rows
    ]


@router.get("/filters", response_model=FilterOptionsOut)
def list_filters(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    _ensure_cohort_schema(db)
    stmt = select(
        ClientIntakeForm.technical_domains,
        ClientIntakeForm.required_skills,
        Company.industry,
    ).join(ProjectCompany, ProjectCompany.project_id == ClientIntakeForm.project_id).join(
        Company, Company.id == ProjectCompany.company_id
    ).where(ClientIntakeForm.deleted_at.is_(None))
    if current_user and current_user.role == "student" and current_user.cohort_id:
        stmt = stmt.where(ClientIntakeForm.cohort_id == current_user.cohort_id)
        cohort_rows = [
            row.name
            for row in db.execute(select(Cohort).where(Cohort.id == current_user.cohort_id))
            .scalars()
            .all()
        ]
    else:
        cohort_rows = db.execute(select(Cohort.name).order_by(Cohort.name.asc())).scalars().all()

    rows = db.execute(stmt).all()

    domains_set: set[str] = set()
    skills_set: set[str] = set()
    industries_set: set[str] = set()

    for domains, skills, industry in rows:
        if isinstance(domains, list):
            domains_set.update([v for v in domains if v])
        if isinstance(skills, list):
            skills_set.update([v for v in skills if v])
        if industry:
            industries_set.add(industry)

    return FilterOptionsOut(
        domains=sorted(domains_set),
        skills=sorted(skills_set),
        difficulties=[],
        modalities=[],
        cadences=[],
        confidentiality=[],
        industries=sorted(industries_set),
        company_sizes=[],
        cohorts=sorted({name for name in cohort_rows if name}),
    )


@router.get("/user-summary", response_model=UserSummaryOut)
def user_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = (
        db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
        .scalars()
        .first()
    )
    if not profile:
        profile = UserProfile(user_id=current_user.id, avg_match_score=86)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return UserSummaryOut(avg_match_score=profile.avg_match_score)


@router.get("/stats", response_model=StatsOut)
def stats(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    stmt = select(func.count(ClientIntakeForm.project_id)).where(
        ClientIntakeForm.deleted_at.is_(None)
    )
    if current_user and current_user.role == "student" and current_user.cohort_id:
        stmt = stmt.where(ClientIntakeForm.cohort_id == current_user.cohort_id)

    active_projects = db.execute(stmt).scalar_one()
    new_this_week = db.execute(
        stmt.where(ClientIntakeForm.created_at >= week_ago)
    ).scalar_one()

    return StatsOut(active_projects=active_projects, new_this_week=new_this_week)


@router.get("/projects", response_model=List[ProjectOut])
def list_projects(
    q: Optional[str] = Query(default=None, description="Free text search"),
    domain: Optional[str] = None,
    difficulty: Optional[str] = None,
    modality: Optional[str] = None,
    organization: Optional[str] = None,
    cohort: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    _ensure_cohort_schema(db)
    cohort_rows = db.execute(select(Cohort)).scalars().all()
    cohort_map = {row.id: row.name for row in cohort_rows}
    cohort_id = None
    if cohort:
        for row in cohort_rows:
            if row.name == cohort:
                cohort_id = row.id
                break
    rows = (
        db.execute(
            select(ClientIntakeForm)
            .where(ClientIntakeForm.deleted_at.is_(None))
            .order_by(ClientIntakeForm.created_at.desc())
        )
        .scalars()
        .all()
    )
    org_map = _company_name_map(db, [row.project_id for row in rows])
    profile_map = _company_profile_map(db, [row.project_id for row in rows])

    def matches(row: ClientIntakeForm) -> bool:
        row_org = org_map.get(row.project_id) or ""
        profile = profile_map.get(row.project_id)
        industry = profile[1] if profile else None
        if q:
            needle = q.lower()
            haystack = " ".join(
                filter(
                    None,
                    [
                        row_org,
                        row.project_title,
                        row.project_summary,
                        row.project_description,
                        industry,
                    ],
                )
            ).lower()
            if needle not in haystack:
                return False
        if organization and organization.lower() not in row_org.lower():
            return False
        effective_cohort_id = cohort_id
        if current_user and current_user.role == "student" and current_user.cohort_id:
            effective_cohort_id = current_user.cohort_id
        if effective_cohort_id and row.cohort_id != effective_cohort_id:
            return False
        if domain:
            domains = (
                row.technical_domains if isinstance(row.technical_domains, list) else []
            )
            if domain not in domains:
                return False
        return True

    filtered = [row for row in rows if matches(row)]
    sliced = filtered[offset : offset + limit]
    logo_map = _company_logo_map(db, [row.project_id for row in sliced])

    out: list[ProjectOut] = []
    for row in sliced:
        row_org = org_map.get(row.project_id) or "Unknown organization"
        domains = (
            row.technical_domains if isinstance(row.technical_domains, list) else []
        )
        skills = row.required_skills if isinstance(row.required_skills, list) else []
        out.append(
            ProjectOut(
                slug=row.slug,
                id=row.project_id,
                title=row.project_title or row_org,
                description=row.project_description or row.project_summary or "",
                duration_weeks=None,
                difficulty=None,
                modality=None,
                cadence=None,
                confidentiality=None,
                min_hours_per_week=None,
                max_hours_per_week=None,
                domain=domains[0] if domains else None,
                organization=row_org,
                organization_logo_url=logo_map.get(row.project_id),
                cohort=cohort_map.get(row.cohort_id),
                tags=skills,
                skills=skills,
                avg_rating=None,
                ratings_count=0,
                created_at=row.created_at,
            )
        )

    return out


@router.get("/projects/{project_id}", response_model=ProjectDetailOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    _ensure_cohort_schema(db)
    row = (
        db.execute(
            select(ClientIntakeForm)
            .where(ClientIntakeForm.project_id == project_id)
            .where(ClientIntakeForm.deleted_at.is_(None))
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user and current_user.role == "student" and current_user.cohort_id:
        if row.cohort_id != current_user.cohort_id:
            raise HTTPException(status_code=404, detail="Project not found")

    cohort_name = None
    if row.cohort_id:
        cohort = db.execute(select(Cohort).where(Cohort.id == row.cohort_id)).scalars().first()
        if cohort:
            cohort_name = cohort.name

    def to_list(value) -> list[str]:
        if isinstance(value, list):
            return [str(v) for v in value if v]
        if value:
            return [str(value)]
        return []

    profile = _company_profile_for_project(db, row.project_id)
    organization = (profile[0] if profile else None) or "Unknown organization"
    industry = profile[1] if profile else None
    website = profile[2] if profile else None
    logo_url = profile[3] if profile else _company_logo_for_project(db, row.project_id)

    return ProjectDetailOut(
        slug=row.slug,
        id=row.project_id,
        organization=organization,
        organization_logo_url=logo_url,
        cover_image_url=_project_cover_image_url(row),
        title=row.project_title or organization,
        summary=row.project_summary,
        description=row.project_description or row.project_summary,
        cohort=cohort_name,
        org_industry=industry,
        org_website=website,
        minimum_deliverables=row.minimum_deliverables,
        stretch_goals=row.stretch_goals,
        long_term_impact=row.long_term_impact,
        scope_clarity=row.scope_clarity,
        scope_clarity_other=row.scope_clarity_other,
        publication_potential=row.publication_potential,
        data_access=row.data_access,
        required_skills=to_list(row.required_skills),
        required_skills_other=row.required_skills_other,
        technical_domains=to_list(row.technical_domains),
        supplementary_documents=to_list(row.supplementary_documents),
        video_links=to_list(row.video_links),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/projects/slug/{slug}", response_model=ProjectDetailOut)
def get_project_by_slug(
    slug: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    _ensure_cohort_schema(db)
    row = (
        db.execute(
            select(ClientIntakeForm)
            .where(ClientIntakeForm.slug == slug)
            .where(ClientIntakeForm.deleted_at.is_(None))
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user and current_user.role == "student" and current_user.cohort_id:
        if row.cohort_id != current_user.cohort_id:
            raise HTTPException(status_code=404, detail="Project not found")

    cohort_name = None
    if row.cohort_id:
        cohort = db.execute(select(Cohort).where(Cohort.id == row.cohort_id)).scalars().first()
        if cohort:
            cohort_name = cohort.name

    def to_list(value) -> list[str]:
        if isinstance(value, list):
            return [str(v) for v in value if v]
        if value:
            return [str(value)]
        return []

    profile = _company_profile_for_project(db, row.project_id)
    organization = (profile[0] if profile else None) or "Unknown organization"
    industry = profile[1] if profile else None
    website = profile[2] if profile else None
    logo_url = profile[3] if profile else _company_logo_for_project(db, row.project_id)

    return ProjectDetailOut(
        slug=row.slug,
        id=row.project_id,
        organization=organization,
        organization_logo_url=logo_url,
        cover_image_url=_project_cover_image_url(row),
        title=row.project_title or organization,
        summary=row.project_summary,
        description=row.project_description or row.project_summary,
        cohort=cohort_name,
        org_industry=industry,
        org_website=website,
        minimum_deliverables=row.minimum_deliverables,
        stretch_goals=row.stretch_goals,
        long_term_impact=row.long_term_impact,
        scope_clarity=row.scope_clarity,
        scope_clarity_other=row.scope_clarity_other,
        publication_potential=row.publication_potential,
        data_access=row.data_access,
        required_skills=to_list(row.required_skills),
        required_skills_other=row.required_skills_other,
        technical_domains=to_list(row.technical_domains),
        supplementary_documents=to_list(row.supplementary_documents),
        video_links=to_list(row.video_links),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("/search/projects", response_model=List[ProjectOut])
def search_projects(
    payload: SearchProjectsIn,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    _ensure_cohort_schema(db)
    cohort_rows = db.execute(select(Cohort)).scalars().all()
    cohort_map = {row.id: row.name for row in cohort_rows}
    cohort_id = None
    if payload.cohort:
        for row in cohort_rows:
            if row.name == payload.cohort:
                cohort_id = row.id
                break
    rows = (
        db.execute(
            select(ClientIntakeForm)
            .where(ClientIntakeForm.deleted_at.is_(None))
            .order_by(ClientIntakeForm.created_at.desc())
        )
        .scalars()
        .all()
    )
    org_map = _company_name_map(db, [row.project_id for row in rows])
    profile_map = _company_profile_map(db, [row.project_id for row in rows])

    def to_list(value) -> list[str]:
        if isinstance(value, list):
            return [str(v) for v in value if v]
        if value:
            return [str(value)]
        return []

    def contains_substring(needle: str, haystack: str) -> bool:
        return needle.lower() in (haystack or "").lower()

    def list_contains_substring(needle: str, values: list[str]) -> bool:
        return any(needle.lower() in v.lower() for v in values if v)

    def matches_all(selected: list[str], candidates: list[str]) -> bool:
        for item in selected:
            if item and not list_contains_substring(item, candidates):
                return False
        return True

    def matches_any(selected: list[str], candidates: list[str]) -> bool:
        return any(
            item and list_contains_substring(item, candidates) for item in selected
        )

    def matches(row: ClientIntakeForm) -> bool:
        row_org = org_map.get(row.project_id) or ""
        profile = profile_map.get(row.project_id)
        industry = profile[1] if profile else None
        if payload.q:
            haystack_parts = [
                row_org,
                row.project_title,
                row.project_summary,
                row.project_description,
                industry,
                row.required_skills_other,
            ]
            haystack_parts += to_list(row.required_skills)
            haystack_parts += to_list(row.technical_domains)
            haystack = " ".join(filter(None, haystack_parts)).lower()
            if payload.q.lower() not in haystack:
                return False

        if payload.organization and not contains_substring(payload.organization, row_org):
            return False

        effective_cohort_id = cohort_id
        if current_user and current_user.role == "student" and current_user.cohort_id:
            effective_cohort_id = current_user.cohort_id
        if effective_cohort_id and row.cohort_id != effective_cohort_id:
            return False

        match_mode = (payload.match_mode or "and").lower()

        if payload.domains:
            domain_candidates = to_list(row.technical_domains)
            domain_match = (
                matches_any(payload.domains, domain_candidates)
                if match_mode == "or"
                else matches_all(payload.domains, domain_candidates)
            )
            if not domain_match:
                return False

        if payload.skills:
            skill_candidates = to_list(row.required_skills)
            if row.required_skills_other:
                skill_candidates.append(row.required_skills_other)
            skill_match = (
                matches_any(payload.skills, skill_candidates)
                if match_mode == "or"
                else matches_all(payload.skills, skill_candidates)
            )
            if not skill_match:
                return False

        if payload.industries:
            industry_candidates = [v for v in [industry] if v]
            industry_match = (
                matches_any(payload.industries, industry_candidates)
                if match_mode == "or"
                else matches_all(payload.industries, industry_candidates)
            )
            if not industry_match:
                return False

        return True

    filtered = [row for row in rows if matches(row)]

    sort_by = (payload.sort_by or "created_at").strip().lower()
    sort_dir = (payload.sort_dir or "desc").strip().lower()
    reverse = sort_dir != "asc"

    if sort_by == "title":
        filtered.sort(
            key=lambda row: (row.project_title or org_map.get(row.project_id) or "").lower(),
            reverse=reverse,
        )
    else:
        # Default sort keeps newest published projects first.
        filtered.sort(
            key=lambda row: row.created_at or datetime.min.replace(tzinfo=timezone.utc),
            reverse=reverse,
        )

    limit = max(1, min(payload.limit, 200))
    offset = max(payload.offset, 0)
    sliced = filtered[offset : offset + limit]
    logo_map = _company_logo_map(db, [row.project_id for row in sliced])

    out: list[ProjectOut] = []
    for row in sliced:
        row_org = org_map.get(row.project_id) or "Unknown organization"
        domains = (
            row.technical_domains if isinstance(row.technical_domains, list) else []
        )
        skills = row.required_skills if isinstance(row.required_skills, list) else []
        out.append(
            ProjectOut(
                slug=row.slug,
                id=row.project_id,
                title=row.project_title or row_org,
                description=row.project_description or row.project_summary or "",
                duration_weeks=None,
                difficulty=None,
                modality=None,
                cadence=None,
                confidentiality=None,
                min_hours_per_week=None,
                max_hours_per_week=None,
                domain=domains[0] if domains else None,
                organization=row_org,
                organization_logo_url=logo_map.get(row.project_id),
                cohort=cohort_map.get(row.cohort_id),
                tags=skills,
                skills=skills,
                avg_rating=None,
                ratings_count=0,
                created_at=row.created_at,
            )
        )

    return out


def _get_or_create_open_cart(db: Session, user_id: int) -> Cart:
    cart = (
        db.execute(
            select(Cart)
            .where(Cart.user_id == user_id, Cart.status == "open")
            .order_by(Cart.id.desc())
        )
        .scalars()
        .first()
    )
    if cart:
        return cart

    cart = Cart(user_id=user_id)
    db.add(cart)
    db.commit()
    db.refresh(cart)
    return cart


def _get_or_create_ranking(db: Session, user_id: int) -> Ranking:
    _ensure_rankings_submission_schema(db)
    ranking = (
        db.execute(select(Ranking).where(Ranking.user_id == user_id)).scalars().first()
    )
    if ranking:
        return ranking

    ranking = Ranking(user_id=user_id)
    db.add(ranking)
    db.commit()
    db.refresh(ranking)
    return ranking


def _fetch_project_cards(db: Session, project_ids: list[int]) -> list[ProjectCardOut]:
    if not project_ids:
        return []

    rows = (
        db.execute(
            select(ClientIntakeForm)
            .where(ClientIntakeForm.project_id.in_(project_ids))
            .where(ClientIntakeForm.deleted_at.is_(None))
        )
        .scalars()
        .all()
    )

    cards = []
    org_map = _company_name_map(db, project_ids)
    for row in rows:
        row_org = org_map.get(row.project_id) or "Unknown organization"
        skills = row.required_skills if isinstance(row.required_skills, list) else []
        cards.append(
            ProjectCardOut(
                slug=row.slug,
                id=row.project_id,
                title=row.project_title or row_org,
                organization=row_org,
                tags=skills,
            )
        )

    order = {pid: index for index, pid in enumerate(project_ids)}
    cards.sort(key=lambda item: order.get(item.id, 9999))
    return cards


@router.post("/cart/items", response_model=CartOut)
def add_to_cart(
    payload: CartItemIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_submission_deadline(db, current_user)
    project = (
        db.execute(
            select(ClientIntakeForm)
            .where(ClientIntakeForm.project_id == payload.project_id)
            .where(ClientIntakeForm.deleted_at.is_(None))
        )
        .scalars()
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == "student" and current_user.cohort_id:
        if project.cohort_id != current_user.cohort_id:
            raise HTTPException(status_code=404, detail="Project not found")

    has_rating = (
        db.execute(
            select(func.count(Rating.project_id)).where(
                Rating.user_id == current_user.id,
                Rating.project_id == payload.project_id,
            )
        ).scalar_one()
        > 0
    )
    if not has_rating:
        raise HTTPException(
            status_code=400,
            detail="Rate this project before adding it to selected projects",
        )

    cart = _get_or_create_open_cart(db, current_user.id)

    existing = (
        db.execute(
            select(CartItem).where(
                CartItem.cart_id == cart.id, CartItem.project_id == payload.project_id
            )
        )
        .scalars()
        .first()
    )
    if existing:
        return get_cart(db=db, current_user=current_user)

    selected = db.execute(
        select(func.count(CartItem.project_id)).where(CartItem.cart_id == cart.id)
    ).scalar_one()
    if selected >= 10:
        return get_cart(db=db, current_user=current_user)

    db.add(CartItem(cart_id=cart.id, project_id=payload.project_id))
    db.commit()

    return get_cart(db=db, current_user=current_user)


@router.delete("/cart/items/{project_id}", response_model=CartOut)
def remove_from_cart(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_submission_deadline(db, current_user)
    cart = (
        db.execute(
            select(Cart)
            .where(Cart.user_id == current_user.id, Cart.status == "open")
            .order_by(Cart.id.desc())
        )
        .scalars()
        .first()
    )
    if not cart:
        return get_cart(db=db, current_user=current_user)

    db.query(CartItem).filter(
        CartItem.cart_id == cart.id, CartItem.project_id == project_id
    ).delete()
    db.commit()

    return get_cart(db=db, current_user=current_user)


@router.get("/cart", response_model=CartOut)
def get_cart(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    user_id = current_user.id
    cart = (
        db.execute(
            select(Cart)
            .where(Cart.user_id == user_id, Cart.status == "open")
            .order_by(Cart.id.desc())
        )
        .scalars()
        .first()
    )
    if not cart:
        return CartOut(
            cart_id=None, user_id=user_id, status="open", selected=0, project_ids=[]
        )

    project_ids = (
        db.execute(
            select(CartItem.project_id)
            .join(ClientIntakeForm, ClientIntakeForm.project_id == CartItem.project_id)
            .where(CartItem.cart_id == cart.id)
            .where(ClientIntakeForm.deleted_at.is_(None))
        )
        .scalars()
        .all()
    )
    return CartOut(
        cart_id=cart.id,
        user_id=user_id,
        status=cart.status,
        selected=len(project_ids),
        project_ids=project_ids,
    )


@router.get("/teammate-choices", response_model=TeammateChoicesOut)
def get_teammate_choices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_student_ids: Optional[set[int]] = None
    if current_user.role == "student":
        if not current_user.cohort_id:
            return TeammateChoicesOut(want_ids=[], avoid_ids=[], avoid_reasons={}, comments={})
        allowed_student_ids = set(
            db.execute(
                select(Student.id).where(Student.cohort_id == current_user.cohort_id)
            )
            .scalars()
            .all()
        )

    rows = db.execute(
        select(
            TeammatePreference.payload_ciphertext,
            TeammatePreference.student_id,
            TeammatePreference.preference,
        ).where(TeammatePreference.user_id == current_user.id)
    ).all()
    want_ids: list[int] = []
    avoid_ids: list[int] = []
    comments: dict[int, str] = {}
    avoid_reasons: dict[int, str] = {}
    for payload_ciphertext, student_id, preference in rows:
        if payload_ciphertext:
            try:
                payload = decrypt_teammate_choice(payload_ciphertext)
            except Exception as exc:
                logger.exception("Failed to decrypt teammate preference")
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            student_id = payload.get("student_id")
            preference = payload.get("preference")
            comment = payload.get("comment") or payload.get("avoid_reason")
        else:
            comment = None

        if not student_id or not preference:
            continue
        sid = int(student_id)
        if allowed_student_ids is not None and sid not in allowed_student_ids:
            continue
        if preference == "want":
            want_ids.append(sid)
            if comment:
                comments[sid] = str(comment)
        if preference == "avoid":
            avoid_ids.append(sid)
            if comment:
                comments[sid] = str(comment)
                avoid_reasons[sid] = str(comment)
    return TeammateChoicesOut(
        want_ids=want_ids,
        avoid_ids=avoid_ids,
        avoid_reasons=avoid_reasons,
        comments=comments,
    )


@router.post("/teammate-choices", response_model=TeammateChoicesOut)
def set_teammate_choices(
    payload: TeammateChoicesIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(payload.want_ids) > 5 or len(payload.avoid_ids) > 5:
        raise HTTPException(
            status_code=400, detail="Each list must have at most 5 students"
        )

    if set(payload.want_ids) & set(payload.avoid_ids):
        raise HTTPException(status_code=400, detail="A student cannot be in both lists")

    if current_user.role == "student":
        if not current_user.cohort_id:
            raise HTTPException(status_code=400, detail="Student cohort is required for teammate choices")
        allowed_student_ids = set(
            db.execute(
                select(Student.id).where(Student.cohort_id == current_user.cohort_id)
            )
            .scalars()
            .all()
        )
        selected_ids_set = set(payload.want_ids + payload.avoid_ids)
        if not selected_ids_set.issubset(allowed_student_ids):
            raise HTTPException(
                status_code=400,
                detail="Teammate choices must be students from your cohort",
            )

    selected_ids = payload.want_ids + payload.avoid_ids
    comments_map = payload.comments or payload.avoid_reasons or {}

    db.execute(
        select(TeammatePreference).where(TeammatePreference.user_id == current_user.id)
    )
    db.query(TeammatePreference).filter(
        TeammatePreference.user_id == current_user.id
    ).delete()

    for sid in payload.want_ids:
        try:
            comment = str(comments_map.get(sid, "")).strip()
            ciphertext, student_hash = encrypt_teammate_choice(sid, "want", comment)
        except Exception as exc:
            logger.exception("Failed to encrypt teammate preference")
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        db.add(
            TeammatePreference(
                user_id=current_user.id,
                student_id_hash=student_hash,
                payload_ciphertext=ciphertext,
            )
        )
    for sid in payload.avoid_ids:
        try:
            comment = str(comments_map.get(sid, "")).strip()
            ciphertext, student_hash = encrypt_teammate_choice(sid, "avoid", comment)
        except Exception as exc:
            logger.exception("Failed to encrypt teammate preference")
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        db.add(
            TeammatePreference(
                user_id=current_user.id,
                student_id_hash=student_hash,
                payload_ciphertext=ciphertext,
            )
        )

    db.commit()

    avoid_reasons = {
        sid: comments_map[sid]
        for sid in payload.avoid_ids
        if str(comments_map.get(sid, "")).strip()
    }
    return TeammateChoicesOut(
        want_ids=payload.want_ids,
        avoid_ids=payload.avoid_ids,
        avoid_reasons=avoid_reasons,
        comments={sid: str(comments_map.get(sid, "")).strip() for sid in selected_ids},
    )


@router.get("/ratings", response_model=List[RatingOut])
def get_ratings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(Rating.project_id, Rating.rating).where(Rating.user_id == current_user.id)
    ).all()
    return [RatingOut(project_id=project_id, rating=rating) for project_id, rating in rows]


@router.post("/ratings", response_model=RatingOut)
def save_rating(
    payload: RatingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_submission_deadline(db, current_user)
    if payload.rating < 1 or payload.rating > 10:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 10")

    project = (
        db.execute(
            select(ClientIntakeForm)
            .where(ClientIntakeForm.project_id == payload.project_id)
            .where(ClientIntakeForm.deleted_at.is_(None))
        )
        .scalars()
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == "student" and current_user.cohort_id:
        if project.cohort_id != current_user.cohort_id:
            raise HTTPException(status_code=404, detail="Project not found")

    stmt = (
        insert(Rating)
        .values(
            user_id=current_user.id,
            project_id=payload.project_id,
            rating=payload.rating,
        )
        .on_conflict_do_update(
            index_elements=[Rating.user_id, Rating.project_id],
            set_={"rating": payload.rating, "updated_at": func.now()},
        )
    )
    db.execute(stmt)
    db.commit()
    return RatingOut(project_id=payload.project_id, rating=payload.rating)


@router.get("/rankings", response_model=RankingsOut)
def get_rankings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ranking = _get_or_create_ranking(db, current_user.id)
    editable_until = _effective_submission_deadline_utc(db, current_user)
    is_locked = _is_ranking_locked(db, current_user)

    ranking_items = (
        db.execute(
            select(RankingItem)
            .where(RankingItem.ranking_id == ranking.id)
            .order_by(RankingItem.rank.asc())
        )
        .scalars()
        .all()
    )
    top_ids = [item.project_id for item in ranking_items]

    cart = (
        db.execute(
            select(Cart)
            .where(Cart.user_id == current_user.id, Cart.status == "open")
            .order_by(Cart.id.desc())
        )
        .scalars()
        .first()
    )
    cart_ids: list[int] = []
    if cart:
        cart_ids = (
            db.execute(select(CartItem.project_id).where(CartItem.cart_id == cart.id))
            .scalars()
            .all()
        )

    rated_ids: set[int] = set()
    if cart_ids:
        rated_ids = set(
            db.execute(
                select(Rating.project_id).where(
                    Rating.user_id == current_user.id,
                    Rating.project_id.in_(cart_ids),
                )
            )
            .scalars()
            .all()
        )
    cart_ids = [pid for pid in cart_ids if pid in rated_ids]

    top_ids = [pid for pid in top_ids if pid in cart_ids]
    additional_ids = [pid for pid in cart_ids if pid not in top_ids]

    return RankingsOut(
        top_ten=_fetch_project_cards(db, top_ids),
        additional=_fetch_project_cards(db, additional_ids),
        ranked_count=len(top_ids),
        is_submitted=bool(ranking.is_submitted),
        submitted_at=ranking.submitted_at,
        is_locked=is_locked,
        editable_until=editable_until,
    )


@router.post("/rankings", response_model=RankingsOut)
def save_rankings(
    payload: RankingsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_submission_deadline(db, current_user)

    if len(payload.top_ten_ids) > 10:
        raise HTTPException(status_code=400, detail="Top 10 max")

    if len(set(payload.top_ten_ids)) != len(payload.top_ten_ids):
        raise HTTPException(status_code=400, detail="Duplicate project")

    if payload.top_ten_ids:
        rated_ids = set(
            db.execute(
                select(Rating.project_id).where(
                    Rating.user_id == current_user.id,
                    Rating.project_id.in_(payload.top_ten_ids),
                )
            )
            .scalars()
            .all()
        )
        missing_rating_ids = [pid for pid in payload.top_ten_ids if pid not in rated_ids]
        if missing_rating_ids:
            raise HTTPException(
                status_code=400,
                detail="All ranked projects must be rated before adding to Top 10",
            )

    ranking = _get_or_create_ranking(db, current_user.id)

    db.query(RankingItem).filter(RankingItem.ranking_id == ranking.id).delete()
    for index, project_id in enumerate(payload.top_ten_ids, start=1):
        db.add(RankingItem(ranking_id=ranking.id, project_id=project_id, rank=index))
    ranking.updated_at = func.now()
    db.commit()

    return get_rankings(db=db, current_user=current_user)


@router.post("/rankings/submit", response_model=RankingsOut)
def submit_rankings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_submission_deadline(db, current_user)

    ranking = _get_or_create_ranking(db, current_user.id)
    if ranking.is_submitted:
        return get_rankings(db=db, current_user=current_user)

    ranking_items = (
        db.execute(
            select(RankingItem)
            .where(RankingItem.ranking_id == ranking.id)
            .order_by(RankingItem.rank.asc())
        )
        .scalars()
        .all()
    )
    top_ids = [item.project_id for item in ranking_items]

    cart = (
        db.execute(
            select(Cart)
            .where(Cart.user_id == current_user.id, Cart.status == "open")
            .order_by(Cart.id.desc())
        )
        .scalars()
        .first()
    )
    cart_ids: list[int] = []
    if cart:
        cart_ids = (
            db.execute(select(CartItem.project_id).where(CartItem.cart_id == cart.id))
            .scalars()
            .all()
        )

    effective_top_ids = [pid for pid in top_ids if pid in cart_ids]
    if len(effective_top_ids) != 10:
        raise HTTPException(status_code=400, detail="You must rank exactly 10 projects before submitting")

    rated_ids = set(
        db.execute(
            select(Rating.project_id).where(
                Rating.user_id == current_user.id,
                Rating.project_id.in_(effective_top_ids),
            )
        )
        .scalars()
        .all()
    )
    missing_rating_ids = [pid for pid in effective_top_ids if pid not in rated_ids]
    if missing_rating_ids:
        raise HTTPException(
            status_code=400,
            detail="All ranked projects must be rated before submitting",
        )

    ranking.is_submitted = True
    ranking.submitted_at = datetime.now(timezone.utc)
    ranking.updated_at = func.now()
    db.commit()

    return get_rankings(db=db, current_user=current_user)
