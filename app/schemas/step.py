"""
Step schemas for Guidely application.

This module defines Pydantic schemas for Step model validation and serialization.
These schemas are used for request/response handling in FastAPI routes.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class StepCreate(BaseModel):
    """
    Schema for creating a new step via POST /api/demos/{id}/steps.
    
    This schema is used when clients submit a request to create a new step
    within a demonstration. The step_number is required to maintain order.
    """
    
    step_number: int = Field(
        description="Sequential number of this step within the demo",
        ge=1,
        examples=[1, 2, 3]
    )
    
    action: Optional[str] = Field(
        default=None,
        description="Type of action performed",
        examples=["click", "scroll", "type", "hover", "drag"]
    )
    
    element: Optional[str] = Field(
        default=None,
        description="Target element or component for the action",
        examples=["button", "input", "link", "dropdown"]
    )
    
    coord_x: Optional[float] = Field(
        default=None,
        description="X-coordinate of the action on the screen",
        ge=0
    )
    
    coord_y: Optional[float] = Field(
        default=None,
        description="Y-coordinate of the action on the screen",
        ge=0
    )
    
    image_url: Optional[str] = Field(
        default=None,
        description="URL to the screenshot image for this step"
    )


class StepResponse(BaseModel):
    """
    Schema for step response data.
    
    This schema is used when returning step data to clients in API responses.
    It includes all relevant fields from the database model, including AI-generated
    descriptions in multiple languages.
    """
    
    id: UUID = Field(
        description="Unique identifier for the step"
    )
    
    demo_id: UUID = Field(
        description="Reference to the parent demo"
    )
    
    step_number: int = Field(
        description="Sequential number of this step within the demo"
    )
    
    action: Optional[str] = Field(
        default=None,
        description="Type of action performed"
    )
    
    element: Optional[str] = Field(
        default=None,
        description="Target element or component for the action"
    )
    
    coord_x: Optional[float] = Field(
        default=None,
        description="X-coordinate of the action on the screen"
    )
    
    coord_y: Optional[float] = Field(
        default=None,
        description="Y-coordinate of the action on the screen"
    )
    
    image_url: Optional[str] = Field(
        default=None,
        description="URL to the screenshot image for this step"
    )
    
    ai_description_en: Optional[str] = Field(
        default=None,
        description="AI-generated description of the step in English"
    )
    
    ai_description_ar: Optional[str] = Field(
        default=None,
        description="AI-generated description of the step in Arabic"
    )
    
    created_at: datetime = Field(
        description="Timestamp when the step was created"
    )
    
    class Config:
        """Pydantic configuration"""
        from_attributes = True  # Enable ORM mode for SQLAlchemy models (Pydantic v2)
