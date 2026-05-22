# Backend Integration - Immediate Sync Strategy

This document describes the implementation of the Immediate Sync strategy for connecting the Guidely Chrome Extension to the FastAPI backend.

## ✅ Implementation Complete

### Files Modified:

1. **`manifest.json`**
   - Added `"http://localhost:8000/*"` to `host_permissions`
   - Added `"api/api-service.js"` to `web_accessible_resources`

2. **`background/service-worker.js`**
   - Imported `api-service.js`
   - Added `backendDemoId` to session state
   - Implemented immediate sync on recording start, step capture, and recording stop

---

## 🔄 Sync Flow

### 1. **Recording Starts** → Create Demo in Backend

```javascript
// When user clicks "Start Recording"
startRecording() {
  // ... existing code ...
  
  // NEW: Create demo in backend
  const backendDemo = await ApiService.createDemo(title, language);
  session.backendDemoId = backendDemo.id;
  
  // Store in chrome.storage for persistence
  await chrome.storage.local.set({ 
    [`backend_demo_${session.id}`]: backendDemo.id 
  });
  
  console.log('✅ Backend demo created:', backendDemo.id);
}
```

**API Call:**
- `POST http://localhost:8000/api/demos`
- Body: `{ title: "Guide — Jan 15, 10:30 AM", language: "en" }`
- Returns: `{ id: "uuid", title: "...", status: "processing", ... }`

---

### 2. **Step Captured** → Sync Step Immediately

```javascript
// When user clicks, types, or navigates
captureStep() {
  // ... existing code ...
  
  session.steps.push(step);
  
  // NEW: Sync step to backend immediately
  if (session.backendDemoId) {
    syncStepToBackend(session.backendDemoId, step);
  }
}
```

**API Call:**
- `POST http://localhost:8000/api/demos/{demo_id}/steps`
- Body: FormData with:
  - `step_number`: 1
  - `action`: "click"
  - `element`: "button"
  - `coord_x`: 100
  - `coord_y`: 200
  - `screenshot`: Blob (converted from base64)
- Returns: `{ id: "uuid", step_number: 1, image_url: "http://...", ... }`

---

### 3. **Recording Stops** → Upload Video

```javascript
// When user clicks "Stop Recording"
stopRecording() {
  // ... existing code ...
  
  await GuidesRepo.add(guide);  // Save locally first
  
  // NEW: Upload video to backend
  if (backendDemoId) {
    uploadVideoToBackend(backendDemoId, guideId);
  }
}
```

**API Call:**
- `PATCH http://localhost:8000/api/demos/{demo_id}`
- Body: FormData with:
  - `video`: Blob (video file)
  - `status`: "completed"
- Returns: `{ id: "uuid", video_url: "http://...", duration: 120, ... }`

---

## 🛡️ Error Handling

All sync operations include error handling and **do not block the recording**:

```javascript
try {
  await ApiService.createDemo(title, language);
  console.log('✅ Backend demo created');
} catch (error) {
  console.warn('⚠️ Failed to create backend demo:', error.message);
  console.warn('Continuing with local-only mode');
  // Recording continues even if backend sync fails
}
```

**Benefits:**
- Extension works offline
- No data loss if backend is down
- Graceful degradation to local-only mode

---

## 📊 Console Logging

All sync operations log to the console for debugging:

```
[Guidely] Creating demo in backend...
[Guidely] ✅ Backend demo created: 123e4567-e89b-12d3-a456-426614174000

[Guidely] Syncing step 1 to backend...
[Guidely] ✅ Step 1 synced: 123e4567-e89b-12d3-a456-426614174001

[Guidely] Syncing step 2 to backend...
[Guidely] ✅ Step 2 synced: 123e4567-e89b-12d3-a456-426614174002

[Guidely] Uploading video to backend...
[Guidely] ✅ Video uploaded successfully: http://localhost:8000/static/videos/...
```

**Error logs:**
```
[Guidely] ⚠️ Failed to create backend demo: Failed to fetch
[Guidely] Continuing with local-only mode

[Guidely] ❌ Failed to sync step 1: Network error
```

---

## 🔧 Helper Functions Added

### `syncStepToBackend(backendDemoId, step)`

Syncs a single step to the backend:
1. Converts screenshot from base64 to Blob
2. Prepares step data
3. Calls `ApiService.createStep()`
4. Logs success/failure

### `uploadVideoToBackend(backendDemoId, guideId)`

Uploads video after recording stops:
1. Gets guide from local storage
2. Retrieves video blob from MediaRepo
3. Calls `ApiService.updateDemo()`
4. Updates guide with backend info
5. Logs success/failure

---

## 🎯 Data Flow Diagram

```
User Action          Extension                Backend
───────────         ──────────              ─────────
Start Recording  →  Create Demo         →   POST /api/demos
                    Store demo_id            Return demo_id
                    
Click Button     →  Capture Step        →   POST /api/demos/{id}/steps
                    Sync immediately         Save step + screenshot
                    
Type in Field    →  Capture Step        →   POST /api/demos/{id}/steps
                    Sync immediately         Save step + screenshot
                    
Stop Recording   →  Save Locally        →   PATCH /api/demos/{id}
                    Upload Video             Process & save video
                                            Return video_url
```

---

## 🧪 Testing

### 1. Start Backend
```bash
cd guidely-backend
uvicorn app.main:app --reload
```

### 2. Load Extension
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `Guidely-Extension` folder

### 3. Test Recording
1. Open any website
2. Click extension icon
3. Click "Start Recording"
4. Check console: Should see "✅ Backend demo created"
5. Perform actions (click, type)
6. Check console: Should see "✅ Step X synced"
7. Click "Stop Recording"
8. Check console: Should see "✅ Video uploaded successfully"

### 4. Verify in Backend
```bash
# Check database
psql -U postgres -d guidely_db
SELECT * FROM demos;
SELECT * FROM steps;

# Check files
ls static/videos/
ls static/screenshots/
```

---

## 🔍 Troubleshooting

### Backend Not Reachable
```
[Guidely] ⚠️ Failed to create backend demo: Failed to fetch
```
**Solution:** Make sure backend is running at `http://localhost:8000`

### CORS Error
```
Access to fetch at 'http://localhost:8000/api/demos' has been blocked by CORS
```
**Solution:** Backend already has CORS configured to allow all origins

### Screenshot Not Uploading
```
[Guidely] ❌ Failed to sync step 1: 422 Unprocessable Entity
```
**Solution:** Check that screenshot is being converted to Blob correctly

---

## 📝 Notes

- **Local storage is still the primary storage** - Backend sync is a bonus
- **Extension works offline** - All data is saved locally first
- **Sync is non-blocking** - Recording never fails due to backend issues
- **Video clips are stored in IndexedDB** - Retrieved when uploading to backend
- **Backend demo ID is stored in chrome.storage** - For persistence across sessions

---

## 🚀 Next Steps

1. **Test with real recordings** - Verify all sync operations work
2. **Add retry logic** - Retry failed syncs in background
3. **Add sync status UI** - Show sync status in popup
4. **Add manual sync button** - Allow users to sync old recordings
5. **Add backend health check** - Check backend status on extension load

---

## 📚 Related Files

- `api/api-service.js` - API client functions
- `api/README.md` - API documentation
- `api/integration-example.js` - Integration examples
- `background/service-worker.js` - Main extension logic
- `manifest.json` - Extension configuration
