"""
Demo routes for Guidely application.

This module defines API endpoints for managing demonstrations,
including creation, updates, and retrieval.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.demo import Demo
from app.schemas.demo import DemoCreate, DemoUpdate, DemoResponse
from app.services.video_processor import video_processor
from app.services.local_storage import local_storage


# Create router instance
router = APIRouter(prefix="/demos", tags=["demos"])


@router.post("", response_model=DemoResponse, status_code=status.HTTP_201_CREATED)
def create_demo(
    demo: DemoCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new demo.
    
    This endpoint creates a new demonstration record in the database.
    The demo starts with a "processing" status and will be updated
    once the video recording is complete.
    
    Args:
        demo: Demo creation data (title, language)
        db: Database session
    
    Returns:
        DemoResponse: Created demo details
    
    Raises:
        HTTPException: If demo creation fails
    """
    try:
        # Create new demo instance
        new_demo = Demo(
            title=demo.title,
            language=demo.language,
            status="processing"
        )
        
        # Add to database
        db.add(new_demo)
        db.commit()
        db.refresh(new_demo)
        
        return new_demo
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create demo: {str(e)}"
        )


@router.patch("/{demo_id}", response_model=DemoResponse)
async def update_demo(
    demo_id: UUID,
    video: UploadFile = File(...),
    status: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Update demo after recording ends.
    
    This endpoint handles video upload and processing after a demo recording
    is completed. It processes the video, uploads to S3, and updates the
    demo record with video URL, duration, and status.
    
    Args:
        demo_id: UUID of the demo to update
        video: Uploaded video file
        status: Optional status update (e.g., "completed", "failed")
        db: Database session
    
    Returns:
        DemoResponse: Updated demo details
    
    Raises:
        HTTPException: If demo not found or update fails
    """
    try:
        # Find demo in database
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )
        
        # Read video file content
        video_content = await video.read()
        
        # Process video (convert to MP4 and get duration)
        processed_video_path, duration = video_processor.process_video(
            video_content,
            video.filename
        )
        
        # Read processed video file
        with open(processed_video_path, 'rb') as f:
            processed_video_content = f.read()
        
        # Upload video to local storage
        video_url = local_storage.save_video(processed_video_content, demo_id)
        
        # Clean up temporary processed file
        video_processor.cleanup_processed_file(processed_video_path)
        
        # Update demo in database
        demo.video_url = video_url
        demo.duration = duration
        
        if status:
            demo.status = status
        else:
            demo.status = "completed"
        
        db.commit()
        db.refresh(demo)
        
        return demo
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update demo: {str(e)}"
        )


@router.get("/{demo_id}", response_model=DemoResponse)
def get_demo(
    demo_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get single demo details.
    
    This endpoint retrieves detailed information about a specific demo
    by its UUID.
    
    Args:
        demo_id: UUID of the demo to retrieve
        db: Database session
    
    Returns:
        DemoResponse: Demo details
    
    Raises:
        HTTPException: If demo not found
    """
    try:
        # Find demo in database
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )
        
        return demo
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve demo: {str(e)}"
        )
