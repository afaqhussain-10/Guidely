"""
Main application module for Guidely FastAPI backend.

This module initializes the FastAPI application, configures middleware,
and includes all API routes.
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
import os

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


# Video streaming endpoint with Range request support
@app.get("/static/videos/{demo_id}/video.mp4", tags=["static"])
async def serve_video(demo_id: str, request: Request):
    """
    Serve video files with HTTP Range request support for proper seeking/streaming.
    
    This endpoint handles partial content requests (HTTP 206) which are required
    for video playback in browsers to support seeking and streaming.
    
    Args:
        demo_id: The unique identifier for the demo
        request: The FastAPI request object containing headers
        
    Returns:
        StreamingResponse: Video content with appropriate headers
        
    Raises:
        HTTPException: 404 if video file not found
    """
    video_path = f"static/videos/{demo_id}/video.mp4"
    
    # Check if video file exists
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Get file size
    file_size = os.path.getsize(video_path)
    print(f"File size: {file_size}")
    
    # Check for Range header
    range_header = request.headers.get("range")
    print(f"Range header: {range_header}")
    
    if range_header:
        # Parse range header (format: "bytes=start-end")
        range_value = range_header.replace("bytes=", "")
        start, end = range_value.split("-")
        start = int(start)
        end = int(end) if end else file_size - 1
        chunk_size = end - start + 1
        print(f"Serving bytes: {start} to {end}")
        
        # Stream the requested chunk
        def iter_chunk():
            with open(video_path, "rb") as f:
                f.seek(start)
                yield f.read(chunk_size)
        
        return StreamingResponse(
            iter_chunk(),
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
                "Content-Type": "video/mp4"
            }
        )
    
    # No range header - stream full video
    def iter_full():
        with open(video_path, "rb") as f:
            yield from iter(lambda: f.read(65536), b"")
    
    return StreamingResponse(
        iter_full(),
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
            "Content-Type": "video/mp4"
        }
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
