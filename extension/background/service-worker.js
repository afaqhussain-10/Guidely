// Pull in the repository layer that owns all guide persistence.
// All chrome.storage.local access for guides should flow through
// GuidesRepo so the storage backend can later be swapped to IndexedDB
// or a remote API without touching call sites.
importScripts('../storage/guides-repo.js', '../storage/media-repo.js');

// Import API service for backend sync
importScripts('../api/api-service.js');

// Offscreen recorder coordinates here so MediaRecorder/getUserMedia can run
// off the service-worker context (neither API is available in MV3 SWs).
const OFFSCREEN_PATH = 'offscreen/recorder.html';
const OFFSCREEN_TARGET = 'guidely-recorder';

// Recording session state
let session = {
  isRecording: false,
  id: null,
  tabId: null,
  steps: [],
  startTime: null,
  startUrl: null,
  captionLanguage: 'en',
  activeFillGroupId: null,
  backendDemoId: null  // NEW: Store backend demo ID for sync
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages addressed to the offscreen recorder are handled there;
  // ignore them here so we don't double-process replies.
  if (msg && msg.target === OFFSCREEN_TARGET) return;
  switch (msg.type) {
    case 'START_RECORDING':
      startRecording(msg.tabId, msg.captionLanguage, sendResponse);
      return true;
    case 'STOP_RECORDING':
      stopRecording(sendResponse);
      return true;
    case 'CAPTURE_STEP':
      captureStep(msg.data, sender.tab, sendResponse);
      return true;
    case 'CAPTURE_FILL_FRAME':
      captureFillFrame(msg.data, sender.tab, sendResponse);
      return true;
    case 'FILL_STARTED':
      fillStarted(msg.groupId, sender.tab, sendResponse);
      return true;
    case 'FILL_ABANDONED':
      fillAbandoned(msg.groupId, sendResponse);
      return true;
    case 'FRAME_READY':
      handleFrameReady(sender, sendResponse);
      return true;
    case 'GET_STATE':
      sendResponse({ ...session, steps: session.steps.length });
      break;
    case 'GET_GUIDES':
      GuidesRepo.list().then(sendResponse);
      return true;
    case 'DELETE_GUIDE':
      deleteGuide(msg.id, sendResponse);
      return true;
    case 'UPDATE_GUIDE_TITLE':
      updateGuideTitle(msg.id, msg.title, sendResponse);
      return true;
    case 'UPDATE_STEP':
      updateStepPatch(msg.guideId, msg.stepIndex, msg.patch, sendResponse);
      return true;
    case 'DELETE_STEP':
      deleteStep(msg.guideId, msg.stepIndex, sendResponse);
      return true;
  }
});

async function startRecording(tabId, captionLanguage, sendResponse) {
  if (session.isRecording) {
    sendResponse({ success: false, error: 'Already recording' });
    return;
  }

  try {
    const normalizedLanguage = captionLanguage === 'ar' ? 'ar' : 'en';
    const tab = await chrome.tabs.get(tabId);
    const tabUrl = tab.url || '';

    if (!isRecordableUrl(tabUrl)) {
      sendResponse({ success: false, error: 'This tab cannot be recorded.' });
      return;
    }

    session = {
      isRecording: true,
      id: `guide_${Date.now()}`,
      tabId,
      steps: [],
      startTime: Date.now(),
      startUrl: tabUrl,
      captionLanguage: normalizedLanguage,
      activeFillGroupId: null,
      preFillScreenshots: {},
      backendDemoId: null  // NEW: Initialize backend demo ID
    };

    // NEW: Create demo in backend (Immediate Sync)
    try {
      console.log('[Guidely] Creating demo in backend...');
      const title = `Guide — ${new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })}`;
      
      const backendDemo = await ApiService.createDemo(title, normalizedLanguage);
      session.backendDemoId = backendDemo.id;
      
      // Store backend demo ID in chrome.storage for persistence
      await chrome.storage.local.set({ 
        [`backend_demo_${session.id}`]: backendDemo.id 
      });
      
      console.log('[Guidely] ✅ Backend demo created:', backendDemo.id);
    } catch (error) {
      console.warn('[Guidely] ⚠️ Failed to create backend demo:', error.message);
      console.warn('[Guidely] Continuing with local-only mode');
      // Continue recording even if backend sync fails
    }

    try {
      await ensureOffscreenDocument();
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      const resp = await sendToRecorder('START_STREAM', { streamId });
      if (!resp || !resp.success) {
        throw new Error(resp?.error || 'Recorder failed to start');
      }
    } catch (err) {
      await closeOffscreenDocument();
      resetSession();
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: false, error: err?.message || 'Failed to start video capture' });
      return;
    }

    chrome.action.setBadgeText({ text: '0' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

    try {
      await broadcastToAllFrames(tabId, {
        type: 'START_RECORDING',
        captionLanguage: normalizedLanguage
      });
    } catch (_) {}

    // Capture initial page state as step 0
    try {
      // Short delay so the extension popup can fully close before we capture,
      // preventing an empty or popup-obscured initial screenshot.
      await new Promise((r) => setTimeout(r, 350));
      const screenshot = await captureScreenshot(tab.windowId);
      if (screenshot) {
        session.steps.push({
          id: `step_${Date.now()}`,
          number: 1,
          description: buildNavigateText(new URL(tabUrl).hostname, normalizedLanguage),
          type: 'navigate',
          url: tabUrl,
          screenshot,
          clickX: null,
          clickY: null,
          viewportWidth: null,
          viewportHeight: null,
          timestamp: Date.now()
        });
        chrome.action.setBadgeText({ text: '1' });
      }
    } catch (_) {}

    sendResponse({ success: true, sessionId: session.id });
  } catch (err) {
    chrome.action.setBadgeText({ text: '' });
    await closeOffscreenDocument();
    resetSession();
    sendResponse({ success: false, error: err?.message || 'Failed to start recording' });
  }
}

function resetSession() {
  session = {
    isRecording: false,
    id: null,
    tabId: null,
    steps: [],
    startTime: null,
    startUrl: null,
    captionLanguage: 'en',
    activeFillGroupId: null,
    preFillScreenshots: {},
    backendDemoId: null  // NEW: Reset backend demo ID
  };
}

async function stopRecording(sendResponse) {
  if (!session.isRecording) {
    sendResponse({ success: false, error: 'Not recording' });
    return;
  }

  await flushPendingSteps();

  // If the user stops mid-typing, the offscreen recorder may still be
  // running. Flush it so the partial clip is still attached to the active
  // fill step before we tear the stream down.
  if (session.activeFillGroupId) {
    try {
      const resp = await sendToRecorder('STOP_RECORDING');
      if (resp && resp.success && resp.mediaId) {
        const step = session.steps.find((s) => s.groupId === session.activeFillGroupId);
        if (step) step.clipMediaId = resp.mediaId;
      }
    } catch (_) {}
    session.activeFillGroupId = null;
  }
  try { await sendToRecorder('STOP_STREAM'); } catch (_) {}
  await closeOffscreenDocument();

  const sanitizedSteps = session.steps.map((step) => {
    const { groupId, finalized, ...rest } = step;
    return rest;
  });

  const guide = {
    id: session.id,
    title: `Guide — ${new Date(session.startTime).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })}`,
    createdAt: session.startTime,
    startUrl: session.startUrl,
    steps: sanitizedSteps,
    captionLanguage: session.captionLanguage
  };

  await GuidesRepo.add(guide);

  const finishedId = session.id;
  const backendDemoId = session.backendDemoId;  // NEW: Save backend demo ID

  // NEW: Upload video to backend if demo was synced (Immediate Sync)
  if (backendDemoId) {
    uploadVideoToBackend(backendDemoId, finishedId).catch((error) => {
      console.warn('[Guidely] ⚠️ Failed to upload video to backend:', error.message);
      // Video is still saved locally, so this is not critical
    });
  }

  try {
    await broadcastToAllFrames(session.tabId, { type: 'STOP_RECORDING' });
  } catch (_) {}

  chrome.action.setBadgeText({ text: '' });

  resetSession();

  sendResponse({ success: true, guideId: finishedId });
}

async function flushPendingSteps() {
  if (!session.isRecording || !session.tabId) return;
  try {
    await broadcastToAllFrames(session.tabId, { type: 'FLUSH_CAPTURE_QUEUE' });
  } catch (_) {}
}

// Called as soon as the user focuses a fill field. In video mode, we start
// the MediaRecorder here so the full typing sequence is captured from the
// very first keystroke, not after the 550ms debounce fires.
async function fillStarted(groupId, tab, sendResponse) {
  if (!session.isRecording) {
    sendResponse({ success: true });
    return;
  }
  if (!groupId) {
    sendResponse({ success: false });
    return;
  }
  // If another fill recorder is still running (user jumped fields without
  // blur), stop it cleanly before starting the new one.
  if (session.activeFillGroupId && session.activeFillGroupId !== groupId) {
    try {
      const resp = await sendToRecorder('STOP_RECORDING');
      if (resp && resp.success && resp.mediaId) {
        const prev = session.steps.find((s) => s.groupId === session.activeFillGroupId);
        if (prev) prev.clipMediaId = resp.mediaId;
      }
    } catch (_) {}
    session.activeFillGroupId = null;
  }
  // Capture a still BEFORE starting the tab-capture stream. captureVisibleTab
  // can return a blank frame while a tabCapture stream is active on some
  // Chrome builds, so taking it here (stream not yet started) is reliable.
  if (tab) {
    const preFill = await captureScreenshot(tab.windowId);
    if (preFill) {
      if (!session.preFillScreenshots) session.preFillScreenshots = {};
      session.preFillScreenshots[groupId] = preFill;
    }
  }
  try {
    const resp = await sendToRecorder('START_RECORDING', { groupId });
    if (resp && resp.success) {
      session.activeFillGroupId = groupId;
    }
  } catch (_) {}
  sendResponse({ success: true });
}

// Called when the user blurs a fill field without producing a net value
// change. The clip is discarded so we don't save a video of nothing.
async function fillAbandoned(groupId, sendResponse) {
  if (session.preFillScreenshots) delete session.preFillScreenshots[groupId];

  if (!session.isRecording) {
    sendResponse({ success: true });
    return;
  }
  if (session.activeFillGroupId !== groupId) {
    sendResponse({ success: true });
    return;
  }
  try {
    await sendToRecorder('STOP_RECORDING');
  } catch (_) {}
  session.activeFillGroupId = null;
  sendResponse({ success: true });
}

async function captureStep(data, tab, sendResponse) {
  if (!session.isRecording || !tab) {
    sendResponse({ success: false });
    return;
  }

  try {
    // Brief pause so the page can render hover/focus feedback from the
    // interaction before we capture (avoids blank or mid-transition screenshots).
    await new Promise((r) => setTimeout(r, 200));
    const screenshot = await captureScreenshot(tab.windowId);

    const step = {
      id: `step_${Date.now()}`,
      number: session.steps.length + 1,
      description: data.description,
      type: data.type,
      url: tab.url,
      screenshot: screenshot || null,
      clickX: data.clickX ?? null,
      clickY: data.clickY ?? null,
      viewportWidth: data.viewportWidth ?? null,
      viewportHeight: data.viewportHeight ?? null,
      element: data.element ?? null,
      timestamp: Date.now()
    };

    session.steps.push(step);

    chrome.action.setBadgeText({ text: String(session.steps.length) });

    // NEW: Sync step to backend immediately (Immediate Sync)
    if (session.backendDemoId) {
      syncStepToBackend(session.backendDemoId, step).catch((error) => {
        console.warn('[Guidely] ⚠️ Failed to sync step to backend:', error.message);
        // Don't fail the recording if sync fails
      });
    }

    sendResponse({ success: true, stepNumber: step.number });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// Chrome's captureVisibleTab is rate-limited (~2/sec). Serialise calls with a
// minimum spacing and retry once on rate-limit errors so the typing-frame loop
// never trips MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND.
const SCREENSHOT_MIN_SPACING_MS = 520;
let screenshotChain = Promise.resolve(null);
let lastScreenshotAt = 0;

function captureScreenshot(windowId) {
  const job = screenshotChain.then(async () => {
    const wait = Math.max(0, SCREENSHOT_MIN_SPACING_MS - (Date.now() - lastScreenshotAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const dataUrl = await captureOnce(windowId);
      lastScreenshotAt = Date.now();
      return dataUrl;
    } catch (err) {
      const msg = String(err?.message || '');
      if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/i.test(msg) || /rate/i.test(msg)) {
        await new Promise((r) => setTimeout(r, SCREENSHOT_MIN_SPACING_MS));
        try {
          const dataUrl = await captureOnce(windowId);
          lastScreenshotAt = Date.now();
          return dataUrl;
        } catch (_) {
          return null;
        }
      }
      return null;
    }
  });
  // Use the same safe promise for both chaining and the return value so
  // callers always receive null on failure instead of a rejected promise.
  screenshotChain = job.catch(() => null);
  return screenshotChain;
}

function captureOnce(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 72 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

async function captureFillFrame(data, tab, sendResponse) {
  if (!session.isRecording || !tab) {
    sendResponse({ success: false });
    return;
  }
  if (!data || !data.groupId) {
    sendResponse({ success: false });
    return;
  }

  try {
    let step = session.steps.find((s) => s.groupId === data.groupId);
    const isNew = !step;
    if (isNew) {
      step = {
        id: `step_${Date.now()}`,
        groupId: data.groupId,
        number: session.steps.length + 1,
        description: data.description || '',
        type: 'fill',
        url: tab.url,
        screenshot: null,
        clipMediaId: null,
        clickX: data.clickX ?? null,
        clickY: data.clickY ?? null,
        viewportWidth: data.viewportWidth ?? null,
        viewportHeight: data.viewportHeight ?? null,
        element: data.element ?? null,
        frames: [],
        keystrokes: [],
        timestamp: Date.now(),
        finalized: false
      };
      session.steps.push(step);
    }

    if (Array.isArray(data.keystrokes) && data.keystrokes.length) {
      if (!Array.isArray(step.keystrokes)) step.keystrokes = [];
      for (const ks of data.keystrokes) {
        if (!ks || typeof ks !== 'object') continue;
        step.keystrokes.push({
          value: typeof ks.value === 'string' ? ks.value : '',
          t: typeof ks.t === 'number' ? ks.t : 0
        });
      }
    }

    // Recorder was already started by fillStarted() on focusin.

    if (data.isFinal) {
      step.finalized = true;
      step.description = data.description || step.description;
      step.clickX = data.clickX ?? step.clickX;
      step.clickY = data.clickY ?? step.clickY;
      step.viewportWidth = data.viewportWidth ?? step.viewportWidth;
      step.viewportHeight = data.viewportHeight ?? step.viewportHeight;
      step.element = data.element ?? step.element;

      if (session.activeFillGroupId === data.groupId) {
        // Attempt a poster screenshot BEFORE stopping the stream — the stream
        // is still open so the tab is guaranteed to be the captured source.
        // If this fails, fall back to the pre-fill screenshot taken in fillStarted.
        const poster = await captureScreenshot(tab.windowId);
        try {
          const resp = await sendToRecorder('STOP_RECORDING');
          if (resp && resp.success && resp.mediaId) {
            step.clipMediaId = resp.mediaId;
          }
        } catch (_) {}
        session.activeFillGroupId = null;
        if (poster) {
          step.screenshot = poster;
        } else if (session.preFillScreenshots?.[data.groupId]) {
          step.screenshot = session.preFillScreenshots[data.groupId];
        }
        if (session.preFillScreenshots) {
          delete session.preFillScreenshots[data.groupId];
        }
      } else if (session.preFillScreenshots?.[data.groupId]) {
        // activeFillGroupId mismatch — recorder was never started for this
        // group, but we still have the pre-fill screenshot as a fallback.
        step.screenshot = session.preFillScreenshots[data.groupId];
        delete session.preFillScreenshots[data.groupId];
      }
    } else {
      step.description = data.description || step.description;
      step.element = data.element ?? step.element;
    }

    chrome.action.setBadgeText({ text: String(session.steps.length) });
    sendResponse({ success: true, stepNumber: step.number });
  } catch (err) {
    sendResponse({ success: false, error: err?.message || 'capture failed' });
  }
}

// ── Backend Sync Functions ────────────────────────────────────────────────
// Helper functions for syncing data to FastAPI backend

/**
 * Sync a step to the backend
 */
async function syncStepToBackend(backendDemoId, step) {
  try {
    console.log(`[Guidely] Syncing step ${step.number} to backend...`);
    
    // Convert screenshot from base64 to Blob if it exists
    let screenshotBlob = null;
    if (step.screenshot) {
      screenshotBlob = ApiService.dataUrlToBlob(step.screenshot);
    }
    
    // Prepare step data
    const stepData = {
      step_number: step.number,
      action: step.type || null,
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
    
    console.log(`[Guidely] ✅ Step ${step.number} synced:`, backendStep.id);
    return backendStep;
  } catch (error) {
    console.error(`[Guidely] ❌ Failed to sync step ${step.number}:`, error.message);
    throw error;
  }
}

/**
 * Upload video to backend after recording stops
 */
async function uploadVideoToBackend(backendDemoId, guideId) {
  try {
    console.log('[Guidely] Uploading video to backend...');
    
    // Get the guide to access video clips
    const guide = await GuidesRepo.get(guideId);
    if (!guide) {
      throw new Error('Guide not found');
    }
    
    // Collect all video clips from steps
    const videoMediaIds = [];
    for (const step of guide.steps) {
      if (step.clipMediaId) {
        videoMediaIds.push(step.clipMediaId);
      }
    }
    
    // If no video clips, skip upload
    if (videoMediaIds.length === 0) {
      console.log('[Guidely] No video clips to upload');
      return;
    }
    
    // Get the first video clip (or combine them if needed)
    // For now, we'll upload the first clip as the demo video
    const videoBlob = await MediaRepo.get(videoMediaIds[0]);
    
    if (!videoBlob) {
      console.warn('[Guidely] Video blob not found in MediaRepo');
      return;
    }
    
    // Upload video to backend
    const updatedDemo = await ApiService.updateDemo(
      backendDemoId,
      videoBlob,
      'completed'
    );
    
    console.log('[Guidely] ✅ Video uploaded successfully:', updatedDemo.video_url);
    
    // Store backend demo info in the guide
    await GuidesRepo.update(guideId, { 
      backendDemoId: backendDemoId,
      backendVideoUrl: updatedDemo.video_url
    });
    
    return updatedDemo;
  } catch (error) {
    console.error('[Guidely] ❌ Failed to upload video:', error.message);
    throw error;
  }
}

async function deleteGuide(id, sendResponse) {
  const guide = await GuidesRepo.get(id);
  await GuidesRepo.remove(id);
  if (guide) {
    try { await MediaRepo.removeMany(collectGuideMediaIds(guide)); } catch (_) {}
  }
  sendResponse({ success: true });
}

function collectStepMediaIds(step) {
  if (!step) return [];
  const ids = [];
  if (step.clipMediaId) ids.push(step.clipMediaId);
  return ids;
}

function collectGuideMediaIds(guide) {
  if (!guide || !Array.isArray(guide.steps)) return [];
  const ids = [];
  for (const step of guide.steps) ids.push(...collectStepMediaIds(step));
  return ids;
}

async function updateGuideTitle(id, title, sendResponse) {
  await GuidesRepo.update(id, { title });
  sendResponse({ success: true });
}

async function updateStepPatch(guideId, stepIndex, patch, sendResponse) {
  if (!patch || typeof patch !== 'object') {
    sendResponse({ success: false, error: 'Invalid patch' });
    return;
  }
  try {
    const updated = await GuidesRepo.updateStep(guideId, stepIndex, patch);
    sendResponse({ success: !!updated });
  } catch (err) {
    sendResponse({ success: false, error: err?.message || 'update failed' });
  }
}

// Re-notify content script and capture a navigation step on full-page navigation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!session.isRecording || tabId !== session.tabId) return;
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
  // Skip if this is the very first load (already captured in startRecording)
  if (session.steps.length === 0) return;

  // Re-send recording state to all frames (including iframes)
  try {
    await broadcastToAllFrames(tabId, {
      type: 'START_RECORDING',
      captionLanguage: session.captionLanguage
    });
  } catch (_) {}

  // Capture the destination page as a navigation step
  try {
    const parsed = new URL(tab.url);
    const path = parsed.pathname !== '/' ? parsed.pathname : '';
    const screenshot = await captureScreenshot(tab.windowId);
    const step = {
      id: `step_${Date.now()}`,
      number: session.steps.length + 1,
      description: buildNavigateText(`${parsed.hostname}${path}`, session.captionLanguage),
      type: 'navigate',
      url: tab.url,
      screenshot: screenshot || null,
      clickX: null,
      clickY: null,
      viewportWidth: null,
      viewportHeight: null,
      element: null,
      timestamp: Date.now()
    };
    session.steps.push(step);
    chrome.action.setBadgeText({ text: String(session.steps.length) });
  } catch (_) {}
});

async function deleteStep(guideId, stepIndex, sendResponse) {
  const guide = await GuidesRepo.get(guideId);
  const step = guide?.steps?.[stepIndex];
  const idsToRemove = collectStepMediaIds(step);
  await GuidesRepo.removeStep(guideId, stepIndex);
  if (idsToRemove.length) {
    try { await MediaRepo.removeMany(idsToRemove); } catch (_) {}
  }
  sendResponse({ success: true });
}

function buildNavigateText(destination, language = 'en') {
  if (language === 'ar') {
    return `الانتقال إلى ${destination}`;
  }
  return `Navigate to ${destination}`;
}

function isRecordableUrl(url) {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  );
}

async function broadcastToAllFrames(tabId, message) {
  let frames;
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
  } catch (_) {
    frames = null;
  }
  if (!frames?.length) {
    frames = [{ frameId: 0 }];
  }
  await Promise.allSettled(
    frames.map((f) =>
      chrome.tabs.sendMessage(tabId, message, { frameId: f.frameId })
    )
  );
}

async function handleFrameReady(sender, sendResponse) {
  if (!session.isRecording || !sender.tab || sender.tab.id !== session.tabId) {
    sendResponse({ success: true });
    return;
  }
  const frameId = sender.frameId;
  if (frameId == null || frameId === 0) {
    sendResponse({ success: true });
    return;
  }
  try {
    await chrome.tabs.sendMessage(
      session.tabId,
      { type: 'START_RECORDING', captionLanguage: session.captionLanguage },
      { frameId }
    );
  } catch (_) {}
  sendResponse({ success: true });
}

// ── Offscreen recorder bridge ─────────────────────────────────────────────
// Wraps chrome.offscreen + chrome.runtime.sendMessage so the rest of the
// file can treat the recorder as a simple request/response RPC.

async function ensureOffscreenDocument() {
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['USER_MEDIA'],
      justification: 'Record short tab-capture clips for guide steps'
    });
  } catch (err) {
    const msg = String(err?.message || '');
    // createDocument rejects if a document already exists; that's fine.
    if (!/single offscreen document|already exists/i.test(msg)) {
      throw err;
    }
  }
}

async function closeOffscreenDocument() {
  try {
    await chrome.offscreen.closeDocument();
  } catch (_) {}
}

function sendToRecorder(type, payload = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { ...payload, type, target: OFFSCREEN_TARGET },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { success: false });
          }
        }
      );
    } catch (err) {
      resolve({ success: false, error: err?.message || 'sendMessage failed' });
    }
  });
}
