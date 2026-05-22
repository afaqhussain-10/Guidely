# Guidely API Service

This module provides functions to communicate with the Guidely FastAPI backend.

## Setup

1. Make sure your FastAPI backend is running at `http://localhost:8000`
2. Import the API service in your extension files:

```javascript
// In manifest.json, add to background service worker scripts:
"background": {
  "service_worker": "background/service-worker.js",
  "type": "module"
},
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": ["api/api-service.js", "content/content.js"]
}]
```

Or import it directly in your service worker:
```javascript
importScripts('../api/api-service.js');
```

## Available Functions

### 1. `createDemo(title, language)`

Create a new demo in the backend.

**Parameters:**
- `title` (string): Title of the demonstration
- `language` (string): Language code (default: 'en')

**Returns:** Promise<Object> with demo details including `id`

**Example:**
```javascript
const demo = await ApiService.createDemo('My Product Guide', 'en');
console.log('Demo ID:', demo.id);
```

---

### 2. `createStep(demo_id, stepData, screenshotFile)`

Create a new step for a demo.

**Parameters:**
- `demo_id` (string): UUID of the demo
- `stepData` (Object):
  - `step_number` (number): Sequential number of the step
  - `action` (string, optional): Type of action ('click', 'type', 'scroll')
  - `element` (string, optional): Target element description
  - `coord_x` (number, optional): X-coordinate
  - `coord_y` (number, optional): Y-coordinate
- `screenshotFile` (File|Blob, optional): Screenshot image

**Returns:** Promise<Object> with step details

**Example:**
```javascript
// Convert base64 screenshot to Blob
const screenshotBlob = ApiService.dataUrlToBlob(screenshotDataUrl);

// Create step
const step = await ApiService.createStep(demoId, {
  step_number: 1,
  action: 'click',
  element: 'Submit button',
  coord_x: 100,
  coord_y: 200
}, screenshotBlob);

console.log('Step created:', step.id);
```

---

### 3. `updateDemo(demo_id, videoFile, status)`

Update a demo with a video file.

**Parameters:**
- `demo_id` (string): UUID of the demo
- `videoFile` (File|Blob): Video file to upload
- `status` (string, optional): Status update ('completed', 'failed')

**Returns:** Promise<Object> with updated demo details

**Example:**
```javascript
// Assuming you have a video Blob
const updatedDemo = await ApiService.updateDemo(demoId, videoBlob, 'completed');
console.log('Video URL:', updatedDemo.video_url);
```

---

### 4. `getDemo(demo_id)`

Get a single demo by ID.

**Parameters:**
- `demo_id` (string): UUID of the demo

**Returns:** Promise<Object> with demo details

**Example:**
```javascript
const demo = await ApiService.getDemo(demoId);
console.log('Demo status:', demo.status);
```

---

### 5. `getDemoSteps(demo_id)`

Get all steps for a demo.

**Parameters:**
- `demo_id` (string): UUID of the demo

**Returns:** Promise<Array> of step objects

**Example:**
```javascript
const steps = await ApiService.getDemoSteps(demoId);
console.log(`Demo has ${steps.length} steps`);
```

---

### 6. `dataUrlToBlob(dataUrl)`

Convert a data URL (base64) to a Blob.

**Parameters:**
- `dataUrl` (string): Data URL string

**Returns:** Blob object

**Example:**
```javascript
const blob = ApiService.dataUrlToBlob('data:image/png;base64,...');
```

---

### 7. `checkBackendHealth()`

Check if the API backend is reachable.

**Returns:** Promise<boolean>

**Example:**
```javascript
const isOnline = await ApiService.checkBackendHealth();
if (!isOnline) {
  console.warn('Backend is not reachable');
}
```

---

## Complete Workflow Example

```javascript
// 1. Check backend health
const isBackendOnline = await ApiService.checkBackendHealth();
if (!isBackendOnline) {
  console.error('Backend is offline!');
  return;
}

// 2. Create a demo
const demo = await ApiService.createDemo('User Registration Guide', 'en');
console.log('Created demo:', demo.id);

// 3. Create steps with screenshots
for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  
  // Convert screenshot from base64 to Blob
  const screenshotBlob = step.screenshot 
    ? ApiService.dataUrlToBlob(step.screenshot)
    : null;
  
  // Create step in backend
  const createdStep = await ApiService.createStep(demo.id, {
    step_number: i + 1,
    action: step.type,
    element: step.element?.tag,
    coord_x: step.clickX,
    coord_y: step.clickY
  }, screenshotBlob);
  
  console.log(`Created step ${i + 1}:`, createdStep.id);
}

// 4. Upload video (if available)
if (videoBlob) {
  const updatedDemo = await ApiService.updateDemo(demo.id, videoBlob, 'completed');
  console.log('Video uploaded:', updatedDemo.video_url);
}

// 5. Retrieve all steps
const allSteps = await ApiService.getDemoSteps(demo.id);
console.log('Total steps:', allSteps.length);
```

---

## Error Handling

All functions include error handling and will throw errors if the API request fails:

```javascript
try {
  const demo = await ApiService.createDemo('My Guide', 'en');
  console.log('Success:', demo);
} catch (error) {
  console.error('Failed to create demo:', error.message);
  // Handle error (show notification, retry, etc.)
}
```

---

## Configuration

To change the backend URL, modify the `API_BASE_URL` constant in `api-service.js`:

```javascript
const API_BASE_URL = 'http://localhost:8000'; // Change this for production
```

---

## Notes

- All functions use the Fetch API (available in modern browsers and Chrome Extensions)
- FormData is used for file uploads (videos and screenshots)
- The service automatically handles JSON and multipart/form-data content types
- All functions are async and return Promises
- Error messages include HTTP status codes and backend error details
