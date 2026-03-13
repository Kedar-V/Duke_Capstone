import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def _get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    url = 'postgresql+psycopg2://postgres:postgresduke@duke-capstone.cnwm886wwadv.us-east-1.rds.amazonaws.com:5432/postgres'
    if url:
        return url
    raise RuntimeError("DATABASE_URL is not set. Point it to your RDS instance.")


DATABASE_URL = _get_database_url()

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
