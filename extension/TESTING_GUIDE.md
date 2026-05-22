# Testing Guide - Backend Integration

Quick guide to test the Immediate Sync integration between the Chrome Extension and FastAPI backend.

## Prerequisites

✅ PostgreSQL running with `guidely_db` database  
✅ FastAPI backend running at `http://localhost:8000`  
✅ Chrome Extension loaded in Chrome

---

## Step 1: Start the Backend

```bash
cd guidely-backend

# Activate virtual environment (if using one)
# source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate     # Windows

# Run the backend
uvicorn app.main:app --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**Verify backend is running:**
- Open browser: `http://localhost:8000`
- Should see: `{"message": "Guidely API is running"}`

---

## Step 2: Load the Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **"Developer mode"** (top right)
4. Click **"Load unpacked"**
5. Select the `Guidely-Extension` folder
6. Extension should appear in the toolbar

---

## Step 3: Open Developer Console

**Important:** Open the extension's background service worker console to see sync logs.

1. Go to `chrome://extensions/`
2. Find "Guidely - Step Recorder"
3. Click **"service worker"** link (under "Inspect views")
4. A DevTools window will open showing the background console

**Keep this console open** - you'll see all sync logs here!

---

## Step 4: Start Recording

1. Open any website (e.g., `https://example.com`)
2. Click the Guidely extension icon
3. Click **"Start Recording"**

**Expected console output:**
```
[Guidely] Creating demo in backend...
[Guidely] ✅ Backend demo created: 123e4567-e89b-12d3-a456-426614174000
```

**If you see an error:**
```
[Guidely] ⚠️ Failed to create backend demo: Failed to fetch
[Guidely] Continuing with local-only mode
```
→ Check that backend is running at `http://localhost:8000`

---

## Step 5: Perform Actions

Perform some actions on the website:

1. **Click a button or link**
2. **Type in an input field**
3. **Navigate to another page**

**Expected console output (for each action):**
```
[Guidely] Syncing step 1 to backend...
[Guidely] ✅ Step 1 synced: 123e4567-e89b-12d3-a456-426614174001

[Guidely] Syncing step 2 to backend...
[Guidely] ✅ Step 2 synced: 123e4567-e89b-12d3-a456-426614174002

[Guidely] Syncing step 3 to backend...
[Guidely] ✅ Step 3 synced: 123e4567-e89b-12d3-a456-426614174003
```

---

## Step 6: Stop Recording

1. Click the Guidely extension icon
2. Click **"Stop Recording"**

**Expected console output:**
```
[Guidely] Uploading video to backend...
[Guidely] ✅ Video uploaded successfully: http://localhost:8000/static/videos/...
```

---

## Step 7: Verify in Backend

### Check Database

```bash
# Connect to PostgreSQL
psql -U postgres -d guidely_db

# Check demos
SELECT id, title, status, language, created_at FROM demos;

# Check steps
SELECT id, demo_id, step_number, action, element FROM steps;

# Exit
\q
```

**Expected output:**
- 1 demo with status "completed"
- Multiple steps (one for each action you performed)

### Check Files

```bash
cd guidely-backend

# Check videos
ls static/videos/

# Check screenshots
ls static/screenshots/
```

**Expected output:**
- Folder with demo UUID containing `video.mp4`
- Folder with demo UUID containing `step_1.png`, `step_2.png`, etc.

### Check via API

Open browser or use curl:

```bash
# Get all demos (replace {demo_id} with actual UUID from database)
curl http://localhost:8000/api/demos/{demo_id}

# Get all steps for a demo
curl http://localhost:8000/api/demos/{demo_id}/steps
```

---

## Step 8: View Files

### View Video

Open in browser:
```
http://localhost:8000/static/videos/{demo_id}/video.mp4
```

### View Screenshots

Open in browser:
```
http://localhost:8000/static/screenshots/{demo_id}/step_1.png
http://localhost:8000/static/screenshots/{demo_id}/step_2.png
```

---

## Common Issues

### Issue 1: "Failed to create backend demo"

**Symptoms:**
```
[Guidely] ⚠️ Failed to create backend demo: Failed to fetch
```

**Solutions:**
1. Check backend is running: `http://localhost:8000`
2. Check CORS is enabled in backend (already configured)
3. Check host_permissions in manifest.json includes `http://localhost:8000/*`

---

### Issue 2: "Failed to sync step"

**Symptoms:**
```
[Guidely] ❌ Failed to sync step 1: 422 Unprocessable Entity
```

**Solutions:**
1. Check step data format matches backend schema
2. Check screenshot is being converted to Blob correctly
3. Check backend logs for validation errors

---

### Issue 3: "Failed to upload video"

**Symptoms:**
```
[Guidely] ❌ Failed to upload video: Video blob not found
```

**Solutions:**
1. Check video was recorded (look for clipMediaId in steps)
2. Check MediaRepo has the video blob
3. Check video file format is supported (mp4, webm)

---

### Issue 4: Backend returns 500 error

**Symptoms:**
```
[Guidely] ❌ Failed to create demo: 500 Internal Server Error
```

**Solutions:**
1. Check backend console for error details
2. Check database connection is working
3. Check all required environment variables are set
4. Check migrations have been run

---

## Success Checklist

✅ Backend starts without errors  
✅ Extension loads without errors  
✅ Console shows "Backend demo created"  
✅ Console shows "Step X synced" for each action  
✅ Console shows "Video uploaded successfully"  
✅ Database has demo and steps records  
✅ Files exist in static/videos/ and static/screenshots/  
✅ Video and screenshots are accessible via browser  

---

## Next Steps

Once basic sync is working:

1. **Test offline mode** - Stop backend and verify extension still works
2. **Test error recovery** - Restart backend mid-recording
3. **Test with multiple recordings** - Create several demos
4. **Test with different actions** - Clicks, typing, navigation, scrolling
5. **Test with long recordings** - 10+ steps
6. **Test video upload** - Verify video plays correctly

---

## Debugging Tips

### Enable Verbose Logging

Add more console.log statements in service-worker.js:

```javascript
console.log('[Guidely] Step data:', stepData);
console.log('[Guidely] Screenshot blob size:', screenshotBlob?.size);
console.log('[Guidely] Backend response:', backendStep);
```

### Check Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "localhost:8000"
4. Perform actions
5. Check request/response details

### Check Backend Logs

Backend logs show all incoming requests:

```
INFO:     127.0.0.1:xxxxx - "POST /api/demos HTTP/1.1" 201 Created
INFO:     127.0.0.1:xxxxx - "POST /api/demos/{id}/steps HTTP/1.1" 201 Created
INFO:     127.0.0.1:xxxxx - "PATCH /api/demos/{id} HTTP/1.1" 200 OK
```

---

## Support

If you encounter issues:

1. Check console logs in extension background service worker
2. Check backend logs in terminal
3. Check database records
4. Check file system for uploaded files
5. Review BACKEND_INTEGRATION.md for implementation details
