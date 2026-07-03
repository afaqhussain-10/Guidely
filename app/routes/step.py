"""
Step routes for Guidely application.

This module defines API endpoints for managing steps within demonstrations,
including creation with AI-generated descriptions and retrieval.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.demo import Demo
from app.models.step import Step
from app.schemas.step import StepCreate, StepResponse, StepMetadataResponse, UploadSpec
from app.services.local_storage import local_storage
from app.services.groq_service import groq_service
from app.services.video_processor import video_processor


def _get_or_create_demo(db: Session, demo_id: UUID) -> Demo:
    """Retrieve an existing demo or create a placeholder demo for step creation."""
    demo = db.query(Demo).filter(Demo.id == demo_id).first()
    if demo:
        return demo

    print(
        f"Warning: Demo {demo_id} not found. Creating placeholder demo record for step creation.")
    placeholder_demo = Demo(
        id=demo_id,
        status="processing",
        language="en",
    )
    db.add(placeholder_demo)
    db.commit()
    db.refresh(placeholder_demo)
    return placeholder_demo


async def _process_and_save_step_video(
    video: UploadFile,
    demo_id: UUID,
    step_number: int,
) -> str:
    """Process an uploaded clip and persist it for a step."""
    video_content = await video.read()
    processed_video_path, _duration = video_processor.process_video(
        video_content,
        video.filename or "step.webm",
    )
    with open(processed_video_path, 'rb') as f:
        processed_video_content = f.read()
    video_processor.cleanup_processed_file(processed_video_path)
    return local_storage.save_step_video(processed_video_content, demo_id, step_number)


# Create router instance
router = APIRouter(prefix="/demos", tags=["steps"])


def _step_response(step: Step) -> StepResponse:
    """Serialize a step with browser-accessible media URLs."""
    response = StepResponse.model_validate(step)
    response.image_url = local_storage.sign_media_url(response.image_url)
    response.video_url = local_storage.sign_media_url(response.video_url)
    return response


def _step_metadata_response(step: Step, screenshot_upload: UploadSpec, video_upload: UploadSpec) -> StepMetadataResponse:
    response = StepMetadataResponse.model_validate(step)
    response.image_url = local_storage.sign_media_url(response.image_url)
    response.video_url = local_storage.sign_media_url(response.video_url)
    response.screenshot_upload = screenshot_upload
    response.video_upload = video_upload
    return response


def _build_upload_specs(demo_id: UUID, step_id: UUID) -> tuple[UploadSpec, UploadSpec]:
    screenshot_spec = UploadSpec(
        **local_storage.get_screenshot_upload_spec(demo_id, step_id))
    video_spec = UploadSpec(
        **local_storage.get_video_upload_spec(demo_id, step_id))
    return screenshot_spec, video_spec


@router.post("/{demo_id}/steps/metadata", response_model=StepMetadataResponse, status_code=status.HTTP_201_CREATED)
async def create_step_metadata(
    demo_id: UUID,
    step_data: StepCreate,
    db: Session = Depends(get_db)
):
    """
    Create a step from JSON metadata only (no media).
    Returns upload specs for screenshot and video so the client can upload separately.
    """
    try:
        demo = _get_or_create_demo(db, demo_id)

        description_en = None
        description_ar = None
        if step_data.action or step_data.element:
            try:
                description_en, description_ar = groq_service.generate_description(
                    step_data.action,
                    step_data.element
                )
            except Exception as e:
                print(f"Warning: Failed to generate AI descriptions: {str(e)}")
                description_en = f"Step {step_data.step_number}: {step_data.action or 'Action'} on {step_data.element or 'element'}"
                description_ar = f"الخطوة {step_data.step_number}: {step_data.action or 'إجراء'} على {step_data.element or 'عنصر'}"

        new_step = Step(
            demo_id=demo_id,
            step_number=step_data.step_number,
            action=step_data.action,
            element=step_data.element,
            coord_x=step_data.coord_x,
            coord_y=step_data.coord_y,
            viewport_width=step_data.viewport_width,
            viewport_height=step_data.viewport_height,
            image_url=None,
            video_url=None,
            ai_description_en=description_en,
            ai_description_ar=description_ar,
            hotspot_text=step_data.hotspot_text,
        )

        db.add(new_step)
        db.commit()
        db.refresh(new_step)

        screenshot_upload, video_upload = _build_upload_specs(
            demo_id, new_step.id)
        return _step_metadata_response(new_step, screenshot_upload, video_upload)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create step metadata: {str(e)}"
        )


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
    hotspot_text: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
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
        video: Optional lead-up video clip for this step
        db: Database session

    Returns:
        StepResponse: Created step details with AI-generated descriptions

    Raises:
        HTTPException: If demo not found or step creation fails
    """
    try:
        # Verify that the demo exists or create a placeholder demo record
        demo = _get_or_create_demo(db, demo_id)

        # Initialize variables
        image_url = None
        video_url = None
        description_en = None
        description_ar = None

        # Process screenshot if provided
        if screenshot:
            try:
                # Read screenshot content
                screenshot_content = await screenshot.read()

                # Upload screenshot to local storage
                image_url = local_storage.save_screenshot(
                    screenshot_content,
                    demo_id,
                    step_number
                )
            except Exception as e:
                # Don't let a screenshot save failure drop the whole step.
                print(
                    f"Warning: Failed to save screenshot for step {step_number}: {str(e)}")
                image_url = None

        if video:
            try:
                video_url = await _process_and_save_step_video(video, demo_id, step_number)
            except Exception as e:
                # Video processing can fail on certain clips.
                # Don't let that drop the whole step — persist it without a video.
                print(
                    f"Warning: Failed to process step video for step {step_number}: {str(e)}")
                video_url = None

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
            video_url=video_url,
            ai_description_en=description_en,
            ai_description_ar=description_ar,
            hotspot_text=hotspot_text,
        )

        # Add to database
        db.add(new_step)
        db.commit()
        db.refresh(new_step)

        return _step_response(new_step)

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

        return [_step_response(step) for step in steps]

    except HTTPException:
        # Re-raise HTTP exceptions
        raise

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve steps: {str(e)}"
        )


@router.patch("/{demo_id}/steps/{step_id}/screenshot", response_model=StepResponse)
async def update_step_screenshot(
    demo_id: UUID,
    step_id: UUID,
    screenshot: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload or replace the screenshot for an existing step."""
    try:
        demo = _get_or_create_demo(db, demo_id)

        step = db.query(Step).filter(
            Step.id == step_id,
            Step.demo_id == demo_id
        ).first()
        if not step:
            # Step doesn't exist yet — create a placeholder so the screenshot
            # can be attached. The extension may send the screenshot before
            # the metadata POST completes or retries on a new session.
            existing_count = db.query(Step).filter(
                Step.demo_id == demo_id
            ).count()
            step = Step(
                id=step_id,
                demo_id=demo_id,
                step_number=existing_count + 1,
            )
            db.add(step)
            db.commit()
            db.refresh(step)

        screenshot_content = await screenshot.read()
        step.image_url = local_storage.save_screenshot(
            screenshot_content,
            demo_id,
            step.step_number
        )
        db.commit()
        db.refresh(step)
        return _step_response(step)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update step screenshot: {str(e)}"
        )


@router.post("/{demo_id}/steps/{step_id}/confirm", response_model=StepResponse)
def confirm_step_media(
    demo_id: UUID,
    step_id: UUID,
    expect: Optional[str] = Query(
        default=None,
        description="Media type to verify after direct upload: screenshot or video",
    ),
    db: Session = Depends(get_db)
):
    """Validate that expected media files exist for a step after client upload."""
    try:
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )

        step = db.query(Step).filter(
            Step.id == step_id,
            Step.demo_id == demo_id
        ).first()
        if not step:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Step with id {step_id} not found"
            )

        has_screenshot = local_storage.step_screenshot_available(
            demo_id, step_id, step.step_number, step.image_url
        )
        has_video = local_storage.step_video_available(
            demo_id, step_id, step.step_number, step.video_url
        )

        if expect == "screenshot" and not has_screenshot:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Screenshot not yet available for this step"
            )
        if expect == "video" and not has_video:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Video not yet available for this step"
            )
        if expect is None and not has_screenshot:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Screenshot not yet available for this step"
            )

        if not step.image_url and has_screenshot:
            step.image_url = local_storage.resolve_step_screenshot_url(
                demo_id, step_id, step.step_number
            )

        if not step.video_url and has_video:
            step.video_url = local_storage.resolve_step_video_url(
                demo_id, step_id, step.step_number
            )

        db.commit()
        db.refresh(step)
        return _step_response(step)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to confirm step media: {str(e)}"
        )


@router.patch("/{demo_id}/steps/{step_id}/video", response_model=StepResponse)
async def update_step_video(
    demo_id: UUID,
    step_id: UUID,
    video: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload or replace the lead-up video clip for a step.
    """
    try:
        demo = db.query(Demo).filter(Demo.id == demo_id).first()
        if not demo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Demo with id {demo_id} not found"
            )

        step = db.query(Step).filter(
            Step.id == step_id,
            Step.demo_id == demo_id
        ).first()
        if not step:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Step with id {step_id} not found"
            )

        step.video_url = await _process_and_save_step_video(video, demo_id, step.step_number)
        db.commit()
        db.refresh(step)
        return _step_response(step)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update step video: {str(e)}"
        )


@router.patch("/{demo_id}/steps/{step_id}", response_model=StepResponse)
def update_step(
    demo_id: UUID,
    step_id: UUID,
    ai_description_en: Optional[str] = Form(None),
    ai_description_ar: Optional[str] = Form(None),
    hotspot_text: Optional[str] = Form(None),
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

        if hotspot_text is not None:
            step.hotspot_text = hotspot_text

        if coord_x is not None:
            step.coord_x = coord_x

        if coord_y is not None:
            step.coord_y = coord_y

        # Commit changes
        db.commit()
        db.refresh(step)

        return _step_response(step)

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

        if step.video_url:
            local_storage.delete_step_video(demo_id, step.step_number)

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
