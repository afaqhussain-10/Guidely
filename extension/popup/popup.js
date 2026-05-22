let timerInterval = null;
let recordingStart = null;

const viewIdle = document.getElementById('view-idle');
const viewRecording = document.getElementById('view-recording');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const recTime = document.getElementById('rec-time');
const recSteps = document.getElementById('rec-steps');
const guidesList = document.getElementById('guides-list');
const captionLanguageSelect = document.getElementById('caption-language');

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  await loadCaptionLanguage();
  const state = await sendMsg({ type: 'GET_STATE' });
  if (state?.isRecording) {
    if (state.captionLanguage) {
      captionLanguageSelect.value = state.captionLanguage;
    }
    recordingStart = state.startTime;
    showRecordingView(state.steps);
  }
  captionLanguageSelect.disabled = !!state?.isRecording;
  loadGuides();
}

// ── Helpers ───────────────────────────────────────────────────────────────
function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ── Views ─────────────────────────────────────────────────────────────────
function showIdleView() {
  viewIdle.classList.remove('hidden');
  viewRecording.classList.add('hidden');
  clearInterval(timerInterval);
  timerInterval = null;
}

function showRecordingView(stepCount = 0) {
  viewIdle.classList.add('hidden');
  viewRecording.classList.remove('hidden');
  recSteps.textContent = `${stepCount} step${stepCount === 1 ? '' : 's'}`;

  clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    const state = await sendMsg({ type: 'GET_STATE' });
    const n = state?.steps ?? 0;
    recSteps.textContent = `${n} step${n === 1 ? '' : 's'}`;
    if (state?.startTime) {
      recTime.textContent = formatTime(Date.now() - state.startTime);
    }
  }, 500);
}

// ── Buttons ───────────────────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const captionLanguage = captionLanguageSelect.value || 'en';
  await PrefsRepo.setCaptionLanguage(captionLanguage);

  btnStart.disabled = true;
  captionLanguageSelect.disabled = true;
  btnStart.textContent = 'Starting…';

  const resp = await sendMsg({
    type: 'START_RECORDING',
    tabId: tab.id,
    captionLanguage
  });

  if (resp?.success) {
    recordingStart = Date.now();
    showRecordingView(0);
  } else {
    btnStart.disabled = false;
    captionLanguageSelect.disabled = false;
    btnStart.innerHTML = '<span class="btn-dot"></span> Start Recording';
    alert(resp?.error || 'Failed to start recording');
  }
});

btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  btnStop.textContent = 'Saving…';

  const resp = await sendMsg({ type: 'STOP_RECORDING' });

  clearInterval(timerInterval);
  timerInterval = null;

  if (resp?.success) {
    showIdleView();
    btnStart.disabled = false;
    captionLanguageSelect.disabled = false;
    btnStart.innerHTML = '<span class="btn-dot"></span> Start Recording';
    loadGuides();
    openGuide(resp.guideId);
  } else {
    btnStop.disabled = false;
    btnStop.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="10" height="10" rx="2"/></svg>
      Stop Recording
    `;
  }
});

// ── Guides list ───────────────────────────────────────────────────────────
async function loadGuides() {
  const guides = await sendMsg({ type: 'GET_GUIDES' });

  if (!guides || guides.length === 0) {
    guidesList.innerHTML = '<div class="empty-state">No guides yet</div>';
    return;
  }

  guidesList.innerHTML = guides.slice(0, 8).map((g, i) => {
    const thumb = g.steps?.[0]?.screenshot;
    const stepCount = g.steps?.length ?? 0;
    const date = new Date(g.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const thumbEl = thumb
      ? `<img class="guide-thumb" src="${thumb}" alt=""/>`
      : `<div class="guide-thumb-placeholder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 10l-4 4 4 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></div>`;

    return `
      <div class="guide-item" data-id="${g.id}" data-index="${i}">
        ${thumbEl}
        <div class="guide-info">
          <div class="guide-title">${escHtml(g.title)}</div>
          <div class="guide-meta">${stepCount} step${stepCount === 1 ? '' : 's'} · ${date}</div>
        </div>
        <div class="guide-actions">
          <button class="icon-btn view-btn" title="View guide" data-id="${g.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="icon-btn danger delete-btn" title="Delete" data-id="${g.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Event delegation
  guidesList.addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('.view-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    const guideItem = e.target.closest('.guide-item');

    if (viewBtn) {
      e.stopPropagation();
      openGuide(viewBtn.dataset.id);
    } else if (deleteBtn) {
      e.stopPropagation();
      await sendMsg({ type: 'DELETE_GUIDE', id: deleteBtn.dataset.id });
      loadGuides();
    } else if (guideItem) {
      openGuide(guideItem.dataset.id);
    }
  }, { once: true });
}

function openGuide(guideId) {
  const url = chrome.runtime.getURL(`output/guide.html?id=${guideId}`);
  chrome.tabs.create({ url });
  window.close();
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadCaptionLanguage() {
  captionLanguageSelect.value = await PrefsRepo.getCaptionLanguage();
}

init();
