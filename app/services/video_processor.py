"""
Video Processor Service for Guidely application.

This module provides video processing capabilities using ffmpeg-python,
including format conversion and metadata extraction.
"""

import os
import tempfile
from pathlib import Path
from typing import Tuple
import ffmpeg


class VideoProcessor:
    """
    Service class for handling video processing operations.
    
    This service manages video format conversion, duration extraction,
    and temporary file handling for uploaded videos.
    """
    
    def __init__(self):
        """Initialize VideoProcessor with temp directory setup."""
        self.temp_dir = tempfile.gettempdir()
    
    def convert_to_mp4(self, input_path: str, output_path: str) -> str:
        """
        Convert video file to MP4 format using ffmpeg.
        
        This method handles conversion from various video formats (WebM, AVI, MOV, etc.)
        to MP4 with H.264 codec for maximum compatibility.
        
        Args:
            input_path: Path to the input video file
            output_path: Path where the MP4 file should be saved
        
        Returns:
            str: Path to the converted MP4 file
        
        Raises:
            Exception: If conversion fails
        """
        try:
            # Convert video to MP4 with H.264 codec
            (
                ffmpeg
                .input(input_path)
                .output(
                    output_path,
                    vcodec='libx264',  # H.264 video codec
                    acodec='aac',      # AAC audio codec
                    strict='experimental',
                    loglevel='error'
                )
                .overwrite_output()  # Overwrite if file exists
                .run(capture_stdout=True, capture_stderr=True)
            )
            
            return output_path
        
        except ffmpeg.Error as e:
            error_message = e.stderr.decode() if e.stderr else str(e)
            raise Exception(f"Failed to convert video to MP4: {error_message}")
    
    def get_duration(self, file_path: str) -> int:
        """
        Extract video duration in seconds.
        
        Args:
            file_path: Path to the video file
        
        Returns:
            int: Video duration in seconds (rounded)
        
        Raises:
            Exception: If duration extraction fails
        """
        try:
            # Probe video file to get metadata
            probe = ffmpeg.probe(file_path)
            
            # Extract duration from video stream
            video_info = next(
                stream for stream in probe['streams'] 
                if stream['codec_type'] == 'video'
            )
            
            duration = float(probe['format']['duration'])
            
            return int(duration)
        
        except (ffmpeg.Error, KeyError, StopIteration) as e:
            raise Exception(f"Failed to get video duration: {str(e)}")
    
    def process_video(self, file: bytes, original_filename: str) -> Tuple[str, int]:
        """
        Main video processing method.
        
        This method handles the complete video processing workflow:
        1. Save uploaded file to temporary location
        2. Convert to MP4 format if needed (skips if ffmpeg not available)
        3. Extract video duration (returns 0 if ffmpeg not available)
        4. Clean up temporary files
        
        If ffmpeg is not available or fails, the original file is saved as-is
        with duration set to 0. This allows the application to work without ffmpeg.
        
        Args:
            file: Video file content as bytes
            original_filename: Original name of the uploaded file
        
        Returns:
            Tuple[str, int]: (path_to_video_file, duration_in_seconds)
        """
        temp_input_path = None
        temp_output_path = None
        
        try:
            # Generate unique temporary file paths
            file_extension = Path(original_filename).suffix.lower()
            temp_input_path = os.path.join(
                self.temp_dir, 
                f"temp_input_{os.urandom(8).hex()}{file_extension}"
            )
            temp_output_path = os.path.join(
                self.temp_dir, 
                f"temp_output_{os.urandom(8).hex()}.mp4"
            )
            
            # Save uploaded file to temporary location
            with open(temp_input_path, 'wb') as f:
                f.write(file)
            
            # Try to convert to MP4 if not already in MP4 format
            processed_path = temp_input_path
            duration = 0
            
            if file_extension != '.mp4':
                try:
                    # Attempt conversion with ffmpeg
                    self.convert_to_mp4(temp_input_path, temp_output_path)
                    processed_path = temp_output_path
                    print(f"Video converted to MP4 successfully")
                except Exception as e:
                    # If conversion fails, use original file
                    print(f"Warning: Video conversion failed: {str(e)}")
                    print(f"Using original file without conversion")
                    processed_path = temp_input_path
                    temp_output_path = None
            else:
                # If already MP4, just use the input file
                temp_output_path = None
            
            # Try to get video duration
            try:
                duration = self.get_duration(processed_path)
                print(f"Video duration extracted: {duration} seconds")
            except Exception as e:
                # If duration extraction fails, set to 0
                print(f"Warning: Failed to extract video duration: {str(e)}")
                print(f"Setting duration to 0")
                duration = 0
            
            return (processed_path, duration)
        
        except Exception as e:
            # Clean up temporary files on error
            self._cleanup_temp_files(temp_input_path, temp_output_path)
            raise Exception(f"Video processing failed: {str(e)}")
    
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
