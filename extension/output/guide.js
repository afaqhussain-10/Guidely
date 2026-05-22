let guide = null;
let currentIndex = 0;
let isDemoMode = false;
let isSidebarBound = false;

const appEl = document.querySelector('.app');
const stepList = document.getElementById('step-list');
const screenshotImg = document.getElementById('screenshot-img');
const screenshotImgNext = document.getElementById('screenshot-img-next');
const screenshotVideo = document.getElementById('screenshot-video');
const screenshotArea = document.getElementById('screenshot-area');
const screenshotWrapper = document.getElementById('screenshot-wrapper');
const frameFilmstrip = document.getElementById('frame-filmstrip');
const demoSpotlight = document.getElementById('demo-spotlight');
const demoHotspot = document.getElementById('demo-hotspot');
const demoFocusProgress = document.getElementById('demo-focus-progress');
const demoFocusProgressText = document.getElementById('demo-focus-progress-text');
const clickIndicator = document.getElementById('click-indicator');
const noScreenshot = document.getElementById('no-screenshot');
const stepBadge = document.getElementById('step-badge');
const stepDescription = document.getElementById('step-description');
const stepCounter = document.getElementById('step-counter');
const guideTitleInput = document.getElementById('guide-title');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnExport = document.getElementById('btn-export');
const btnMode = document.getElementById('btn-mode');
const btnPrevLabel = document.getElementById('btn-prev-label');
const btnNextLabel = document.getElementById('btn-next-label');
const demoCard = document.getElementById('demo-card');
const demoStepLabel = document.getElementById('demo-step-label');
const demoProgressText = document.getElementById('demo-progress-text');
const demoProgressFill = document.getElementById('demo-progress-fill');
const demoDescription = document.getElementById('demo-description');
const demoPrev = document.getElementById('demo-prev');
const demoNext = document.getElementById('demo-next');
const demoPrevLabel = document.getElementById('demo-prev-label');
const demoNextLabel = document.getElementById('demo-next-label');
const demoCursor = document.getElementById('demo-cursor');
const demoTypingOverlay = document.getElementById('demo-typing-overlay');
const demoTypingText = document.getElementById('demo-typing-text');

let demoTimelineRun = 0;
let demoTimelineTimers = [];
// Object URL currently bound to <video>. Tracked so we can revoke it on
// step change to avoid leaking blob URLs across navigation.
let currentVideoUrl = null;

const TIMELINE = {
  cardEnterMs: 260,
  descriptionStartMs: 70,
  cursorStartMs: 20,
  cursorTravelMs: 380,
  interactionStartMs: 430,
  clickEndMs: 880,
  typingSpeedSlowMs: 85,
  typingSpeedFastMs: 60,
  typingMinTailMs: 500,
  cursorTypingMinMs: 720,
  // Cap real-keystroke replay duration so abnormally slow recordings don't
  // stall playback; we compress proportionally if raw exceeds this value.
  typingMaxPlaybackMs: 6000
};

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  const guideId = new URLSearchParams(location.search).get('id');
  if (!guideId) {
    document.body.innerHTML = '<div class="loading">No guide ID specified.</div>';
    return;
  }

  const guides = await sendMsg({ type: 'GET_GUIDES' });
  guide = guides?.find(g => g.id === guideId);

  if (!guide) {
    document.body.innerHTML = '<div class="loading">Guide not found.</div>';
    return;
  }

  guideTitleInput.value = guide.title;
  document.title = guide.title + ' — Guidely';
  document.documentElement.dir = isArabicGuide() ? 'rtl' : 'ltr';
  document.documentElement.lang = isArabicGuide() ? 'ar' : 'en';
  applyUiLanguage();

  renderSidebar();
  initMode();
  showStep(0);
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function renderSidebar() {
  stepList.innerHTML = guide.steps.map((step, i) => {
    const typeLabel = getTypeLabel(step.type);
    const screenshotSrc = getSafeImageSrc(step.screenshot);
    const thumb = screenshotSrc
      ? `<img class="step-thumb" src="${screenshotSrc}" loading="lazy" alt=""/>`
      : `<div class="step-thumb-placeholder"></div>`;

    return `
      <div class="step-item${i === currentIndex ? ' active' : ''}" data-index="${i}">
        <div class="step-num">${i + 1}</div>
        ${thumb}
        <div class="step-info-sidebar">
          <div class="step-type-badge">${typeLabel}</div>
          <div class="step-desc-sidebar">${escHtml(step.description)}</div>
        </div>
        <button class="sidebar-delete" data-index="${i}" title="${uiText('deleteStepTitle')}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;
  }).join('');

  bindSidebarClick();
}

function bindSidebarClick() {
  if (isSidebarBound) return;
  isSidebarBound = true;
  stepList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.sidebar-delete');
    if (deleteBtn) {
      e.stopPropagation();
      deleteStep(parseInt(deleteBtn.dataset.index, 10));
      return;
    }
    const item = e.target.closest('.step-item');
    if (item) {
      showStep(parseInt(item.dataset.index, 10));
    }
  });
}

function updateSidebarActive() {
  stepList.querySelectorAll('.step-item').forEach((el, i) => {
    el.classList.toggle('active', i === currentIndex);
  });
  // Scroll active item into view
  const active = stepList.querySelector('.step-item.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Step display ──────────────────────────────────────────────────────────
function showStep(index) {
  if (!guide?.steps?.length) return;
  cancelDemoTimeline();
  resetCrossfade();
  revokeCurrentVideoUrl();
  index = Math.max(0, Math.min(index, guide.steps.length - 1));
  currentIndex = index;

  const step = guide.steps[index];
  const total = guide.steps.length;

  stepBadge.textContent = index + 1;
  stepDescription.textContent = step.description;
  stepCounter.textContent = `${index + 1} / ${total}`;
  updateDemoCard(step, total);

  btnPrev.disabled = index === 0;
  btnNext.disabled = index === total - 1;
  demoPrev.disabled = index === 0;
  demoNext.disabled = index === total - 1;

  if (step.clipMediaId && screenshotVideo) {
    showStepVideo(step);
  } else {
    showStepImage(step);
  }

  updateSidebarActive();
}

function showStepImage(step) {
  hideStepVideo();
  renderFilmstrip(step);

  const initialScreenshot = pickInitialScreenshot(step);
  if (initialScreenshot) {
    screenshotImg.style.display = '';
    noScreenshot.classList.add('hidden');
    screenshotImg.src = '';

    screenshotImg.onload = () => {
      placeClickIndicator(step);
      if (isDemoMode) placeDemoCard(step, true);
    };
    screenshotImg.src = initialScreenshot;
  } else {
    screenshotImg.style.display = 'none';
    noScreenshot.classList.remove('hidden');
    clickIndicator.style.display = 'none';
    demoHotspot.classList.add('hidden');
    demoFocusProgress.classList.add('hidden');
    if (isDemoMode) placeDemoCard(step, true);
  }
}

async function showStepVideo(step) {
  // The clip captures what actually happened — the demo overlays would
  // double-animate on top, so hide all of them and let the video stand alone.
  screenshotImg.style.display = 'none';
  noScreenshot.classList.add('hidden');
  clickIndicator.style.display = 'none';
  demoHotspot.classList.add('hidden');
  demoFocusProgress.classList.add('hidden');
  if (frameFilmstrip) {
    frameFilmstrip.classList.add('hidden');
    frameFilmstrip.innerHTML = '';
  }
  resetDemoZoom();

  const expectedIndex = currentIndex;
  let url;
  try {
    url = await MediaRepo.getObjectURL(step.clipMediaId);
  } catch (_) {
    url = null;
  }
  // The user may have already navigated to a different step while we were
  // resolving the blob — drop the result if so to avoid stomping state.
  if (expectedIndex !== currentIndex) {
    if (url) URL.revokeObjectURL(url);
    return;
  }
  if (!url) {
    showStepImage(step);
    return;
  }

  currentVideoUrl = url;
  screenshotVideo.style.display = '';
  screenshotVideo.onloadedmetadata = () => {
    if (expectedIndex !== currentIndex) return;
    placeClickIndicator(step);
    if (isDemoMode) placeDemoCard(step, false);
  };
  screenshotVideo.src = url;
  screenshotVideo.play().catch(() => {});
  if (screenshotVideo.readyState >= 1) {
    placeClickIndicator(step);
    if (isDemoMode) placeDemoCard(step, false);
  }
}

function hideStepVideo() {
  if (!screenshotVideo) return;
  screenshotVideo.onloadedmetadata = null;
  screenshotVideo.style.display = 'none';
  if (screenshotVideo.src) {
    try { screenshotVideo.pause(); } catch (_) {}
    screenshotVideo.removeAttribute('src');
    try { screenshotVideo.load(); } catch (_) {}
  }
}

function revokeCurrentVideoUrl() {
  if (currentVideoUrl) {
    try { URL.revokeObjectURL(currentVideoUrl); } catch (_) {}
    currentVideoUrl = null;
  }
}

window.addEventListener('beforeunload', () => {
  revokeCurrentVideoUrl();
});

function pickInitialScreenshot(step) {
  if (isDemoMode && hasMultipleFrames(step)) {
    return step.frames[0].screenshot || step.screenshot || null;
  }
  return step.screenshot || null;
}

function hasMultipleFrames(step) {
  return !!(step && Array.isArray(step.frames) && step.frames.length > 1
    && step.frames.every((f) => f && f.screenshot));
}

function renderFilmstrip(step) {
  if (!frameFilmstrip) return;
  if (!hasMultipleFrames(step)) {
    frameFilmstrip.classList.add('hidden');
    frameFilmstrip.innerHTML = '';
    return;
  }
  const label = isArabicGuide() ? 'الإطارات' : 'Frames';
  const thumbs = step.frames.map((frame, i) => {
    const src = getSafeImageSrc(frame.screenshot);
    return `
      <button class="frame-thumb${i === 0 ? ' active' : ''}" data-frame-index="${i}" title="Frame ${i + 1}">
        <span class="frame-thumb-index">${i + 1}</span>
        ${src ? `<img src="${src}" loading="lazy" alt=""/>` : ''}
      </button>
    `;
  }).join('');

  frameFilmstrip.innerHTML = `<span class="frame-filmstrip-label">${escHtml(label)}</span>${thumbs}`;
  frameFilmstrip.classList.remove('hidden');
  bindFilmstripClicks(step);
}

function bindFilmstripClicks(step) {
  if (!frameFilmstrip) return;
  frameFilmstrip.querySelectorAll('.frame-thumb').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.frameIndex, 10);
      if (isNaN(idx)) return;
      const frame = step.frames[idx];
      if (!frame || !frame.screenshot) return;
      frameFilmstrip.querySelectorAll('.frame-thumb').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (isDemoMode) {
        crossfadeScreenshotTo(frame.screenshot);
      } else {
        resetCrossfade();
        screenshotImg.src = frame.screenshot;
      }
    });
  });
}

function resetCrossfade() {
  if (!screenshotImgNext) return;
  screenshotImgNext.onload = null;
  screenshotImgNext.classList.remove('visible');
  screenshotImgNext.removeAttribute('src');
}

// Show `src` overlaid on top of the main screenshot. We never write to
// `screenshotImg.src` here because that would re-fire its onload handler and
// restart the demo timeline (creating an infinite loop). The overlay img stays
// visible until the next step resets it.
function crossfadeScreenshotTo(src) {
  if (!screenshotImgNext || !src) return;
  if (screenshotImgNext.src === src && screenshotImgNext.classList.contains('visible')) return;

  if (!screenshotImgNext.classList.contains('visible')) {
    screenshotImgNext.onload = () => {
      requestAnimationFrame(() => screenshotImgNext.classList.add('visible'));
    };
    screenshotImgNext.src = src;
    if (screenshotImgNext.complete && screenshotImgNext.naturalWidth) {
      requestAnimationFrame(() => screenshotImgNext.classList.add('visible'));
    }
  } else {
    screenshotImgNext.onload = null;
    screenshotImgNext.src = src;
  }
}

function placeClickIndicator(step) {
  const points = getFocusPoints(step);
  if (!points.hasClick) {
    clickIndicator.style.display = 'none';
    return;
  }

  clickIndicator.style.left = `${points.wrapperX}px`;
  clickIndicator.style.top = `${points.wrapperY}px`;

  if (isDemoMode) {
    clickIndicator.style.display = 'none';
  } else {
    clickIndicator.style.display = '';
  }
}

function updateDemoCard(step, total) {
  demoStepLabel.textContent = `${uiText('stepLabel')} ${currentIndex + 1}`;
  demoProgressText.textContent = `${currentIndex + 1} / ${total}`;
  demoFocusProgressText.textContent = `${currentIndex + 1} / ${total}`;
  demoDescription.dataset.fullText = step.description || '';
  demoDescription.textContent = step.description;
  demoProgressFill.style.width = `${((currentIndex + 1) / total) * 100}%`;
}

function placeDemoCard(step, replayTimeline = false) {
  if (!isDemoMode || demoCard.classList.contains('hidden')) return;

  // Reset any lingering zoom transform from the previous step so that
  // getBoundingClientRect() below reads the natural, untransformed layout.
  // applyDemoZoom() is called at the end of this function to re-apply zoom.
  resetDemoZoom();

  const areaRect = screenshotArea.getBoundingClientRect();
  const cardWidth = Math.min(340, Math.max(230, areaRect.width - 36));
  demoCard.style.width = `${cardWidth}px`;
  const points = getAnchoredFocusPoints(step, currentIndex);
  const focusX = points.areaX;
  const focusY = points.areaY;
  const showFormFocus = shouldShowDemoFocus(step);

  const cardHeight = demoCard.offsetHeight || 180;
  const margin = 12;
  const anchorGap = 12;
  let left = (areaRect.width - cardWidth) / 2;
  let top = areaRect.height - cardHeight - 24;
  let bubblePos = 'none';

  if (showFormFocus && points.hasClick) {
    const preferRight = isArabicGuide() ? focusX > areaRect.width / 2 : focusX < areaRect.width / 2;
    left = preferRight ? focusX + anchorGap : focusX - cardWidth - anchorGap;
    left = Math.max(margin, Math.min(left, areaRect.width - cardWidth - margin));

    const preferTop = focusY > areaRect.height * 0.52;
    top = preferTop ? focusY - cardHeight - anchorGap : focusY + anchorGap;
    top = Math.max(margin, Math.min(top, areaRect.height - cardHeight - margin));
    bubblePos = preferTop ? 'above' : 'below';

    const tailX = Math.max(22, Math.min(cardWidth - 22, focusX - left));
    demoCard.style.setProperty('--bubble-tail-x', `${tailX}px`);
  }

  demoCard.style.left = `${left}px`;
  demoCard.style.top = `${top}px`;
  demoCard.dataset.bubblePos = bubblePos;
  demoSpotlight.style.setProperty('--focus-x', `${focusX}px`);
  demoSpotlight.style.setProperty('--focus-y', `${focusY}px`);
  applyDemoZoom(points, showFormFocus, step);
  demoSpotlight.classList.add('hidden');
  demoHotspot.classList.add('hidden');
  demoFocusProgress.classList.add('hidden');
  startDemoTimeline(step, points, showFormFocus, replayTimeline);
  if (!step.screenshot) {
    resetDemoZoom();
    return;
  }
}

function startDemoTimeline(step, points, showFormFocus, replayTimeline) {
  if (!isDemoMode) return;
  if (!replayTimeline) return;
  if (isVideoStepShowing()) return;

  demoTimelineRun += 1;
  const runId = demoTimelineRun;
  clearDemoTimelineArtifacts();

  demoCard.classList.add('timeline-enter');
  queueDemoTimeline(runId, TIMELINE.cardEnterMs, () => demoCard.classList.remove('timeline-enter'));
  const fieldTypingDuration = getFieldTypingDuration(step);
  queueDemoTimeline(runId, TIMELINE.descriptionStartMs, () => animateDescriptionText(step, runId));

  if (step?.screenshot && showFormFocus) {
    animateTypingOverlay(step, points, runId, fieldTypingDuration + TIMELINE.descriptionStartMs);
    animateDemoCursor(step, points, runId, fieldTypingDuration + TIMELINE.descriptionStartMs);
  }
}

function cancelDemoTimeline() {
  demoTimelineRun += 1;
  clearDemoTimelineArtifacts();
}

function clearDemoTimelineArtifacts() {
  for (const timer of demoTimelineTimers) clearTimeout(timer);
  demoTimelineTimers = [];
  demoCard.classList.remove('timeline-enter', 'typing-active');
  if (demoDescription.dataset.fullText) {
    demoDescription.textContent = demoDescription.dataset.fullText;
  }
  if (demoCursor) {
    demoCursor.classList.add('hidden');
    demoCursor.classList.remove('moving', 'click', 'typing');
  }
  if (demoTypingOverlay && demoTypingText) {
    demoTypingOverlay.classList.add('hidden');
    demoTypingOverlay.classList.remove('active');
    demoTypingText.textContent = '';
  }
  resetCrossfade();
}

function queueDemoTimeline(runId, delay, callback) {
  const timer = setTimeout(() => {
    if (runId !== demoTimelineRun) return;
    callback();
  }, delay);
  demoTimelineTimers.push(timer);
}

function animateDescriptionText(step, runId) {
  const fullText = demoDescription.dataset.fullText || step?.description || '';
  if (!fullText) return;
  demoDescription.textContent = fullText;
  demoCard.classList.remove('typing-active');
}

function getTimelineText(step, fallback = '') {
  const valuePreview = step?.element?.valuePreview;
  if (!valuePreview || step?.type !== 'fill') return fallback;
  if (isArabicGuide()) {
    return `اكتب "${valuePreview}" ثم تابع.`;
  }
  return `Type "${valuePreview}" and continue.`;
}

function getFieldTypingDuration(step) {
  const ks = sanitizeKeystrokes(step);
  if (ks && ks.length) {
    const raw = Math.max(0, ks[ks.length - 1].t - ks[0].t);
    const factor = computeTypingSpeedFactor(raw);
    return raw * factor + TIMELINE.typingMinTailMs;
  }
  const typedValue = getTypedPreview(step);
  if (!typedValue) return 0;
  const speed = typedValue.length > 26 ? TIMELINE.typingSpeedFastMs : TIMELINE.typingSpeedSlowMs;
  return typedValue.length * speed + TIMELINE.typingMinTailMs;
}

function animateTypingOverlay(step, points, runId, typingDuration = 0) {
  if (!demoTypingOverlay || !demoTypingText) return;
  if (step?.type !== 'fill') return;

  const ks = sanitizeKeystrokes(step);

  if (ks && ks.length) {
    demoTypingText.textContent = '';
    demoTypingOverlay.classList.remove('hidden');
    demoTypingOverlay.classList.add('active');

    const fieldRect = getFieldOverlayRect(step, points);
    demoTypingOverlay.style.left = `${fieldRect.centerX}px`;
    demoTypingOverlay.style.top = `${fieldRect.centerY}px`;
    demoTypingOverlay.style.width = `${fieldRect.width}px`;
    demoTypingOverlay.style.height = `${fieldRect.height}px`;
    demoTypingOverlay.style.maxWidth = `${fieldRect.width}px`;
    demoTypingOverlay.style.minWidth = `${fieldRect.width}px`;

    const t0 = ks[0].t;
    const rawDuration = Math.max(0, ks[ks.length - 1].t - t0);
    const factor = computeTypingSpeedFactor(rawDuration);

    ks.forEach(({ value, t }) => {
      const at = Math.max(0, (t - t0) * factor);
      queueDemoTimeline(runId, at, () => {
        demoTypingText.textContent = clampDisplayValue(value);
      });
    });

    scheduleFrameSwapsByKeystroke(step, ks, runId, t0, factor);

    const tail = rawDuration * factor + TIMELINE.typingMinTailMs;
    queueDemoTimeline(runId, Math.max(tail, TIMELINE.interactionStartMs + typingDuration), () => {
      demoTypingOverlay.classList.remove('active');
      demoTypingOverlay.classList.add('hidden');
      demoTypingText.textContent = '';
    });
    return;
  }

  const typedValue = getTypedPreview(step);
  if (!typedValue) return;

  demoTypingText.textContent = '';
  demoTypingOverlay.classList.remove('hidden');
  demoTypingOverlay.classList.add('active');

  const fieldRect = getFieldOverlayRect(step, points);
  demoTypingOverlay.style.left = `${fieldRect.centerX}px`;
  demoTypingOverlay.style.top = `${fieldRect.centerY}px`;
  demoTypingOverlay.style.width = `${fieldRect.width}px`;
  demoTypingOverlay.style.height = `${fieldRect.height}px`;
  demoTypingOverlay.style.maxWidth = `${fieldRect.width}px`;
  demoTypingOverlay.style.minWidth = `${fieldRect.width}px`;

  const speed = typedValue.length > 26 ? TIMELINE.typingSpeedFastMs : TIMELINE.typingSpeedSlowMs;
  const frameSwapByLength = buildFrameSwapMap(step, typedValue);

  for (let i = 1; i <= typedValue.length; i += 1) {
    const charIndex = i;
    queueDemoTimeline(runId, charIndex * speed, () => {
      demoTypingText.textContent = typedValue.slice(0, charIndex);
      if (frameSwapByLength && frameSwapByLength.has(charIndex)) {
        crossfadeScreenshotTo(frameSwapByLength.get(charIndex));
      }
    });
  }

  queueDemoTimeline(runId, Math.max(typedValue.length * speed + TIMELINE.typingMinTailMs, TIMELINE.interactionStartMs + typingDuration), () => {
    demoTypingOverlay.classList.remove('active');
    demoTypingOverlay.classList.add('hidden');
    demoTypingText.textContent = '';
  });
}

function sanitizeKeystrokes(step) {
  if (!step || !Array.isArray(step.keystrokes) || step.keystrokes.length === 0) return null;
  const cleaned = step.keystrokes
    .filter((k) => k && typeof k.value === 'string' && typeof k.t === 'number' && isFinite(k.t))
    .map((k) => ({ value: k.value, t: Math.max(0, k.t) }))
    .sort((a, b) => a.t - b.t);
  return cleaned.length ? cleaned : null;
}

function computeTypingSpeedFactor(rawDurationMs) {
  if (!isFinite(rawDurationMs) || rawDurationMs <= 0) return 1;
  if (rawDurationMs <= TIMELINE.typingMaxPlaybackMs) return 1;
  return TIMELINE.typingMaxPlaybackMs / rawDurationMs;
}

function clampDisplayValue(raw) {
  const s = String(raw || '');
  if (s.length <= 48) return s;
  return `${s.slice(0, 48)}...`;
}

function scheduleFrameSwapsByKeystroke(step, ks, runId, t0, factor) {
  if (!hasMultipleFrames(step) || !ks || !ks.length) return;
  for (let i = 1; i < step.frames.length; i += 1) {
    const frame = step.frames[i];
    if (!frame || !frame.screenshot) continue;
    const frameT = typeof frame.t === 'number' ? frame.t : null;
    if (frameT == null) continue;
    // Anchor each non-leading screenshot crossfade to the keystroke whose
    // timestamp lands closest to that frame — keeps screenshot swaps in sync
    // with the field content the user actually saw at capture time.
    let bestT = ks[0].t;
    let bestDiff = Math.abs(bestT - frameT);
    for (let j = 1; j < ks.length; j += 1) {
      const diff = Math.abs(ks[j].t - frameT);
      if (diff < bestDiff) { bestT = ks[j].t; bestDiff = diff; }
    }
    const at = Math.max(0, (bestT - t0) * factor);
    queueDemoTimeline(runId, at, () => {
      crossfadeScreenshotTo(frame.screenshot);
    });
  }
}

function buildFrameSwapMap(step, typedValue) {
  if (!hasMultipleFrames(step)) return null;
  const map = new Map();
  const finalLen = typedValue.length;
  // Frame 0 is already shown by the main <img>; we only need to crossfade
  // toward subsequent frames as the typewriter advances.
  for (let i = 1; i < step.frames.length; i += 1) {
    const frame = step.frames[i];
    if (!frame || !frame.screenshot) continue;
    const v = String(frame.value || '');
    const len = Math.min(v.length, finalLen);
    map.set(len, frame.screenshot);
  }
  if (map.size === 0) return null;
  return map;
}

function getTypedPreview(step) {
  const raw = String(step?.element?.valuePreview || '').trim();
  if (!raw) return '';
  if (raw.length <= 48) return raw;
  return `${raw.slice(0, 48)}...`;
}

function getFieldOverlayRect(step, points) {
  const areaRect = screenshotArea.getBoundingClientRect();
  const margin = 16;
  const fallback = {
    centerX: points.areaX,
    centerY: points.areaY + 30,
    width: 230,
    height: 42
  };

  const rect = step?.element?.rect;
  const mediaRect = getMediaRect();
  if (rect && step?.viewportWidth && step?.viewportHeight && mediaRect) {
    const scaleX = mediaRect.width / step.viewportWidth;
    const scaleY = mediaRect.height / step.viewportHeight;
    const scaledWidth = rect.width * scaleX;
    const scaledHeight = rect.height * scaleY;
    const width = Math.max(120, Math.min(420, scaledWidth));
    const height = Math.max(34, Math.min(66, scaledHeight));
    const centerX = (rect.x * scaleX) + (mediaRect.left - areaRect.left) + (scaledWidth / 2);
    const centerY = (rect.y * scaleY) + (mediaRect.top - areaRect.top) + (scaledHeight / 2);
    return clampFieldRect({ centerX, centerY, width, height }, areaRect, margin);
  }

  return clampFieldRect(fallback, areaRect, margin);
}

function clampFieldRect(rect, areaRect, margin) {
  const result = { ...rect };
  const halfW = result.width / 2;
  const halfH = result.height / 2;
  result.centerX = Math.max(margin + halfW, Math.min(result.centerX, areaRect.width - margin - halfW));
  result.centerY = Math.max(margin + halfH, Math.min(result.centerY, areaRect.height - margin - halfH));
  return result;
}

function animateDemoCursor(step, points, runId, typingDuration = 0) {
  if (!demoCursor) return;

  const startX = points.areaX - 38;
  const startY = points.areaY + 32;
  setDemoCursorPosition(startX, startY);
  demoCursor.classList.remove('click', 'typing');
  demoCursor.classList.remove('hidden');

  queueDemoTimeline(runId, TIMELINE.cursorStartMs, () => {
    demoCursor.classList.add('moving');
    setDemoCursorPosition(points.areaX, points.areaY);
  });
  queueDemoTimeline(runId, TIMELINE.cursorTravelMs, () => demoCursor.classList.remove('moving'));

  if (step?.type === 'fill') {
    queueDemoTimeline(runId, TIMELINE.interactionStartMs, () => demoCursor.classList.add('typing'));
    queueDemoTimeline(runId, TIMELINE.interactionStartMs + Math.max(TIMELINE.cursorTypingMinMs, typingDuration), () => demoCursor.classList.remove('typing'));
    return;
  }

  queueDemoTimeline(runId, TIMELINE.interactionStartMs, () => demoCursor.classList.add('click'));
  queueDemoTimeline(runId, TIMELINE.clickEndMs, () => demoCursor.classList.remove('click'));
}

function setDemoCursorPosition(x, y) {
  if (!demoCursor) return;
  demoCursor.style.left = `${x}px`;
  demoCursor.style.top = `${y}px`;
}

function applyDemoZoom(points, showFormFocus, step) {
  if (!isDemoMode || !step?.screenshot || isVideoStepShowing()) {
    resetDemoZoom();
    return;
  }

  if (!showFormFocus) {
    resetDemoZoom();
    return;
  }

  const scale = getDemoZoomScale(step);
  screenshotWrapper.style.transformOrigin = `${points.wrapperX}px ${points.wrapperY}px`;
  screenshotWrapper.style.transform = `scale(${scale})`;
}

function resetDemoZoom() {
  screenshotWrapper.style.transformOrigin = '50% 50%';
  screenshotWrapper.style.transform = 'scale(1)';
}

function getDemoZoomScale(step) {
  if (step?.type === 'fill') return 1.18;
  const tag = (step?.element?.tag || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 1.16;
  if (tag === 'button') return 1.12;
  return 1.1;
}

function shouldShowDemoFocus(step) {
  if (!isDemoMode || !step) return false;
  if (step.type === 'fill') return true;

  const element = step.element || {};
  const tag = (element.tag || '').toLowerCase();
  const role = (element.role || '').toLowerCase();
  const type = (element.type || '').toLowerCase();

  if (['input', 'select', 'textarea', 'button', 'option'].includes(tag)) return true;
  if (type) return true;
  if (['button', 'checkbox', 'radio', 'switch', 'textbox', 'combobox', 'option', 'listbox', 'slider', 'spinbutton'].includes(role)) {
    return true;
  }
  return false;
}

function isVideoStepShowing() {
  return !!(screenshotVideo
    && screenshotVideo.style.display !== 'none'
    && screenshotVideo.src);
}

function getActiveMediaElement() {
  if (isVideoStepShowing()) return screenshotVideo;
  if (screenshotImg && screenshotImg.style.display !== 'none' && (screenshotImg.src || screenshotImg.naturalWidth)) {
    return screenshotImg;
  }
  return null;
}

function getMediaRect() {
  const el = getActiveMediaElement();
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return rect;
}

function getFocusPoints(step) {
  const areaRect = screenshotArea.getBoundingClientRect();
  const wrapperRect = screenshotWrapper.getBoundingClientRect();
  const center = {
    areaX: areaRect.width / 2,
    areaY: areaRect.height / 2,
    wrapperX: wrapperRect.width / 2,
    wrapperY: wrapperRect.height / 2,
    hasClick: false
  };

  // Priority: explicit click coords > element.rect center > null (no position).
  let pointX = step.clickX;
  let pointY = step.clickY;
  if ((pointX == null || pointY == null) && step.element?.rect) {
    const r = step.element.rect;
    pointX = r.x + r.width / 2;
    pointY = r.y + r.height / 2;
  }

  if (pointX == null || !step.viewportWidth || !step.viewportHeight) {
    const mediaRect = getMediaRect();
    if (mediaRect) {
      return {
        areaX: (mediaRect.left - areaRect.left) + (mediaRect.width / 2),
        areaY: (mediaRect.top - areaRect.top) + (mediaRect.height / 2),
        wrapperX: (mediaRect.left - wrapperRect.left) + (mediaRect.width / 2),
        wrapperY: (mediaRect.top - wrapperRect.top) + (mediaRect.height / 2),
        hasClick: false
      };
    }
    return center;
  }

  const mediaRect = getMediaRect();
  if (mediaRect) {
    const scaleX = mediaRect.width / step.viewportWidth;
    const scaleY = mediaRect.height / step.viewportHeight;
    return {
      areaX: pointX * scaleX + (mediaRect.left - areaRect.left),
      areaY: pointY * scaleY + (mediaRect.top - areaRect.top),
      wrapperX: pointX * scaleX + (mediaRect.left - wrapperRect.left),
      wrapperY: pointY * scaleY + (mediaRect.top - wrapperRect.top),
      hasClick: true
    };
  }

  // No rendered media yet — scale against the screenshot area as a fallback.
  const scaleX = areaRect.width / step.viewportWidth;
  const scaleY = areaRect.height / step.viewportHeight;
  const ax = pointX * scaleX;
  const ay = pointY * scaleY;
  return {
    areaX: ax,
    areaY: ay,
    wrapperX: ax - (areaRect.left - wrapperRect.left),
    wrapperY: ay - (areaRect.top - wrapperRect.top),
    hasClick: true
  };
}

function getAnchoredFocusPoints(step, stepIndex) {
  const direct = getFocusPoints(step);
  if (direct.hasClick) return direct;
  const isFillStep = step?.type === 'fill';

  // For fill/navigate steps that don't carry click coords, re-use a nearby click
  // from the same URL to keep spotlight/card near the active field.
  for (let i = stepIndex - 1; i >= Math.max(0, stepIndex - 3); i -= 1) {
    const candidate = guide.steps[i];
    if (!candidate || candidate.url !== step.url) continue;
    const points = getFocusPoints(candidate);
    if (points.hasClick) return points;
  }

  if (isFillStep) return direct;

  for (let i = stepIndex + 1; i <= Math.min(guide.steps.length - 1, stepIndex + 2); i += 1) {
    const candidate = guide.steps[i];
    if (!candidate || candidate.url !== step.url) continue;
    const points = getFocusPoints(candidate);
    if (points.hasClick) return points;
  }

  return direct;
}

function placeFocusProgress(points) {
  if (!isDemoMode) return;
  const areaRect = screenshotArea.getBoundingClientRect();
  const margin = 14;
  const offsetX = isArabicGuide() ? -58 : 58;
  const offsetY = -44;
  const boxW = demoFocusProgress.offsetWidth || 70;
  const boxH = demoFocusProgress.offsetHeight || 28;

  let x = points.areaX + offsetX;
  let y = points.areaY + offsetY;

  const minX = margin + (boxW / 2);
  const maxX = areaRect.width - margin - (boxW / 2);
  const minY = margin + (boxH / 2);
  const maxY = areaRect.height - margin - (boxH / 2);

  x = Math.max(minX, Math.min(x, maxX));
  y = Math.max(minY, Math.min(y, maxY));

  demoFocusProgress.style.left = `${x}px`;
  demoFocusProgress.style.top = `${y}px`;
  demoFocusProgress.classList.remove('hidden');
}

function initMode() {
  const params = new URLSearchParams(location.search);
  const queryMode = params.get('mode');
  const savedMode = PrefsRepo.getGuideViewMode();
  const initialDemo = queryMode === 'demo' || (!queryMode && savedMode === 'demo');
  setMode(initialDemo);
}

function setMode(demoMode) {
  isDemoMode = !!demoMode;
  appEl.classList.toggle('demo-mode', isDemoMode);
  btnMode.classList.toggle('active', isDemoMode);
  btnMode.textContent = isDemoMode ? uiText('modeEditor') : uiText('modePresentation');
  stepDescription.contentEditable = isDemoMode ? 'false' : 'true';
  demoCard.classList.toggle('hidden', !isDemoMode);
  demoSpotlight.classList.add('hidden');
  demoFocusProgress.classList.add('hidden');
  if (!isDemoMode) {
    cancelDemoTimeline();
    resetDemoZoom();
    demoHotspot.classList.add('hidden');
    demoFocusProgress.classList.add('hidden');
  }
  PrefsRepo.setGuideViewMode(isDemoMode ? 'demo' : 'editor');

  if (guide?.steps?.length) {
    const step = guide.steps[currentIndex];
    updateDemoCard(step, guide.steps.length);
    placeDemoCard(step, true);
  }
}

// ── Navigation ────────────────────────────────────────────────────────────
btnPrev.addEventListener('click', () => showStep(currentIndex - 1));
btnNext.addEventListener('click', () => showStep(currentIndex + 1));
demoPrev.addEventListener('click', () => showStep(currentIndex - 1));
demoNext.addEventListener('click', () => showStep(currentIndex + 1));
btnMode.addEventListener('click', () => setMode(!isDemoMode));
screenshotArea.addEventListener('click', (e) => {
  if (!isDemoMode) return;
  if (e.target.closest('#demo-card')) return;
  if (currentIndex < guide.steps.length - 1) showStep(currentIndex + 1);
});

document.addEventListener('keydown', (e) => {
  if (e.target === guideTitleInput || e.target === stepDescription) return;
  const nextDelta = isArabicGuide() ? -1 : 1;
  const prevDelta = isArabicGuide() ? 1 : -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') showStep(currentIndex + nextDelta);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') showStep(currentIndex + prevDelta);
  if (isDemoMode && e.key === ' ') {
    e.preventDefault();
    showStep(currentIndex + 1);
  }
});

// Re-place indicator on window resize
window.addEventListener('resize', () => {
  if (guide?.steps[currentIndex]) {
    placeClickIndicator(guide.steps[currentIndex]);
    placeDemoCard(guide.steps[currentIndex], isDemoMode);
  }
});

// ── Editable title ────────────────────────────────────────────────────────
guideTitleInput.addEventListener('blur', async () => {
  const newTitle = guideTitleInput.value.trim() || 'Untitled Guide';
  guideTitleInput.value = newTitle;
  if (guide) {
    guide.title = newTitle;
    document.title = newTitle + ' — Guidely';
    await sendMsg({ type: 'UPDATE_GUIDE_TITLE', id: guide.id, title: newTitle });
  }
});

guideTitleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') guideTitleInput.blur();
});

// ── Editable step description ─────────────────────────────────────────────
stepDescription.addEventListener('blur', async () => {
  if (!guide) return;
  const newDesc = stepDescription.textContent.trim();
  if (newDesc && guide.steps[currentIndex]) {
    guide.steps[currentIndex].description = newDesc;
    const sidebarDesc = stepList.querySelectorAll('.step-desc-sidebar')[currentIndex];
    if (sidebarDesc) sidebarDesc.textContent = newDesc;
    await sendMsg({
      type: 'UPDATE_STEP',
      guideId: guide.id,
      stepIndex: currentIndex,
      patch: { description: newDesc }
    });
  }
});

// ── Delete step ───────────────────────────────────────────────────────────
async function deleteStep(index) {
  if (!guide || guide.steps.length <= 1) {
    showToast('Cannot delete the only step');
    return;
  }
  guide.steps.splice(index, 1);
  guide.steps.forEach((s, i) => { s.number = i + 1; });

  await sendMsg({ type: 'DELETE_STEP', guideId: guide.id, stepIndex: index });

  const newIndex = Math.min(currentIndex, guide.steps.length - 1);
  renderSidebar();
  showStep(newIndex);
}

// ── Export ────────────────────────────────────────────────────────────────
btnExport.addEventListener('click', exportGuide);

function exportGuide() {
  if (!guide) return;

  const stepsHtml = guide.steps.map((step, i) => {
    const screenshotSrc = getSafeImageSrc(step.screenshot);
    return `
    <div class="step-card">
      <div class="step-header">
        <div class="num">${i + 1}</div>
        <div class="desc">${escHtml(step.description)}</div>
      </div>
      ${screenshotSrc ? `<div class="img-wrap"><img src="${screenshotSrc}" alt="Step ${i + 1}"/></div>` : ''}
    </div>
  `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(guide.title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;padding:40px 24px}
  h1{font-size:24px;margin-bottom:8px;color:#1e293b}
  .meta{font-size:13px;color:#64748b;margin-bottom:40px}
  .step-card{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
  .step-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}
  .num{width:28px;height:28px;border-radius:50%;background:#6366f1;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .desc{font-size:14px;font-weight:500;line-height:1.5;padding-top:4px}
  .img-wrap img{width:100%;border-radius:8px;border:1px solid #e2e8f0}
</style>
</head>
<body>
  <h1>${escHtml(guide.title)}</h1>
  <p class="meta">${guide.steps.length} steps · Created ${new Date(guide.createdAt).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})}</p>
  ${stepsHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${guide.title.replace(/[^a-z0-9]/gi, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Guide exported!');
}

// ── Helpers ───────────────────────────────────────────────────────────────
function isArabicGuide() {
  return guide?.captionLanguage === 'ar';
}

function uiText(key) {
  const en = {
    prev: 'Prev',
    next: 'Next',
    back: 'Back',
    modePresentation: 'Presentation',
    modeEditor: 'Editor',
    stepLabel: 'Step',
    deleteStepTitle: 'Delete step',
    typeNavigate: 'Navigate',
    typeFill: 'Fill',
    typeClick: 'Click'
  };
  const ar = {
    prev: 'السابق',
    next: 'التالي',
    back: 'السابق',
    modePresentation: 'عرض',
    modeEditor: 'تحرير',
    stepLabel: 'الخطوة',
    deleteStepTitle: 'حذف الخطوة',
    typeNavigate: 'تنقل',
    typeFill: 'إدخال',
    typeClick: 'نقر'
  };
  const dict = isArabicGuide() ? ar : en;
  return dict[key] || en[key] || key;
}

function getTypeLabel(type) {
  if (type === 'navigate') return uiText('typeNavigate');
  if (type === 'fill') return uiText('typeFill');
  return uiText('typeClick');
}

function applyUiLanguage() {
  btnPrevLabel.textContent = uiText('prev');
  btnNextLabel.textContent = uiText('next');
  demoPrevLabel.textContent = '←';
  demoNextLabel.textContent = '→';
  btnPrev.title = uiText('prev');
  btnNext.title = uiText('next');
  demoPrev.title = uiText('back');
  demoNext.title = uiText('next');
}

function sendMsg(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSafeImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (value.startsWith('data:image/')) return escHtml(value);
  if (value.startsWith('blob:')) return escHtml(value);
  return '';
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

init();
