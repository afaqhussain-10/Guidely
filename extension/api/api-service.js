/**
 * API Service for Guidely Chrome Extension
 * 
 * This module provides functions to communicate with the Guidely FastAPI backend.
 * All functions use the Fetch API and include proper error handling.
 */

// Base URL for the FastAPI backend
const API_BASE_URL = 'http://localhost:8000';

/**
 * Create a new demo in the backend.
 * 
 * @param {string} title - Title of the demonstration
 * @param {string} language - Language code (e.g., 'en', 'ar')
 * @returns {Promise<Object>} Response containing demo details including demo_id
 * @throws {Error} If the API request fails
 * 
 * @example
 * const demo = await createDemo('My Guide', 'en');
 * console.log(demo.id); // UUID of created demo
 */
async function createDemo(title, language = 'en') {
  try {
    const response = await fetch(`${API_BASE_URL}/api/demos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title,
        language: language
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to create demo: ${response.status} ${response.statusText}. ${errorData.detail || ''}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating demo:', error);
    throw error;
  }
}

/**
 * Create a new step for a demo.
 * 
 * @param {string} demo_id - UUID of the demo
 * @param {Object} stepData - Step information
 * @param {number} stepData.step_number - Sequential number of the step
 * @param {string} [stepData.action] - Type of action (e.g., 'click', 'type', 'scroll')
 * @param {string} [stepData.element] - Target element description
 * @param {number} [stepData.coord_x] - X-coordinate of the action
 * @param {number} [stepData.coord_y] - Y-coordinate of the action
 * @param {File|Blob} [screenshotFile] - Optional screenshot image file
 * @returns {Promise<Object>} Response containing step details
 * @throws {Error} If the API request fails
 * 
 * @example
 * const step = await createStep(demoId, {
 *   step_number: 1,
 *   action: 'click',
 *   element: 'Submit button',
 *   coord_x: 100,
 *   coord_y: 200
 * }, screenshotBlob);
 */
async function createStep(demo_id, stepData, screenshotFile = null) {
  try {
    // Use FormData to send both JSON data and file
    const formData = new FormData();
    
    // Add step data fields
    formData.append('step_number', stepData.step_number);
    
    if (stepData.action !== undefined && stepData.action !== null) {
      formData.append('action', stepData.action);
    }
    
    if (stepData.element !== undefined && stepData.element !== null) {
      formData.append('element', stepData.element);
    }
    
    if (stepData.coord_x !== undefined && stepData.coord_x !== null) {
      formData.append('coord_x', stepData.coord_x);
    }
    
    if (stepData.coord_y !== undefined && stepData.coord_y !== null) {
      formData.append('coord_y', stepData.coord_y);
    }
    
    // Add screenshot file if provided
    if (screenshotFile) {
      formData.append('screenshot', screenshotFile, 'screenshot.png');
    }

    const response = await fetch(`${API_BASE_URL}/api/demos/${demo_id}/steps`, {
      method: 'POST',
      body: formData
      // Note: Don't set Content-Type header - browser will set it automatically with boundary
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to create step: ${response.status} ${response.statusText}. ${errorData.detail || ''}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating step:', error);
    throw error;
  }
}

/**
 * Update a demo with a video file.
 * 
 * @param {string} demo_id - UUID of the demo to update
 * @param {File|Blob} videoFile - Video file to upload
 * @param {string} [status] - Optional status update (e.g., 'completed', 'failed')
 * @returns {Promise<Object>} Response containing updated demo details
 * @throws {Error} If the API request fails
 * 
 * @example
 * const updatedDemo = await updateDemo(demoId, videoBlob, 'completed');
 * console.log(updatedDemo.video_url); // URL to the uploaded video
 */
async function updateDemo(demo_id, videoFile, status = null) {
  try {
    // Use FormData to send video file
    const formData = new FormData();
    
    // Add video file
    formData.append('video', videoFile, 'video.mp4');
    
    // Add optional status
    if (status !== null && status !== undefined) {
      formData.append('status', status);
    }

    const response = await fetch(`${API_BASE_URL}/api/demos/${demo_id}`, {
      method: 'PATCH',
      body: formData
      // Note: Don't set Content-Type header - browser will set it automatically with boundary
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to update demo: ${response.status} ${response.statusText}. ${errorData.detail || ''}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating demo:', error);
    throw error;
  }
}

/**
 * Get a single demo by ID.
 * 
 * @param {string} demo_id - UUID of the demo to retrieve
 * @returns {Promise<Object>} Demo details
 * @throws {Error} If the API request fails
 * 
 * @example
 * const demo = await getDemo(demoId);
 * console.log(demo.title, demo.status);
 */
async function getDemo(demo_id) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/demos/${demo_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to get demo: ${response.status} ${response.statusText}. ${errorData.detail || ''}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting demo:', error);
    throw error;
  }
}

/**
 * Get all steps for a demo.
 * 
 * @param {string} demo_id - UUID of the demo
 * @returns {Promise<Array>} Array of step objects
 * @throws {Error} If the API request fails
 * 
 * @example
 * const steps = await getDemoSteps(demoId);
 * console.log(`Demo has ${steps.length} steps`);
 */
async function getDemoSteps(demo_id) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/demos/${demo_id}/steps`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to get demo steps: ${response.status} ${response.statusText}. ${errorData.detail || ''}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting demo steps:', error);
    throw error;
  }
}

/**
 * Convert a data URL (base64) to a Blob.
 * Utility function for converting screenshots from base64 to Blob for upload.
 * 
 * @param {string} dataUrl - Data URL string (e.g., 'data:image/png;base64,...')
 * @returns {Blob} Blob object
 * 
 * @example
 * const blob = dataUrlToBlob(screenshotDataUrl);
 * await createStep(demoId, stepData, blob);
 */
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Check if the API backend is reachable.
 * 
 * @returns {Promise<boolean>} True if backend is reachable, false otherwise
 * 
 * @example
 * const isOnline = await checkBackendHealth();
 * if (!isOnline) {
 *   console.warn('Backend is not reachable');
 * }
 */
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}

// Export all functions for use in other modules
// In Chrome Extension context, these will be available globally
if (typeof self !== 'undefined') {
  self.ApiService = {
    createDemo,
    createStep,
    updateDemo,
    getDemo,
    getDemoSteps,
    dataUrlToBlob,
    checkBackendHealth,
    API_BASE_URL
  };
}
