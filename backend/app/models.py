from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Cohort(Base):
    __tablename__ = "cohorts"

    id = Column(BigInteger, primary_key=True)
    name = Column(Text, unique=True, nullable=False)
    program = Column(Text)
    year = Column(Integer)
    rankings_editable_until = Column(DateTime(timezone=True))
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Company(Base):
    __tablename__ = "companies"

    id = Column(BigInteger, primary_key=True)
    name = Column(Text, unique=True, nullable=False)
    sector = Column(Text)
    industry = Column(Text)
    website = Column(Text)
    logo_url = Column(Text)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)
    email = Column(Text, unique=True)
    display_name = Column(Text)
    profile_image_url = Column(Text)
    password_hash = Column(Text)
    role = Column(Text, nullable=False, server_default="student")
    cohort_id = Column(BigInteger, ForeignKey("cohorts.id", ondelete="SET NULL"))
    deleted_at = Column(DateTime(timezone=True))
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    avg_match_score = Column(Integer, nullable=False, server_default="86")
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Student(Base):
    __tablename__ = "students"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )
    full_name = Column(Text, nullable=False)
    email = Column(Text, unique=True)
    program = Column(Text)
    cohort_id = Column(BigInteger, ForeignKey("cohorts.id", ondelete="SET NULL"))
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FacultyProfile(Base):
    __tablename__ = "faculty_profiles"

    user_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    department = Column(Text)
    title = Column(Text)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TeammatePreference(Base):
    __tablename__ = "teammate_preferences"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "student_id_hash",
            name="uq_teammate_pref_user_student_hash",
        ),
        CheckConstraint(
            "preference in ('want','avoid')",
            name="ck_teammate_pref_preference",
        ),
    )

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    student_id_hash = Column(Text, nullable=True)
    payload_ciphertext = Column(Text, nullable=True)
    student_id = Column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=True
    )
    preference = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Project(Base):
    __tablename__ = "projects"

    project_id = Column(BigInteger, primary_key=True)
    slug = Column(Text, unique=True)
    raw = Column(JSONB, nullable=False, server_default="{}")
    contact_name = Column(Text)
    contact_email = Column(Text)
    project_title = Column(Text)
    project_summary = Column(Text)
    project_description = Column(Text)
    minimum_deliverables = Column(Text)
    stretch_goals = Column(Text)
    long_term_impact = Column(Text)
    scope_clarity = Column(Text)
    scope_clarity_other = Column(Text)
    publication_potential = Column(Text)
    required_skills = Column(JSONB, nullable=False, server_default="[]")
    required_skills_other = Column(Text)
    technical_domains = Column(JSONB, nullable=False, server_default="[]")
    data_access = Column(Text)
    supplementary_documents = Column(JSONB, nullable=False, server_default="[]")
    video_links = Column(JSONB, nullable=False, server_default="[]")
    cohort_id = Column(BigInteger, ForeignKey("cohorts.id", ondelete="SET NULL"))
    edit_token = Column(Text, unique=True)
    edit_url = Column(Text)
    revisions = Column(JSONB, nullable=False, server_default="[]")
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    project_status = Column(Text, nullable=False, server_default="draft")
    published_at = Column(DateTime(timezone=True))
    archived_at = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True))


class ProjectCompany(Base):
    __tablename__ = "project_companies"

    project_id = Column(
        BigInteger,
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        primary_key=True,
    )
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Cart(Base):
    __tablename__ = "carts"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    status = Column(Text, nullable=False, server_default="open")
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CartItem(Base):
    __tablename__ = "cart_items"

    cart_id = Column(
        BigInteger, ForeignKey("carts.id", ondelete="CASCADE"), primary_key=True
    )
    project_id = Column(
        BigInteger,
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Ranking(Base):
    __tablename__ = "rankings"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    is_submitted = Column(Boolean, nullable=False, server_default="false")
    submitted_at = Column(DateTime(timezone=True))


class RankingItem(Base):
    __tablename__ = "ranking_items"
    __table_args__ = (
        UniqueConstraint("ranking_id", "rank", name="uq_ranking_items_rank"),
        CheckConstraint("rank between 1 and 10", name="ck_ranking_items_rank"),
    )

    ranking_id = Column(
        BigInteger, ForeignKey("rankings.id", ondelete="CASCADE"), primary_key=True
    )
    project_id = Column(
        BigInteger,
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        primary_key=True,
    )
    rank = Column(Integer, nullable=False)
    added_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_ratings_user_project"),
        CheckConstraint("rating between 1 and 10", name="ck_ratings_rating"),
    )

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id = Column(
        BigInteger,
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        nullable=False,
    )
    rating = Column(Integer, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProjectComment(Base):
    __tablename__ = "project_comments"

    id = Column(BigInteger, primary_key=True)
    project_id = Column(
        BigInteger,
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    comment = Column(Text, nullable=False)
    is_resolved = Column(Boolean, nullable=False, server_default="false")
    resolved_at = Column(DateTime(timezone=True))
    resolved_by_user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# Backward-compatible alias while older imports still use the legacy name.
ClientIntakeForm = Project


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id = Column(BigInteger, primary_key=True)
    admin_user_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    action = Column(Text, nullable=False)
    target_type = Column(Text, nullable=False)
    target_id = Column(Text)
    details = Column(JSONB, nullable=False, server_default="{}")
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AssignmentRuleConfig(Base):
    __tablename__ = "assignment_rule_configs"
    __table_args__ = (
        CheckConstraint(
            "team_size between 2 and 8", name="ck_assignment_rule_team_size"
        ),
        CheckConstraint(
            "min_team_size between 2 and 8",
            name="ck_assignment_rule_min_team_size",
        ),
        CheckConstraint(
            "max_team_size between 2 and 8",
            name="ck_assignment_rule_max_team_size",
        ),
        CheckConstraint(
            "min_team_size <= team_size AND team_size <= max_team_size",
            name="ck_assignment_rule_team_size_range",
        ),
        CheckConstraint(
            "max_low_preference_per_team between 0 and 8",
            name="ck_assignment_rule_max_low_pref",
        ),
        CheckConstraint(
            "weight_project_preference between 0 and 100",
            name="ck_assignment_rule_weight_project_pref",
        ),
        CheckConstraint(
            "weight_mutual_want between 0 and 100",
            name="ck_assignment_rule_weight_mutual_want",
        ),
        CheckConstraint(
            "weight_fairness between 0 and 100",
            name="ck_assignment_rule_weight_fairness",
        ),
        CheckConstraint(
            "weight_skill_balance between 0 and 100",
            name="ck_assignment_rule_weight_skill_balance",
        ),
        CheckConstraint(
            "weight_project_rating between 0 and 100",
            name="ck_assignment_rule_weight_project_rating",
        ),
        CheckConstraint(
            "penalty_avoid between 0 and 1000",
            name="ck_assignment_rule_penalty_avoid",
        ),
    )

    id = Column(BigInteger, primary_key=True)
    name = Column(Text, nullable=False)
    cohort_id = Column(BigInteger, ForeignKey("cohorts.id", ondelete="SET NULL"))
    is_active = Column(Boolean, nullable=False, server_default="false")

    team_size = Column(Integer, nullable=False, server_default="4")
    min_team_size = Column(Integer, nullable=False, server_default="3")
    max_team_size = Column(Integer, nullable=False, server_default="5")
    enforce_same_cohort = Column(Boolean, nullable=False, server_default="true")
    hard_avoid = Column(Boolean, nullable=False, server_default="true")
    max_low_preference_per_team = Column(Integer, nullable=False, server_default="1")

    weight_project_preference = Column(Integer, nullable=False, server_default="55")
    weight_project_rating = Column(Integer, nullable=False, server_default="15")
    weight_mutual_want = Column(Integer, nullable=False, server_default="25")
    weight_fairness = Column(Integer, nullable=False, server_default="10")
    weight_skill_balance = Column(Integer, nullable=False, server_default="10")
    penalty_avoid = Column(Integer, nullable=False, server_default="100")

    notes = Column(Text)
    extra_rules = Column(JSONB, nullable=False, server_default="{}")

    created_by_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
