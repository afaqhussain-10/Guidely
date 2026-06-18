"""
S3 Service for Guidely application.

This module provides AWS S3 integration for uploading and managing files
such as videos and screenshots.
"""

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from typing import Optional
from uuid import UUID

from app.core.config import settings


def step_screenshot_key(demo_id: UUID, step_id: UUID) -> str:
    """S3 object key for a per-step screenshot."""
    return f"screenshots/{demo_id}/steps/{step_id}.jpg"


def step_video_key(demo_id: UUID, step_id: UUID) -> str:
    """S3 object key for a per-step lead-up video clip."""
    return f"videos/{demo_id}/steps/{step_id}.webm"


class S3Service:
    """
    Service class for handling AWS S3 operations.

    This service manages file uploads and deletions in S3, including videos
    and screenshots for demonstrations.
    """

    def __init__(self):
        """
        Initialize S3 client with AWS credentials from settings.

        If AWS credentials are not configured, sets s3_client to None
        and the service will return None for all operations.
        """
        if not self.is_configured:
            self.s3_client = None
            self.bucket_name = None
            return

        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
            config=BotoConfig(signature_version='s3v4'),
        )
        self.bucket_name = settings.AWS_BUCKET_NAME

    @property
    def is_configured(self) -> bool:
        return bool(
            settings.AWS_ACCESS_KEY_ID
            and settings.AWS_SECRET_ACCESS_KEY
            and settings.AWS_BUCKET_NAME
        )

    def public_url_for_key(self, key: str) -> str:
        """Build the public HTTPS URL for an S3 object key."""
        return f"https://{settings.AWS_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"

    def head_object_exists(self, key: str) -> bool:
        """Return True if the object exists in the configured bucket."""
        if self.s3_client is None:
            return False
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') in ('404', 'NoSuchKey', 'NotFound'):
                return False
            raise

    def generate_presigned_put_url(
        self,
        key: str,
        content_type: str,
        expires_in: int = 3600,
    ) -> Optional[str]:
        """Return a presigned PUT URL for direct client upload."""
        if self.s3_client is None:
            return None
        return self.s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': self.bucket_name,
                'Key': key,
                'ContentType': content_type,
            },
            ExpiresIn=expires_in,
        )

    def upload_file(self, file: bytes, folder: str, filename: str) -> Optional[str]:
        """
        Upload any file to S3 bucket.

        Args:
            file: File content as bytes
            folder: S3 folder path (e.g., "videos/demo-123")
            filename: Name of the file to save

        Returns:
            Optional[str]: Public URL of the uploaded file, or None if S3 not configured

        Raises:
            Exception: If upload fails
        """
        if self.s3_client is None:
            return None

        try:
            s3_key = f"{folder}/{filename}"

            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=file,
                ContentType=self._get_content_type(filename)
            )

            return self.public_url_for_key(s3_key)

        except ClientError as e:
            raise Exception(f"Failed to upload file to S3: {str(e)}")

    def upload_video(self, file: bytes, demo_id: UUID) -> Optional[str]:
        """
        Upload video file to S3 in the videos folder.

        Args:
            file: Video file content as bytes
            demo_id: UUID of the demo this video belongs to

        Returns:
            Optional[str]: Public URL of the uploaded video, or None if S3 not configured

        Raises:
            Exception: If upload fails
        """
        if self.s3_client is None:
            return None

        try:
            folder = f"videos/{demo_id}"
            filename = f"{demo_id}.mp4"

            return self.upload_file(file, folder, filename)

        except Exception as e:
            raise Exception(f"Failed to upload video: {str(e)}")

    def upload_screenshot(self, file: bytes, demo_id: UUID, step_number: int) -> Optional[str]:
        """
        Upload screenshot image to S3 in the screenshots folder.

        Args:
            file: Screenshot file content as bytes
            demo_id: UUID of the demo this screenshot belongs to
            step_number: Step number for organizing screenshots

        Returns:
            Optional[str]: Public URL of the uploaded screenshot, or None if S3 not configured

        Raises:
            Exception: If upload fails
        """
        if self.s3_client is None:
            return None

        try:
            folder = f"screenshots/{demo_id}"
            filename = f"step_{step_number}.png"

            return self.upload_file(file, folder, filename)

        except Exception as e:
            raise Exception(f"Failed to upload screenshot: {str(e)}")

    def delete_file(self, file_url: str) -> Optional[bool]:
        """
        Delete a file from S3 using its public URL.

        Args:
            file_url: Public URL of the file to delete

        Returns:
            Optional[bool]: True if deletion was successful, None if S3 not configured, False otherwise

        Raises:
            Exception: If deletion fails
        """
        if self.s3_client is None:
            return None

        try:
            s3_key = self._extract_s3_key_from_url(file_url)

            if not s3_key:
                raise ValueError(f"Invalid S3 URL: {file_url}")

            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )

            return True

        except ClientError as e:
            raise Exception(f"Failed to delete file from S3: {str(e)}")

    def _get_content_type(self, filename: str) -> str:
        """
        Determine content type based on file extension.

        Args:
            filename: Name of the file

        Returns:
            str: MIME type for the file
        """
        extension = filename.lower().split('.')[-1]

        content_types = {
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp'
        }

        return content_types.get(extension, 'application/octet-stream')

    def _extract_s3_key_from_url(self, file_url: str) -> Optional[str]:
        """
        Extract S3 key (path) from a public S3 URL.

        Args:
            file_url: Public S3 URL

        Returns:
            Optional[str]: S3 key if extraction successful, None otherwise
        """
        try:
            parts = file_url.split('.amazonaws.com/')
            if len(parts) == 2:
                return parts[1]
            return None
        except Exception:
            return None


# Create a single instance of S3Service to be imported throughout the application
s3_service = S3Service()
