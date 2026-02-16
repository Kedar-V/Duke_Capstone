from sqlalchemy import (
    BigInteger,
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


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)
    email = Column(Text, unique=True)
    display_name = Column(Text)
    password_hash = Column(Text)
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
    full_name = Column(Text, nullable=False)
    email = Column(Text, unique=True)
    program = Column(Text)
    created_at = Column(
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


class ClientIntakeForm(Base):
    __tablename__ = "client_intake_forms"

    org_name = Column(Text, primary_key=True)
    raw = Column(JSONB, nullable=False, server_default="{}")
    org_industry = Column(Text)
    org_industry_other = Column(Text)
    org_website = Column(Text)
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
    project_sector = Column(Text)
    supplementary_documents = Column(JSONB, nullable=False, server_default="[]")
    video_links = Column(JSONB, nullable=False, server_default="[]")
    edit_token = Column(Text, unique=True)
    edit_url = Column(Text)
    revisions = Column(JSONB, nullable=False, server_default="[]")
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
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
    org_name = Column(
        Text,
        ForeignKey("client_intake_forms.org_name", ondelete="CASCADE"),
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


class RankingItem(Base):
    __tablename__ = "ranking_items"
    __table_args__ = (
        UniqueConstraint("ranking_id", "rank", name="uq_ranking_items_rank"),
        CheckConstraint("rank between 1 and 10", name="ck_ranking_items_rank"),
    )

    ranking_id = Column(
        BigInteger, ForeignKey("rankings.id", ondelete="CASCADE"), primary_key=True
    )
    org_name = Column(
        Text,
        ForeignKey("client_intake_forms.org_name", ondelete="CASCADE"),
        primary_key=True,
    )
    rank = Column(Integer, nullable=False)
    added_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "org_name", name="uq_ratings_user_project"),
        CheckConstraint("rating between 1 and 5", name="ck_ratings_rating"),
    )

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    org_name = Column(
        Text,
        ForeignKey("client_intake_forms.org_name", ondelete="CASCADE"),
        nullable=False,
    )
    rating = Column(Integer, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
