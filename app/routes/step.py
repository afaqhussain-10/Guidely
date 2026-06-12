"""
Step routes for Guidely application.

This module defines API endpoints for managing steps within demonstrations,
including creation with AI-generated descriptions and retrieval.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.demo import Demo
from app.models.step import Step
from app.schemas.step import StepCreate, StepResponse
from app.services.local_storage import local_storage
from app.services.groq_service import groq_service


# Create router instance
router = APIRouter(prefix="/demos", tags=["steps"])


@router.post("/{demo_id}/steps", response_model=StepResponse, status_code=status.HTTP_201_CREATED)
async def create_step(
    demo_id: UUID,
    step_number: int = Form(...),
    action: Optional[str] = Form(None),
    element: Optional[str] = Form(None),
    coord_x: Optional[float] = Form(None),
    coord_y: Optional[float] = Form(None),
    viewport_width: Optional[float] = Form(None),
    viewport_height: Optional[float] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Create a new step for a demo.
    
    This endpoint creates a new step within a demonstration. If a screenshot
    is provided, it uploads to S3 and generates AI-powered descriptions in
    English and Arabic using Groq.
    
    Args:
        demo_id: UUID of the parent demo
        step_number: Sequential number of this step
        action: Type of action performed (e.g., "click", "scroll")
        element: Target element or component
        coord_x: X-coordinate of the action
        coord_y: Y-coordinate of the action
        viewport_width: Viewport width at time of capture
        viewport_height: Viewport height at time of capture
        screenshot: Optional screenshot image file
        db: Database session
    
    Returns:
        StepResponse: Created step details with AI-generated descriptions
    
    Raises:
        HTTPException: If demo not found or step creation fails
    """
    try:
        # Verify that the demo exists
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )
        
        # Initialize variables
        image_url = None
        description_en = None
        description_ar = None
        
        # Process screenshot if provided
        if screenshot:
            # Read screenshot content
            screenshot_content = await screenshot.read()
            
            # Upload screenshot to local storage
            image_url = local_storage.save_screenshot(
                screenshot_content,
                demo_id,
                step_number
            )
        
        # Generate AI descriptions using Groq
        if action or element:
            try:
                description_en, description_ar = groq_service.generate_description(
                    action,
                    element
                )
            except Exception as e:
                # Log error but don't fail the request
                print(f"Warning: Failed to generate AI descriptions: {str(e)}")
                description_en = f"Step {step_number}: {action or 'Action'} on {element or 'element'}"
                description_ar = f"الخطوة {step_number}: {action or 'إجراء'} على {element or 'عنصر'}"
        
        # Create new step instance
        new_step = Step(
            demo_id=demo_id,
            step_number=step_number,
            action=action,
            element=element,
            coord_x=coord_x,
            coord_y=coord_y,
            viewport_width=viewport_width,
            viewport_height=viewport_height,
            image_url=image_url,
            ai_description_en=description_en,
            ai_description_ar=description_ar
        )
        
        # Add to database
        db.add(new_step)
        db.commit()
        db.refresh(new_step)
        
        return new_step
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create step: {str(e)}"
        )


@router.get("/{demo_id}/steps", response_model=List[StepResponse])
def get_demo_steps(
    demo_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get all steps for a demo.
    
    This endpoint retrieves all steps associated with a specific demo,
    ordered by step number.
    
    Args:
        demo_id: UUID of the demo
        db: Database session
    
    Returns:
        List[StepResponse]: List of all steps for the demo
    
    Raises:
        HTTPException: If demo not found or retrieval fails
    """
    try:
        # Verify that the demo exists
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )
        
        # Get all steps for the demo, ordered by step_number
        steps = db.query(Step).filter(
            Step.demo_id == demo_id
        ).order_by(Step.step_number).all()
        
        return steps
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve steps: {str(e)}"
        )


@router.patch("/{demo_id}/steps/{step_id}", response_model=StepResponse)
def update_step(
    demo_id: UUID,
    step_id: UUID,
    ai_description_en: Optional[str] = Form(None),
    ai_description_ar: Optional[str] = Form(None),
    coord_x: Optional[float] = Form(None),
    coord_y: Optional[float] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Update a step's description and coordinates.
    
    This endpoint allows updating a step's AI-generated descriptions
    and tooltip coordinates.
    
    Args:
        demo_id: UUID of the parent demo
        step_id: UUID of the step to update
        ai_description_en: Updated English description
        ai_description_ar: Updated Arabic description
        coord_x: Updated X-coordinate
        coord_y: Updated Y-coordinate
        db: Database session
    
    Returns:
        StepResponse: Updated step details
    
    Raises:
        HTTPException: If demo or step not found or update fails
    """
    try:
        # Verify that the demo exists
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )
        
        # Find the step
        step = db.query(Step).filter(
            Step.id == step_id,
            Step.demo_id == demo_id
        ).first()
        
        if not step:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Step with id {step_id} not found"
            )
        
        # Update fields if provided
        if ai_description_en is not None:
            step.ai_description_en = ai_description_en
        
        if ai_description_ar is not None:
            step.ai_description_ar = ai_description_ar
        
        if coord_x is not None:
            step.coord_x = coord_x
        
        if coord_y is not None:
            step.coord_y = coord_y
        
        # Commit changes
        db.commit()
        db.refresh(step)
        
        return step
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update step: {str(e)}"
        )


@router.delete("/{demo_id}/steps/{step_id}")
def delete_step(
    demo_id: UUID,
    step_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Delete a step.
    
    This endpoint deletes a specific step from a demo.
    
    Args:
        demo_id: UUID of the parent demo
        step_id: UUID of the step to delete
        db: Database session
    
    Returns:
        dict: Success message
    
    Raises:
        HTTPException: If demo or step not found or deletion fails
    """
    try:
        # Verify that the demo exists
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )
        
        # Find the step
        step = db.query(Step).filter(
            Step.id == step_id,
            Step.demo_id == demo_id
        ).first()
        
        if not step:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Step with id {step_id} not found"
            )
        
        # Delete the step
        db.delete(step)
        db.commit()
        
        return {"message": "Step deleted successfully"}
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete step: {str(e)}"
        )
