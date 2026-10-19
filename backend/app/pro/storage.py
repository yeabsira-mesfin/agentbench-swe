"""JSON evidence on SQLAlchemy, SQLite locally or PostgreSQL in deployments."""
import os
from functools import lru_cache
from sqlalchemy import JSON, Column, MetaData, String, Table, create_engine

metadata = MetaData()
runs = Table("pro_evaluations_v1", metadata,
    Column("id", String(36), primary_key=True),
    Column("created_at", String(40), nullable=False, index=True),
    Column("record", JSON, nullable=False))


@lru_cache(maxsize=4)
def connect(url):
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(url, pool_pre_ping=True, **({"connect_args": {"check_same_thread": False, "timeout": 10}} if url.startswith("sqlite") else {}))
    metadata.create_all(engine)
    return engine


def database():
    return connect(os.getenv("DATABASE_URL", "sqlite:///./agentbench.db"))


def save(record, new=False):
    with database().begin() as db:
        if new:
            db.execute(runs.insert().values(id=record["id"], created_at=record["created_at"], record=record))
        else:
            db.execute(runs.update().where(runs.c.id == record["id"]).values(record=record))


def get(id):
    with database().connect() as db:
        return db.execute(runs.select().with_only_columns(runs.c.record).where(runs.c.id == id)).scalar_one_or_none()


def list_records():
    with database().connect() as db:
        return list(db.execute(runs.select().with_only_columns(runs.c.record).order_by(runs.c.created_at.desc(), runs.c.id)).scalars())
