"""
Step model for Guidely application.

This module defines the Step model which represents individual steps
within a demonstration guide.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Step(Base):
    """
    Step model representing an individual step in a demonstration.
    
    Each step contains information about a specific action performed in the demo,
    including coordinates, screenshots, and AI-generated descriptions in multiple languages.
    """
    
    __tablename__ = "steps"
    
    # Primary Key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
        comment="Unique identifier for the step"
    )
    
    # Foreign Key to Demo
    demo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("demos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Reference to the parent demo"
    )
    
    # Step Information
    step_number = Column(
        Integer,
        nullable=False,
        comment="Sequential number of this step within the demo"
    )
    
    action = Column(
        String,
        nullable=True,
        comment="Type of action performed (e.g., click, scroll, type, hover)"
    )
    
    element = Column(
        String,
        nullable=True,
        comment="Target element or component for the action"
    )
    
    # Coordinates
    coord_x = Column(
        Float,
        nullable=True,
        comment="X-coordinate of the action on the screen"
    )
    
    coord_y = Column(
        Float,
        nullable=True,
        comment="Y-coordinate of the action on the screen"
    )
    
    # Media
    image_url = Column(
        String,
        nullable=True,
        comment="URL to the screenshot image for this step (S3 or local storage)"
    )
    
    # AI-Generated Descriptions
    ai_description_en = Column(
        Text,
        nullable=True,
        comment="AI-generated description of the step in English"
    )
    
    ai_description_ar = Column(
        Text,
        nullable=True,
        comment="AI-generated description of the step in Arabic"
    )
    
    # Timestamps
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="Timestamp when the step was created"
    )
    
    # Relationships
    demo = relationship(
        "Demo",
        back_populates="steps"
    )
    
    def __repr__(self) -> str:
        """String representation of Step model"""
        return f"<Step(id={self.id}, demo_id={self.demo_id}, step_number={self.step_number}, action={self.action})>"
