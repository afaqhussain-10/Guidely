"""
Demo model for Guidely application.

This module defines the Demo model which represents a video demonstration
that can be processed into step-by-step guides.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Demo(Base):
    """
    Demo model representing a video demonstration.
    
    A demo is the main entity that contains information about an uploaded video
    and its processing status. Each demo can have multiple steps associated with it.
    """
    
    __tablename__ = "demos"
    
    # Primary Key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
        comment="Unique identifier for the demo"
    )
    
    # Demo Information
    title = Column(
        String,
        nullable=True,
        comment="Title or name of the demonstration"
    )
    
    status = Column(
        String,
        default="processing",
        nullable=False,
        comment="Processing status: processing, completed, failed"
    )
    
    video_url = Column(
        String,
        nullable=True,
        comment="URL to the uploaded video file (S3 or local storage)"
    )
    
    duration = Column(
        Integer,
        nullable=True,
        comment="Video duration in seconds"
    )
    
    language = Column(
        String,
        default="en",
        nullable=False,
        comment="Language code for the demonstration (e.g., 'en', 'es', 'fr')"
    )
    
    # Timestamps
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="Timestamp when the demo was created"
    )
    
    # Relationships
    steps = relationship(
        "Step",
        back_populates="demo",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        """String representation of Demo model"""
        return f"<Demo(id={self.id}, title={self.title}, status={self.status})>"
