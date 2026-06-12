"""
Demo routes for Guidely application.

This module defines API endpoints for managing demonstrations,
including creation, updates, and retrieval.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import Optional, List
import shutil
import os

from app.core.database import get_db
from app.models.demo import Demo
from app.models.step import Step
from app.schemas.demo import DemoCreate, DemoUpdate, DemoResponse
from app.services.video_processor import video_processor
from app.services.local_storage import local_storage


# Create router instance
router = APIRouter(prefix="/demos", tags=["demos"])


@router.get("", response_model=List[DemoResponse])
def get_demos(
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Get all demos list.
    
    This endpoint retrieves a list of all demonstrations ordered by
    creation date (newest first) with optional limit for pagination.
    
    Args:
        limit: Maximum number of demos to return (default: 50, max: 100)
        db: Database session
    
    Returns:
        List[DemoResponse]: List of demos ordered by created_at descending
    
    Raises:
        HTTPException: If retrieval fails
    """
    try:
        # Query all demos ordered by created_at descending (newest first)
        demos = db.query(Demo)\
            .order_by(Demo.created_at.desc())\
            .limit(limit)\
            .all()
        
        return demos
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve demos: {str(e)}"
        )


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
def update_demo(
    demo_id: UUID,
    demo_update: DemoUpdate,
    db: Session = Depends(get_db)
):
    """
    Update demo metadata (title, status).
    
    This endpoint allows updating demo metadata fields like title and status
    without requiring a video upload. Used for renaming demos or changing
    their status.
    
    Args:
        demo_id: UUID of the demo to update
        demo_update: Demo update data (title, status)
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
        
        # Update fields if provided
        if demo_update.title is not None:
            demo.title = demo_update.title
        
        if demo_update.status is not None:
            demo.status = demo_update.status
        
        if demo_update.video_url is not None:
            demo.video_url = demo_update.video_url
        
        if demo_update.duration is not None:
            demo.duration = demo_update.duration
        
        # Commit changes
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


@router.patch("/{demo_id}/video", response_model=DemoResponse)
async def update_demo_video(
    demo_id: UUID,
    video: UploadFile = File(...),
    status: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Update demo with video upload.
    
    This endpoint handles video upload and processing after a demo recording
    is completed. It processes the video, uploads to local storage, and updates the
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
            detail=f"Failed to update demo with video: {str(e)}"
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


@router.delete("/{demo_id}")
def delete_demo(
    demo_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Delete a demo and all its related steps.
    
    This endpoint deletes a demonstration and all associated steps
    from the database. The deletion is cascaded to ensure data integrity.
    
    Args:
        demo_id: UUID of the demo to delete
        db: Database session
    
    Returns:
        dict: Success message
    
    Raises:
        HTTPException: If demo not found or deletion fails
    """
    try:
        # Find demo in database
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )
        
        # Delete all steps related to this demo
        db.query(Step).filter(Step.demo_id == demo_id).delete()
        
        # Delete screenshots folder
        screenshots_path = f"static/screenshots/{demo_id}"
        if os.path.exists(screenshots_path):
            shutil.rmtree(screenshots_path)
        
        # Delete videos folder
        videos_path = f"static/videos/{demo_id}"
        if os.path.exists(videos_path):
            shutil.rmtree(videos_path)
        
        # Delete the demo
        db.delete(demo)
        db.commit()
        
        return {"message": "Demo deleted successfully"}
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete demo: {str(e)}"
        )
