"""
Video Processor Service for Guidely application.

This module provides basic video file handling for uploaded videos.
"""

import os
import tempfile
from pathlib import Path
from typing import Tuple


class VideoProcessor:
    """
    Service class for handling video file operations.
    
    This service manages temporary file handling for uploaded videos.
    """
    
    def __init__(self):
        """Initialize VideoProcessor with temp directory setup."""
        self.temp_dir = tempfile.gettempdir()
    
    def process_video(self, file: bytes, original_filename: str) -> Tuple[str, int]:
        """
        Save uploaded video to temporary location.
        
        This method handles the video file saving workflow:
        1. Save uploaded file to temporary location
        2. Return path and duration (0 as placeholder)
        
        Args:
            file: Video file content as bytes
            original_filename: Original name of the uploaded file
        
        Returns:
            Tuple[str, int]: (path_to_video_file, duration_in_seconds)
        """
        temp_input_path = None
        
        try:
            # Generate unique temporary file path
            file_extension = Path(original_filename).suffix.lower()
            temp_input_path = os.path.join(
                self.temp_dir, 
                f"temp_video_{os.urandom(8).hex()}{file_extension}"
            )
            
            # Save uploaded file to temporary location
            with open(temp_input_path, 'wb') as f:
                f.write(file)
            
            # Return path and duration (0 as placeholder since we're not processing)
            duration = 0
            
            return (temp_input_path, duration)
        
        except Exception as e:
            # Clean up temporary file on error
            self._cleanup_temp_files(temp_input_path)
            raise Exception(f"Video file handling failed: {str(e)}")
    
    def _cleanup_temp_files(self, *file_paths: str) -> None:
        """
        Clean up temporary files.
        
        Args:
            *file_paths: Variable number of file paths to delete
        """
        for file_path in file_paths:
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    # Log error but don't raise - cleanup is best effort
                    print(f"Warning: Failed to delete temporary file {file_path}: {str(e)}")
    
    def cleanup_processed_file(self, file_path: str) -> None:
        """
        Clean up a processed video file after upload to S3.
        
        This method should be called after successfully uploading
        the processed video to S3 storage.
        
        Args:
            file_path: Path to the file to delete
        """
        self._cleanup_temp_files(file_path)


# Create a single instance of VideoProcessor to be imported throughout the application
video_processor = VideoProcessor()
