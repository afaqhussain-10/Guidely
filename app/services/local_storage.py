"""
Local Storage Service for Guidely application.

This module provides local file system storage for videos and screenshots
as an alternative to cloud storage (S3).
"""

import os
from pathlib import Path
from uuid import UUID
from typing import Optional

from app.core.config import settings
from app.services.s3_service import (
    s3_service,
    step_screenshot_key,
    step_video_key,
)


def _s3_enabled() -> bool:
    return s3_service.is_configured


class LocalStorage:
    """
    Service class for handling local file system storage operations.
    
    This service manages file uploads to the local static directory,
    including videos and screenshots for demonstrations.
    """
    
    def __init__(self):
        """
        Initialize LocalStorage with base paths.
        
        Sets up the static directory structure for storing media files.
        """
        # Base directory for static files (relative to project root)
        self.static_dir = Path("static")
        self.videos_dir = self.static_dir / "videos"
        self.screenshots_dir = self.static_dir / "screenshots"
        
        # Ensure directories exist
        self._ensure_directories()
    
    def _ensure_directories(self):
        """
        Ensure that all required storage directories exist.
        
        Creates the static/videos and static/screenshots directories
        if they don't already exist.
        """
        try:
            self.videos_dir.mkdir(parents=True, exist_ok=True)
            self.screenshots_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"Warning: Failed to create storage directories: {str(e)}")
    
    def save_video(self, file: bytes, demo_id: UUID) -> str:
        """
        Save video file to local storage in the videos folder.
        
        Args:
            file: Video file content as bytes
            demo_id: UUID of the demo this video belongs to
        
        Returns:
            str: Public URL to access the video file
        
        Raises:
            Exception: If save operation fails
        """
        try:
            # Create demo-specific directory
            demo_dir = self.videos_dir / str(demo_id)
            demo_dir.mkdir(parents=True, exist_ok=True)
            
            # Save video file
            video_path = demo_dir / "video.mp4"
            with open(video_path, 'wb') as f:
                f.write(file)
            
            # Generate public URL
            # Format: /static/videos/{demo_id}/video.mp4
            video_url = f"/static/videos/{demo_id}/video.mp4"
            
            return video_url
        
        except Exception as e:
            raise Exception(f"Failed to save video to local storage: {str(e)}")

    def save_step_video(self, file: bytes, demo_id: UUID, step_number: int) -> str:
        """
        Save a per-step lead-up video clip to local storage.

        Args:
            file: Video file content as bytes
            demo_id: UUID of the demo this clip belongs to
            step_number: Step number for organizing clips

        Returns:
            str: Public URL to access the step video file
        """
        try:
            demo_dir = self.videos_dir / str(demo_id)
            demo_dir.mkdir(parents=True, exist_ok=True)

            video_path = demo_dir / f"step_{step_number}.mp4"
            with open(video_path, 'wb') as f:
                f.write(file)

            return f"/static/videos/{demo_id}/step_{step_number}.mp4"

        except Exception as e:
            raise Exception(f"Failed to save step video to local storage: {str(e)}")
    
    def save_screenshot(self, file: bytes, demo_id: UUID, step_number: int) -> str:
        """
        Save screenshot image to local storage in the screenshots folder.
        
        Args:
            file: Screenshot file content as bytes
            demo_id: UUID of the demo this screenshot belongs to
            step_number: Step number for organizing screenshots
        
        Returns:
            str: Public URL to access the screenshot file
        
        Raises:
            Exception: If save operation fails
        """
        try:
            # Create demo-specific directory
            demo_dir = self.screenshots_dir / str(demo_id)
            demo_dir.mkdir(parents=True, exist_ok=True)
            
            # Save screenshot file
            screenshot_path = demo_dir / f"step_{step_number}.png"
            with open(screenshot_path, 'wb') as f:
                f.write(file)
            
            # Generate public URL
            # Format: /static/screenshots/{demo_id}/step_{step_number}.png
            screenshot_url = f"/static/screenshots/{demo_id}/step_{step_number}.png"
            
            return screenshot_url
        
        except Exception as e:
            raise Exception(f"Failed to save screenshot to local storage: {str(e)}")
    
    def delete_video(self, demo_id: UUID) -> bool:
        """
        Delete video file and its directory from local storage.
        
        Args:
            demo_id: UUID of the demo whose video should be deleted
        
        Returns:
            bool: True if deletion was successful, False otherwise
        """
        try:
            demo_dir = self.videos_dir / str(demo_id)
            
            if demo_dir.exists():
                # Delete video file
                video_path = demo_dir / "video.mp4"
                if video_path.exists():
                    video_path.unlink()
                
                # Remove directory if empty
                try:
                    demo_dir.rmdir()
                except OSError:
                    # Directory not empty, that's okay
                    pass
            
            return True
        
        except Exception as e:
            print(f"Warning: Failed to delete video from local storage: {str(e)}")
            return False
    
    def delete_screenshot(self, demo_id: UUID, step_number: int) -> bool:
        """
        Delete screenshot file from local storage.
        
        Args:
            demo_id: UUID of the demo
            step_number: Step number of the screenshot to delete
        
        Returns:
            bool: True if deletion was successful, False otherwise
        """
        try:
            demo_dir = self.screenshots_dir / str(demo_id)
            screenshot_path = demo_dir / f"step_{step_number}.png"
            
            if screenshot_path.exists():
                screenshot_path.unlink()
            
            # Remove directory if empty
            if demo_dir.exists():
                try:
                    demo_dir.rmdir()
                except OSError:
                    # Directory not empty, that's okay
                    pass
            
            return True
        
        except Exception as e:
            print(f"Warning: Failed to delete screenshot from local storage: {str(e)}")
            return False

    def delete_step_video(self, demo_id: UUID, step_number: int) -> bool:
        """Delete a per-step video clip from local storage."""
        try:
            demo_dir = self.videos_dir / str(demo_id)
            video_path = demo_dir / f"step_{step_number}.mp4"
            if video_path.exists():
                video_path.unlink()
            return True
        except Exception as e:
            print(f"Warning: Failed to delete step video from local storage: {str(e)}")
            return False
    
    def get_screenshot_upload_spec(self, demo_id: UUID, step_id: UUID) -> dict:
        """
        Return upload instructions for a step screenshot.
        Uses S3 presigned PUT when configured; otherwise multipart PATCH on API.
        """
        if _s3_enabled():
            try:
                key = step_screenshot_key(demo_id, step_id)
                url = s3_service.generate_presigned_put_url(key, "image/jpeg")
                if url:
                    return {
                        "method": "PUT",
                        "url": url,
                        "multipart": False,
                        "headers": {"Content-Type": "image/jpeg"},
                        "public_url": s3_service.public_url_for_key(key),
                    }
            except Exception as e:
                print(f"Warning: S3 presign failed, falling back to API upload: {e}")

        return {
            "method": "PATCH",
            "url": f"/api/demos/{demo_id}/steps/{step_id}/screenshot",
            "multipart": True,
            "field": "screenshot",
        }

    def get_video_upload_spec(self, demo_id: UUID, step_id: UUID) -> dict:
        """Return upload instructions for a step lead-up video clip."""
        if _s3_enabled():
            try:
                key = step_video_key(demo_id, step_id)
                url = s3_service.generate_presigned_put_url(key, "video/webm")
                if url:
                    return {
                        "method": "PUT",
                        "url": url,
                        "multipart": False,
                        "headers": {"Content-Type": "video/webm"},
                        "public_url": s3_service.public_url_for_key(key),
                    }
            except Exception as e:
                print(f"Warning: S3 presign failed, falling back to API upload: {e}")

        return {
            "method": "PATCH",
            "url": f"/api/demos/{demo_id}/steps/{step_id}/video",
            "multipart": True,
            "field": "video",
        }

    def screenshot_exists(self, demo_id: UUID, step_number: int) -> bool:
        path = self.screenshots_dir / str(demo_id) / f"step_{step_number}.png"
        return path.exists()

    def step_video_exists(self, demo_id: UUID, step_number: int) -> bool:
        path = self.videos_dir / str(demo_id) / f"step_{step_number}.mp4"
        return path.exists()

    def step_screenshot_available(
        self,
        demo_id: UUID,
        step_id: UUID,
        step_number: int,
        image_url: Optional[str] = None,
    ) -> bool:
        if image_url:
            return True
        if _s3_enabled() and s3_service.head_object_exists(step_screenshot_key(demo_id, step_id)):
            return True
        return self.screenshot_exists(demo_id, step_number)

    def step_video_available(
        self,
        demo_id: UUID,
        step_id: UUID,
        step_number: int,
        video_url: Optional[str] = None,
    ) -> bool:
        if video_url:
            return True
        if _s3_enabled() and s3_service.head_object_exists(step_video_key(demo_id, step_id)):
            return True
        return self.step_video_exists(demo_id, step_number)

    def resolve_step_screenshot_url(self, demo_id: UUID, step_id: UUID, step_number: int) -> Optional[str]:
        if _s3_enabled() and s3_service.head_object_exists(step_screenshot_key(demo_id, step_id)):
            return s3_service.public_url_for_key(step_screenshot_key(demo_id, step_id))
        if self.screenshot_exists(demo_id, step_number):
            return f"/static/screenshots/{demo_id}/step_{step_number}.png"
        return None

    def resolve_step_video_url(self, demo_id: UUID, step_id: UUID, step_number: int) -> Optional[str]:
        if _s3_enabled() and s3_service.head_object_exists(step_video_key(demo_id, step_id)):
            return s3_service.public_url_for_key(step_video_key(demo_id, step_id))
        if self.step_video_exists(demo_id, step_number):
            return f"/static/videos/{demo_id}/step_{step_number}.mp4"
        return None

    def sign_media_url(self, url: Optional[str], expires_in: int = 3600) -> Optional[str]:
        """
        Convert a stored S3 public URL into a presigned GET URL for browser playback.

        Private buckets reject anonymous GET requests (403). Local /static paths are
        returned unchanged.
        """
        if not url:
            return None
        if not _s3_enabled():
            return url

        key = s3_service._extract_s3_key_from_url(url)
        if not key:
            return url

        signed = s3_service.generate_presigned_get_url(key, expires_in=expires_in)
        return signed or url

    def delete_demo_files(self, demo_id: UUID) -> bool:
        """
        Delete all files associated with a demo (video and screenshots).
        
        Args:
            demo_id: UUID of the demo whose files should be deleted
        
        Returns:
            bool: True if deletion was successful, False otherwise
        """
        try:
            # Delete video directory
            video_dir = self.videos_dir / str(demo_id)
            if video_dir.exists():
                for file in video_dir.iterdir():
                    file.unlink()
                video_dir.rmdir()
            
            # Delete screenshots directory
            screenshots_dir = self.screenshots_dir / str(demo_id)
            if screenshots_dir.exists():
                for file in screenshots_dir.iterdir():
                    file.unlink()
                screenshots_dir.rmdir()
            
            return True
        
        except Exception as e:
            print(f"Warning: Failed to delete demo files from local storage: {str(e)}")
            return False


# Create a single instance of LocalStorage to be imported throughout the application
local_storage = LocalStorage()
