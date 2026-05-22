"""
Configuration module for Guidely application.

This module uses Pydantic's BaseSettings to manage application configuration
from environment variables and .env files.
"""

from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    All settings are automatically loaded from:
    1. Environment variables
    2. .env file in the project root
    
    Priority: Environment variables > .env file
    """
    
    # Application Settings
    APP_NAME: str = Field(
        default="Guidely",
        description="Name of the application"
    )
    
    DEBUG: bool = Field(
        default=False,
        description="Enable debug mode for development"
    )
    
    # Database Configuration
    DATABASE_URL: str = Field(
        ...,
        description="PostgreSQL database connection URL"
    )
    
    # AWS S3 Configuration (Optional)
    AWS_ACCESS_KEY_ID: Optional[str] = Field(
        default=None,
        description="AWS access key for S3 storage"
    )
    
    AWS_SECRET_ACCESS_KEY: Optional[str] = Field(
        default=None,
        description="AWS secret access key for S3 storage"
    )
    
    AWS_BUCKET_NAME: Optional[str] = Field(
        default=None,
        description="S3 bucket name for storing media files"
    )
    
    AWS_REGION: Optional[str] = Field(
        default="us-east-1",
        description="AWS region for S3 bucket"
    )
    
    # AI Service Configuration (Optional)
    GROQ_API_KEY: Optional[str] = Field(
        default=None,
        description="API key for Groq AI service"
    )
    
    class Config:
        """Pydantic configuration"""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Create a single settings instance to be imported throughout the application
settings = Settings()
