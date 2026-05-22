/**
 * Integration Example: How to use API Service in Guidely Extension
 * 
 * This file shows how to integrate the API service with the existing
 * extension code to sync data to the FastAPI backend.
 */

// ============================================================================
// EXAMPLE 1: Sync demo when recording stops
// ============================================================================

/**
 * Add this to background/service-worker.js in the stopRecording function
 * after the guide is saved locally.
 */
async function stopRecordingWithSync(sendResponse) {
  // ... existing stopRecording code ...
  
  // After saving guide locally:
  await GuidesRepo.add(guide);
  
  // NEW: Sync to backend
  try {
    // Check if backend is available
    const isBackendOnline = await ApiService.checkBackendHealth();
    
    if (isBackendOnline) {
      // Create demo in backend
      const backendDemo = await ApiService.createDemo(
        guide.title,
        guide.captionLanguage
      );
      
      console.log('Demo synced to backend:', backendDemo.id);
      
      // Store backend demo ID for later reference
      guide.backendDemoId = backendDemo.id;
      await GuidesRepo.update(guide.id, { backendDemoId: backendDemo.id });
      
      // Sync all steps
      for (const step of guide.steps) {
        await syncStepToBackend(backendDemo.id, step);
      }
      
      console.log('All steps synced to backend');
    } else {
      console.warn('Backend offline - guide saved locally only');
    }
  } catch (error) {
    console.error('Failed to sync to backend:', error);
    // Guide is still saved locally, so this is not critical
  }
  
  // ... rest of existing code ...
}

// ============================================================================
// EXAMPLE 2: Sync individual steps
// ============================================================================

/**
 * Helper function to sync a step to the backend
 */
async function syncStepToBackend(backendDemoId, step) {
  try {
    // Convert screenshot from base64 to Blob if it exists
    let screenshotBlob = null;
    if (step.screenshot) {
      screenshotBlob = ApiService.dataUrlToBlob(step.screenshot);
    }
    
    // Prepare step data
    const stepData = {
      step_number: step.number,
      action: step.type,
      element: step.element?.tag || null,
      coord_x: step.clickX,
      coord_y: step.clickY
    };
    
    // Create step in backend
    const backendStep = await ApiService.createStep(
      backendDemoId,
      stepData,
      screenshotBlob
    );
    
    console.log(`Step ${step.number} synced:`, backendStep.id);
    return backendStep;
  } catch (error) {
    console.error(`Failed to sync step ${step.number}:`, error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: Upload video after recording
// ============================================================================

/**
 * Add this to offscreen/recorder.js after video recording is complete
 */
async function uploadVideoToBackend(videoBlob, backendDemoId) {
  try {
    if (!backendDemoId) {
      console.warn('No backend demo ID - skipping video upload');
      return;
    }
    
    console.log('Uploading video to backend...');
    
    const updatedDemo = await ApiService.updateDemo(
      backendDemoId,
      videoBlob,
      'completed'
    );
    
    console.log('Video uploaded successfully:', updatedDemo.video_url);
    return updatedDemo;
  } catch (error) {
    console.error('Failed to upload video:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 4: Background sync for existing guides
// ============================================================================

/**
 * Sync all local guides to backend (useful for migration or retry)
 */
async function syncAllGuidesToBackend() {
  try {
    const isBackendOnline = await ApiService.checkBackendHealth();
    
    if (!isBackendOnline) {
      console.warn('Backend is offline');
      return { success: false, error: 'Backend offline' };
    }
    
    // Get all local guides
    const guides = await GuidesRepo.list();
    
    let synced = 0;
    let failed = 0;
    
    for (const guide of guides) {
      // Skip if already synced
      if (guide.backendDemoId) {
        console.log(`Guide ${guide.id} already synced`);
        continue;
      }
      
      try {
        // Create demo in backend
        const backendDemo = await ApiService.createDemo(
          guide.title,
          guide.captionLanguage || 'en'
        );
        
        // Sync all steps
        for (const step of guide.steps) {
          await syncStepToBackend(backendDemo.id, step);
        }
        
        // Update local guide with backend ID
        await GuidesRepo.update(guide.id, { backendDemoId: backendDemo.id });
        
        synced++;
        console.log(`Synced guide: ${guide.title}`);
      } catch (error) {
        failed++;
        console.error(`Failed to sync guide ${guide.id}:`, error);
      }
    }
    
    return { success: true, synced, failed, total: guides.length };
  } catch (error) {
    console.error('Sync all guides failed:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// EXAMPLE 5: Add sync button to popup
// ============================================================================

/**
 * Add this to popup/popup.html
 */
const syncButtonHTML = `
<button id="btn-sync" class="btn-secondary">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M21 12a9 9 0 11-9-9" stroke="currentColor" stroke-width="2"/>
    <path d="M21 3v6h-6" stroke="currentColor" stroke-width="2"/>
  </svg>
  Sync to Backend
</button>
`;

/**
 * Add this to popup/popup.js
 */
const btnSync = document.getElementById('btn-sync');

btnSync.addEventListener('click', async () => {
  btnSync.disabled = true;
  btnSync.textContent = 'Syncing...';
  
  try {
    const result = await syncAllGuidesToBackend();
    
    if (result.success) {
      alert(`Synced ${result.synced} guides successfully!`);
    } else {
      alert(`Sync failed: ${result.error}`);
    }
  } catch (error) {
    alert(`Sync error: ${error.message}`);
  } finally {
    btnSync.disabled = false;
    btnSync.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M21 12a9 9 0 11-9-9" stroke="currentColor" stroke-width="2"/>
        <path d="M21 3v6h-6" stroke="currentColor" stroke-width="2"/>
      </svg>
      Sync to Backend
    `;
  }
});

// ============================================================================
// EXAMPLE 6: Real-time sync during recording
// ============================================================================

/**
 * Modify captureStep in background/service-worker.js to sync immediately
 */
async function captureStepWithSync(data, tab, sendResponse) {
  // ... existing captureStep code ...
  
  session.steps.push(step);
  
  // NEW: Sync step immediately if backend demo exists
  if (session.backendDemoId) {
    try {
      await syncStepToBackend(session.backendDemoId, step);
    } catch (error) {
      console.error('Failed to sync step in real-time:', error);
      // Don't fail the recording if sync fails
    }
  }
  
  chrome.action.setBadgeText({ text: String(session.steps.length) });
  sendResponse({ success: true, stepNumber: step.number });
}

// ============================================================================
// EXAMPLE 7: Check backend status on extension load
// ============================================================================

/**
 * Add this to background/service-worker.js at the top level
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Guidely Extension installed');
  
  // Check backend connectivity
  const isBackendOnline = await ApiService.checkBackendHealth();
  
  if (isBackendOnline) {
    console.log('✅ Backend is online and ready');
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    chrome.action.setBadgeText({ text: '✓' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
  } else {
    console.warn('⚠️ Backend is offline - extension will work in local-only mode');
  }
});

// ============================================================================
// NOTES
// ============================================================================

/**
 * Integration Strategy:
 * 
 * 1. IMMEDIATE SYNC (Recommended):
 *    - Create backend demo when recording starts
 *    - Sync each step immediately after capture
 *    - Upload video when recording stops
 *    - Pros: Real-time backup, no data loss
 *    - Cons: Requires stable connection
 * 
 * 2. BATCH SYNC (Alternative):
 *    - Save everything locally during recording
 *    - Sync all data when recording stops
 *    - Pros: Works offline, faster recording
 *    - Cons: Risk of data loss if sync fails
 * 
 * 3. HYBRID (Best of both):
 *    - Try immediate sync, fall back to local
 *    - Retry failed syncs in background
 *    - Show sync status in UI
 *    - Pros: Reliable and user-friendly
 *    - Cons: More complex implementation
 */
