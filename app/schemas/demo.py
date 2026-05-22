"""
Demo schemas for Guidely application.

This module defines Pydantic schemas for Demo model validation and serialization.
These schemas are used for request/response handling in FastAPI routes.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DemoCreate(BaseModel):
    """
    Schema for creating a new demo via POST /api/demos.
    
    This schema is used when clients submit a request to create a new demonstration.
    The title is required to identify the demo.
    """
    
    title: str = Field(
        description="Title or name of the demonstration",
        examples=["How to create a user account"],
        min_length=1,
        max_length=255
    )
    
    language: str = Field(
        default="en",
        description="Language code for the demonstration",
        examples=["en", "ar", "es", "fr"]
    )


class DemoUpdate(BaseModel):
    """
    Schema for updating an existing demo via PATCH /api/demos/{id}.
    
    This schema is used when clients want to update specific fields of a demo.
    All fields are optional to allow partial updates.
    """
    
    status: Optional[str] = Field(
        default=None,
        description="Processing status of the demo",
        examples=["processing", "completed", "failed"]
    )
    
    video_url: Optional[str] = Field(
        default=None,
        description="URL to the uploaded video file"
    )
    
    duration: Optional[int] = Field(
        default=None,
        description="Video duration in seconds",
        ge=0
    )


class DemoResponse(BaseModel):
    """
    Schema for demo response data.
    
    This schema is used when returning demo data to clients in API responses.
    It includes all relevant fields from the database model.
    """
    
    id: UUID = Field(
        description="Unique identifier for the demo"
    )
    
    title: str = Field(
        description="Title or name of the demonstration"
    )
    
    status: str = Field(
        description="Processing status of the demo",
        examples=["processing", "completed", "failed"]
    )
    
    video_url: Optional[str] = Field(
        default=None,
        description="URL to the uploaded video file"
    )
    
    duration: Optional[int] = Field(
        default=None,
        description="Video duration in seconds"
    )
    
    language: str = Field(
        description="Language code for the demonstration"
    )
    
    created_at: datetime = Field(
        description="Timestamp when the demo was created"
    )
    
    class Config:
        """Pydantic configuration"""
        from_attributes = True  # Enable ORM mode for SQLAlchemy models (Pydantic v2)
