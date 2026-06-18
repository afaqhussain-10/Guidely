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
    
    viewport_width: Optional[float] = Field(
        default=None,
        description="Viewport width at the time of capturing this step",
        ge=0
    )
    
    viewport_height: Optional[float] = Field(
        default=None,
        description="Viewport height at the time of capturing this step",
        ge=0
    )
    
    image_url: Optional[str] = Field(
        default=None,
        description="URL to the screenshot image for this step"
    )

    video_url: Optional[str] = Field(
        default=None,
        description="URL to the lead-up video clip for this step"
    )

    hotspot_text: Optional[str] = Field(
        default=None,
        description="Short hotspot tooltip text shown in the player",
        examples=['Click on "Submit".']
    )


class UploadSpec(BaseModel):
    """Client upload instructions for split media sync."""

    method: str = Field(description="HTTP method (PATCH, PUT, POST)")
    url: str = Field(description="Absolute or API-relative upload URL")
    multipart: bool = Field(default=False, description="Use multipart form upload")
    field: Optional[str] = Field(default=None, description="Form field name for multipart")
    headers: Optional[dict] = Field(default=None, description="Extra headers for direct upload")
    public_url: Optional[str] = Field(
        default=None,
        description="Expected public URL after direct S3 upload completes"
    )


class StepSyncStatusItem(BaseModel):
    step_id: UUID
    step_number: int
    has_screenshot: bool
    has_video: bool


class DemoSyncStatusResponse(BaseModel):
    demo_id: UUID
    all_media_present: bool
    steps: list[StepSyncStatusItem]
    summary: dict


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
    
    viewport_width: Optional[float] = Field(
        default=None,
        description="Viewport width at the time of capturing this step"
    )
    
    viewport_height: Optional[float] = Field(
        default=None,
        description="Viewport height at the time of capturing this step"
    )
    
    image_url: Optional[str] = Field(
        default=None,
        description="URL to the screenshot image for this step"
    )

    video_url: Optional[str] = Field(
        default=None,
        description="URL to the lead-up video clip for this step"
    )
    
    ai_description_en: Optional[str] = Field(
        default=None,
        description="AI-generated description of the step in English"
    )
    
    ai_description_ar: Optional[str] = Field(
        default=None,
        description="AI-generated description of the step in Arabic"
    )

    hotspot_text: Optional[str] = Field(
        default=None,
        description="Short hotspot tooltip text shown in the player"
    )
    
    created_at: datetime = Field(
        description="Timestamp when the step was created"
    )
    
    class Config:
        """Pydantic configuration"""
        from_attributes = True  # Enable ORM mode for SQLAlchemy models (Pydantic v2)


class StepMetadataResponse(StepResponse):
    """Step created from metadata only, with optional upload specs."""

    screenshot_upload: Optional[UploadSpec] = None
    video_upload: Optional[UploadSpec] = None
