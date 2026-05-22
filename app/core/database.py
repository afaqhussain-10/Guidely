"""
Database configuration module for Guidely application.

This module sets up SQLAlchemy 2.0 engine, session management, and base class
for all database models.
"""

from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from app.core.config import settings


# Create SQLAlchemy engine
# The engine manages connections to the database
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # Log SQL queries in debug mode
    pool_pre_ping=True,  # Verify connections before using them
    pool_size=10,  # Maximum number of connections to keep in the pool
    max_overflow=20,  # Maximum number of connections that can be created beyond pool_size
)

# Create SessionLocal class
# Each instance of SessionLocal will be a database session
SessionLocal = sessionmaker(
    autocommit=False,  # Don't auto-commit transactions
    autoflush=False,  # Don't auto-flush changes to the database
    bind=engine,  # Bind to our engine
)

# Create Base class for all models
# All SQLAlchemy models will inherit from this Base class
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency function for FastAPI routes to get database sessions.
    
    This function creates a new database session for each request and
    ensures it's properly closed after the request is completed.
    
    Usage in FastAPI routes:
        @app.get("/items")
        def read_items(db: Session = Depends(get_db)):
            # Use db session here
            pass
    
    Yields:
        Session: SQLAlchemy database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
