"""
Main application module for Guidely FastAPI backend.

This module initializes the FastAPI application, configures middleware,
and includes all API routes.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes import demo, step


# Create FastAPI application instance
app = FastAPI(
    title="Guidely API",
    version="1.0.0",
    description="API for creating and managing interactive product demonstrations and guides"
)


# Configure CORS middleware
# This allows the frontend application to make requests to the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (configure for production)
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)


# Mount static files directory for serving uploaded media
# This serves files from the static/ directory at the /static URL path
app.mount("/static", StaticFiles(directory="static"), name="static")


# Include API routers
# All routes will be prefixed with /api
app.include_router(demo.router, prefix="/api")
app.include_router(step.router, prefix="/api")


# Root endpoint
@app.get("/", tags=["root"])
def read_root():
    """
    Root endpoint to verify API is running.
    
    Returns:
        dict: Welcome message
    """
    return {"message": "Guidely API is running"}


# Health check endpoint
@app.get("/health", tags=["health"])
def health_check():
    """
    Health check endpoint for monitoring.
    
    Returns:
        dict: API health status
    """
    return {
        "status": "healthy",
        "version": "1.0.0",
        "service": "Guidely API"
    }
