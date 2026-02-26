from datetime import datetime, timedelta, timezone
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..crypto import decrypt_teammate_choice, encrypt_teammate_choice
from ..db import get_db
from ..models import (
    Cart,
    CartItem,
    ClientIntakeForm,
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

_teammate_prefs_schema_ready = False
_ratings_schema_ready = False


def _ensure_teammate_prefs_schema(db: Session) -> None:
    global _teammate_prefs_schema_ready
    if _teammate_prefs_schema_ready:
        return

    db.execute(
        text(
            "ALTER TABLE teammate_preferences ADD COLUMN IF NOT EXISTS student_id_hash text"
        )
    )
    db.execute(
        text(
            "ALTER TABLE teammate_preferences ADD COLUMN IF NOT EXISTS payload_ciphertext text"
        )
    )
    db.execute(
        text("ALTER TABLE teammate_preferences ALTER COLUMN student_id DROP NOT NULL")
    )
    db.execute(
        text("ALTER TABLE teammate_preferences ALTER COLUMN preference DROP NOT NULL")
    )
    db.commit()
    _teammate_prefs_schema_ready = True


def _ensure_ratings_schema(db: Session) -> None:
    global _ratings_schema_ready
    if _ratings_schema_ready:
        return

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS ratings (
              id bigserial PRIMARY KEY,
              user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              org_name text NOT NULL REFERENCES client_intake_forms(org_name) ON DELETE CASCADE,
              rating int NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now(),
              UNIQUE (user_id, org_name),
              CONSTRAINT ck_ratings_rating CHECK (rating between 1 and 10)
            )
            """
        )
    )

    # If an older CHECK constraint exists (1–5), replace it with the 1–10 constraint.
    db.execute(
        text("ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_rating_check")
    )
    db.execute(text("ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ck_ratings_rating"))
    db.execute(
        text(
            "ALTER TABLE ratings ADD CONSTRAINT ck_ratings_rating CHECK (rating between 1 and 10)"
        )
    )
    db.commit()
    _ratings_schema_ready = True


@router.get("/organizations", response_model=List[OrganizationOut])
def list_organizations(db: Session = Depends(get_db)):
    rows = db.execute(
        select(ClientIntakeForm.org_name, ClientIntakeForm.org_industry)
    ).all()
    return [
        OrganizationOut(
            id=index + 1, name=org_name, industry=industry, company_size=None
        )
        for index, (org_name, industry) in enumerate(sorted(rows, key=lambda x: x[0]))
    ]


@router.get("/domains", response_model=List[DomainOut])
def list_domains(db: Session = Depends(get_db)):
    rows = db.execute(select(ClientIntakeForm.technical_domains)).scalars().all()
    values: set[str] = set()
    for item in rows:
        if isinstance(item, list):
            values.update([v for v in item if v])
    return [
        DomainOut(id=index + 1, name=value)
        for index, value in enumerate(sorted(values))
    ]


@router.get("/skills", response_model=List[SkillOut])
def list_skills(db: Session = Depends(get_db)):
    rows = db.execute(select(ClientIntakeForm.required_skills)).scalars().all()
    values: set[str] = set()
    for item in rows:
        if isinstance(item, list):
            values.update([v for v in item if v])
    return [
        SkillOut(id=index + 1, name=value) for index, value in enumerate(sorted(values))
    ]


@router.get("/students", response_model=List[StudentOut])
def list_students(db: Session = Depends(get_db)):
    return db.execute(select(Student).order_by(Student.full_name.asc())).scalars().all()


@router.get("/filters", response_model=FilterOptionsOut)
def list_filters(db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            ClientIntakeForm.technical_domains,
            ClientIntakeForm.required_skills,
            ClientIntakeForm.org_industry,
            ClientIntakeForm.project_sector,
        )
    ).all()

    domains_set: set[str] = set()
    skills_set: set[str] = set()
    industries_set: set[str] = set()
    sectors_set: set[str] = set()

    for domains, skills, industry, sector in rows:
        if isinstance(domains, list):
            domains_set.update([v for v in domains if v])
        if isinstance(skills, list):
            skills_set.update([v for v in skills if v])
        if industry:
            industries_set.add(industry)
        if sector:
            sectors_set.add(sector)

    return FilterOptionsOut(
        domains=sorted(domains_set or sectors_set),
        skills=sorted(skills_set),
        difficulties=[],
        modalities=[],
        cadences=[],
        confidentiality=[],
        industries=sorted(industries_set),
        company_sizes=[],
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
def stats(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    active_projects = db.execute(
        select(func.count(ClientIntakeForm.org_name))
    ).scalar_one()
    new_this_week = db.execute(
        select(func.count(ClientIntakeForm.org_name)).where(
            ClientIntakeForm.created_at >= week_ago
        )
    ).scalar_one()

    return StatsOut(active_projects=active_projects, new_this_week=new_this_week)


@router.get("/projects", response_model=List[ProjectOut])
def list_projects(
    q: Optional[str] = Query(default=None, description="Free text search"),
    domain: Optional[str] = None,
    difficulty: Optional[str] = None,
    modality: Optional[str] = None,
    organization: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    rows = (
        db.execute(
            select(ClientIntakeForm).order_by(ClientIntakeForm.created_at.desc())
        )
        .scalars()
        .all()
    )

    def matches(row: ClientIntakeForm) -> bool:
        if q:
            needle = q.lower()
            haystack = " ".join(
                filter(
                    None,
                    [
                        row.org_name,
                        row.project_title,
                        row.project_summary,
                        row.project_description,
                        row.org_industry,
                        row.project_sector,
                    ],
                )
            ).lower()
            if needle not in haystack:
                return False
        if organization and organization.lower() not in (row.org_name or "").lower():
            return False
        if domain:
            domains = (
                row.technical_domains if isinstance(row.technical_domains, list) else []
            )
            if domain not in domains and domain != (row.project_sector or ""):
                return False
        return True

    filtered = [row for row in rows if matches(row)]
    sliced = filtered[offset : offset + limit]

    out: list[ProjectOut] = []
    for row in sliced:
        domains = (
            row.technical_domains if isinstance(row.technical_domains, list) else []
        )
        skills = row.required_skills if isinstance(row.required_skills, list) else []
        out.append(
            ProjectOut(
                id=row.org_name,
                title=row.project_title or row.org_name,
                description=row.project_description or row.project_summary or "",
                duration_weeks=None,
                difficulty=None,
                modality=None,
                cadence=None,
                confidentiality=None,
                min_hours_per_week=None,
                max_hours_per_week=None,
                domain=domains[0] if domains else row.project_sector,
                organization=row.org_name,
                tags=skills,
                skills=skills,
                avg_rating=None,
                ratings_count=0,
                created_at=row.created_at,
            )
        )

    return out


@router.get("/projects/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    row = (
        db.execute(
            select(ClientIntakeForm).where(ClientIntakeForm.org_name == project_id)
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    def to_list(value) -> list[str]:
        if isinstance(value, list):
            return [str(v) for v in value if v]
        if value:
            return [str(value)]
        return []

    return ProjectDetailOut(
        id=row.org_name,
        organization=row.org_name,
        title=row.project_title or row.org_name,
        summary=row.project_summary,
        description=row.project_description or row.project_summary,
        org_industry=row.org_industry,
        org_industry_other=row.org_industry_other,
        org_website=row.org_website,
        minimum_deliverables=row.minimum_deliverables,
        stretch_goals=row.stretch_goals,
        long_term_impact=row.long_term_impact,
        scope_clarity=row.scope_clarity,
        scope_clarity_other=row.scope_clarity_other,
        publication_potential=row.publication_potential,
        data_access=row.data_access,
        project_sector=row.project_sector,
        required_skills=to_list(row.required_skills),
        required_skills_other=row.required_skills_other,
        technical_domains=to_list(row.technical_domains),
        supplementary_documents=to_list(row.supplementary_documents),
        video_links=to_list(row.video_links),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("/search/projects", response_model=List[ProjectOut])
def search_projects(payload: SearchProjectsIn, db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(ClientIntakeForm).order_by(ClientIntakeForm.created_at.desc())
        )
        .scalars()
        .all()
    )

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
        if payload.q:
            haystack_parts = [
                row.org_name,
                row.project_title,
                row.project_summary,
                row.project_description,
                row.org_industry,
                row.org_industry_other,
                row.project_sector,
                row.required_skills_other,
            ]
            haystack_parts += to_list(row.required_skills)
            haystack_parts += to_list(row.technical_domains)
            haystack = " ".join(filter(None, haystack_parts)).lower()
            if payload.q.lower() not in haystack:
                return False

        if payload.organization and not contains_substring(
            payload.organization, row.org_name or ""
        ):
            return False

        match_mode = (payload.match_mode or "and").lower()

        if payload.domains:
            domain_candidates = to_list(row.technical_domains)
            if row.project_sector:
                domain_candidates.append(row.project_sector)
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
            industry_candidates = [
                v for v in [row.org_industry, row.org_industry_other] if v
            ]
            industry_match = (
                matches_any(payload.industries, industry_candidates)
                if match_mode == "or"
                else matches_all(payload.industries, industry_candidates)
            )
            if not industry_match:
                return False

        return True

    filtered = [row for row in rows if matches(row)]

    limit = max(1, min(payload.limit, 200))
    offset = max(payload.offset, 0)
    sliced = filtered[offset : offset + limit]

    out: list[ProjectOut] = []
    for row in sliced:
        domains = (
            row.technical_domains if isinstance(row.technical_domains, list) else []
        )
        skills = row.required_skills if isinstance(row.required_skills, list) else []
        out.append(
            ProjectOut(
                id=row.org_name,
                title=row.project_title or row.org_name,
                description=row.project_description or row.project_summary or "",
                duration_weeks=None,
                difficulty=None,
                modality=None,
                cadence=None,
                confidentiality=None,
                min_hours_per_week=None,
                max_hours_per_week=None,
                domain=domains[0] if domains else row.project_sector,
                organization=row.org_name,
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


def _fetch_project_cards(db: Session, project_ids: list[str]) -> list[ProjectCardOut]:
    if not project_ids:
        return []

    rows = (
        db.execute(
            select(ClientIntakeForm).where(ClientIntakeForm.org_name.in_(project_ids))
        )
        .scalars()
        .all()
    )

    cards = []
    for row in rows:
        skills = row.required_skills if isinstance(row.required_skills, list) else []
        cards.append(
            ProjectCardOut(
                id=row.org_name,
                title=row.project_title or row.org_name,
                organization=row.org_name,
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
    cart = _get_or_create_open_cart(db, current_user.id)

    existing = (
        db.execute(
            select(CartItem).where(
                CartItem.cart_id == cart.id, CartItem.org_name == payload.project_id
            )
        )
        .scalars()
        .first()
    )
    if existing:
        return get_cart(db=db, current_user=current_user)

    selected = db.execute(
        select(func.count(CartItem.org_name)).where(CartItem.cart_id == cart.id)
    ).scalar_one()
    if selected >= 10:
        return get_cart(db=db, current_user=current_user)

    db.add(CartItem(cart_id=cart.id, org_name=payload.project_id))
    db.commit()

    return get_cart(db=db, current_user=current_user)


@router.delete("/cart/items/{project_id}", response_model=CartOut)
def remove_from_cart(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        CartItem.cart_id == cart.id, CartItem.org_name == project_id
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
        db.execute(select(CartItem.org_name).where(CartItem.cart_id == cart.id))
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
    _ensure_teammate_prefs_schema(db)
    rows = db.execute(
        select(
            TeammatePreference.payload_ciphertext,
            TeammatePreference.student_id,
            TeammatePreference.preference,
        ).where(TeammatePreference.user_id == current_user.id)
    ).all()
    want_ids: list[int] = []
    avoid_ids: list[int] = []
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
            avoid_reason = payload.get("avoid_reason")
        else:
            avoid_reason = None

        if not student_id or not preference:
            continue
        if preference == "want":
            want_ids.append(int(student_id))
        if preference == "avoid":
            avoid_ids.append(int(student_id))
            if avoid_reason:
                avoid_reasons[int(student_id)] = str(avoid_reason)
    return TeammateChoicesOut(
        want_ids=want_ids, avoid_ids=avoid_ids, avoid_reasons=avoid_reasons
    )


@router.post("/teammate-choices", response_model=TeammateChoicesOut)
def set_teammate_choices(
    payload: TeammateChoicesIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_teammate_prefs_schema(db)
    if len(payload.want_ids) > 5 or len(payload.avoid_ids) > 5:
        raise HTTPException(
            status_code=400, detail="Each list must have at most 5 students"
        )

    if set(payload.want_ids) & set(payload.avoid_ids):
        raise HTTPException(status_code=400, detail="A student cannot be in both lists")

    db.execute(
        select(TeammatePreference).where(TeammatePreference.user_id == current_user.id)
    )
    db.query(TeammatePreference).filter(
        TeammatePreference.user_id == current_user.id
    ).delete()

    for sid in payload.want_ids:
        try:
            ciphertext, student_hash = encrypt_teammate_choice(sid, "want")
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
            reason = payload.avoid_reasons.get(sid) or ""
            ciphertext, student_hash = encrypt_teammate_choice(sid, "avoid", reason)
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
    return TeammateChoicesOut(
        want_ids=payload.want_ids,
        avoid_ids=payload.avoid_ids,
        avoid_reasons=payload.avoid_reasons,
    )


@router.get("/ratings", response_model=List[RatingOut])
def get_ratings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_ratings_schema(db)
    rows = db.execute(
        select(Rating.org_name, Rating.rating).where(Rating.user_id == current_user.id)
    ).all()
    return [RatingOut(project_id=org_name, rating=rating) for org_name, rating in rows]


@router.post("/ratings", response_model=RatingOut)
def save_rating(
    payload: RatingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_ratings_schema(db)
    if payload.rating < 1 or payload.rating > 10:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 10")

    stmt = (
        insert(Rating)
        .values(
            user_id=current_user.id,
            org_name=payload.project_id,
            rating=payload.rating,
        )
        .on_conflict_do_update(
            index_elements=[Rating.user_id, Rating.org_name],
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

    ranking_items = (
        db.execute(
            select(RankingItem)
            .where(RankingItem.ranking_id == ranking.id)
            .order_by(RankingItem.rank.asc())
        )
        .scalars()
        .all()
    )
    top_ids = [item.org_name for item in ranking_items]

    cart = (
        db.execute(
            select(Cart)
            .where(Cart.user_id == current_user.id, Cart.status == "open")
            .order_by(Cart.id.desc())
        )
        .scalars()
        .first()
    )
    cart_ids: list[str] = []
    if cart:
        cart_ids = (
            db.execute(select(CartItem.org_name).where(CartItem.cart_id == cart.id))
            .scalars()
            .all()
        )

    top_ids = [pid for pid in top_ids if pid in cart_ids]
    additional_ids = [pid for pid in cart_ids if pid not in top_ids]

    return RankingsOut(
        top_ten=_fetch_project_cards(db, top_ids),
        additional=_fetch_project_cards(db, additional_ids),
        ranked_count=len(top_ids),
    )


@router.post("/rankings", response_model=RankingsOut)
def save_rankings(
    payload: RankingsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(payload.top_ten_ids) > 10:
        raise HTTPException(status_code=400, detail="Top 10 max")

    if len(set(payload.top_ten_ids)) != len(payload.top_ten_ids):
        raise HTTPException(status_code=400, detail="Duplicate project")

    ranking = _get_or_create_ranking(db, current_user.id)

    db.query(RankingItem).filter(RankingItem.ranking_id == ranking.id).delete()
    for index, project_id in enumerate(payload.top_ten_ids, start=1):
        db.add(RankingItem(ranking_id=ranking.id, org_name=project_id, rank=index))
    db.commit()

    return get_rankings(db=db, current_user=current_user)
