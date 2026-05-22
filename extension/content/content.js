(() => {
  let isRecording = false;
  let indicator = null;
  let inputInitialValues = new WeakMap();
  let inputInteractionPoints = new WeakMap();
  let captureQueue = [];
  let pendingCapture = false;
  let captionLanguage = 'en';

  const TYPING_DEBOUNCE_MS = 550;
  let activeFill = null;
  let typingDebounceTimer = null;

  // ── Listen for background messages ───────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'START_RECORDING') {
      isRecording = true;
      captionLanguage = msg.captionLanguage === 'ar' ? 'ar' : 'en';
      captureQueue = [];
      pendingCapture = false;
      cancelTypingDebounce();
      activeFill = null;
      if (window === window.top) showIndicator();
    } else if (msg.type === 'STOP_RECORDING') {
      isRecording = false;
      captureQueue = [];
      pendingCapture = false;
      cancelTypingDebounce();
      activeFill = null;
      removeIndicator();
    } else if (msg.type === 'FLUSH_CAPTURE_QUEUE') {
      (async () => {
        await forceFireTypingDebounce();
        flushCaptureQueue();
        await waitForQueueDrain();
        sendResponse({ success: true });
      })();
      return true;
    }
  });

  // ── Recording indicator UI ────────────────────────────────────────────────
  function showIndicator() {
    if (indicator) return;
    indicator = document.createElement('div');
    indicator.id = '__guidely_indicator__';
    indicator.innerHTML = `
      <span class="dot"></span>
      <span class="label">REC</span>
      <span class="count">0 steps</span>
    `;
    Object.assign(indicator.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: '2147483647',
      background: 'rgba(15,15,15,0.85)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      padding: '6px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      userSelect: 'none',
      pointerEvents: 'none'
    });

    const style = document.createElement('style');
    style.id = '__guidely_style__';
    style.textContent = `
      #__guidely_indicator__ .dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #ef4444;
        animation: __guidely_pulse__ 1.2s ease-in-out infinite;
        flex-shrink: 0;
      }
      @keyframes __guidely_pulse__ {
        0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
      }
      .__guidely_ripple__ {
        position: fixed;
        border-radius: 50%;
        pointer-events: none;
        z-index: 2147483646;
        width: 40px; height: 40px;
        border: 3px solid #6366f1;
        background: rgba(99,102,241,0.25);
        transform: translate(-50%,-50%) scale(0);
        animation: __guidely_click__ 0.5s ease-out forwards;
      }
      @keyframes __guidely_click__ {
        to { transform: translate(-50%,-50%) scale(1.5); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(indicator);
  }

  function removeIndicator() {
    indicator?.remove();
    document.getElementById('__guidely_style__')?.remove();
    indicator = null;
  }

  function updateIndicatorCount(n) {
    if (!indicator) return;
    indicator.querySelector('.count').textContent = `${n} step${n === 1 ? '' : 's'}`;
  }

  function showRipple(x, y) {
    const r = document.createElement('div');
    r.className = '__guidely_ripple__';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  // ── Frame / viewport helpers ──────────────────────────────────────────────
  function toTopViewportCoords(clientX, clientY) {
    let x = clientX;
    let y = clientY;
    let win = window;
    while (win !== win.top) {
      const frameEl = win.frameElement;
      if (!frameEl) break;
      const rect = frameEl.getBoundingClientRect();
      x += rect.left;
      y += rect.top;
      win = win.parent;
    }
    return { x, y };
  }

  function getTopViewportSize() {
    try {
      return { width: window.top.innerWidth, height: window.top.innerHeight };
    } catch (_) {
      return { width: window.innerWidth, height: window.innerHeight };
    }
  }

  function isContentEditable(el) {
    if (!el?.getAttribute) return false;
    if (el.isContentEditable) return true;
    const ce = el.getAttribute('contenteditable');
    return ce === '' || ce === 'true';
  }

  function getFieldValue(el) {
    if (!el) return '';
    if (isContentEditable(el)) {
      return (el.innerText || el.textContent || '').trim();
    }
    return String(el.value || '');
  }

  // ── Element helpers ───────────────────────────────────────────────────────
  function getLabel(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    if (el.closest('label')) return el.closest('label').textContent.trim().slice(0, 60);
    if (el.getAttribute('placeholder')) return el.getAttribute('placeholder').trim();
    if (el.getAttribute('title')) return el.getAttribute('title').trim();
    const text = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60);
    return text || el.tagName.toLowerCase();
  }

  function isInteractiveElement(el) {
    if (!el || !el.tagName) return false;
    if (isTypingTarget(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (['button', 'a', 'select', 'option'].includes(tag)) return true;
    if (tag === 'input' && el.type !== 'hidden') return true;
    if (tag === 'textarea') return true;
    if (el.getAttribute('role') === 'button') return true;
    if (el.getAttribute('role') === 'link') return true;
    if (el.getAttribute('role') === 'menuitem') return true;
    if (el.getAttribute('role') === 'tab') return true;
    if (el.getAttribute('role') === 'option') return true;
    if (el.onclick || el.getAttribute('onclick')) return true;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && !Number.isNaN(parseInt(ti, 10)) && parseInt(ti, 10) >= 0) return true;
    if (el.classList?.contains('s3-chat-button')) return true;
    if (el.closest?.('.s3-chat-button, [class*="chat-button"]')) return true;
    return false;
  }

  function findInteractiveAncestor(el, maxDepth = 5) {
    let node = el;
    for (let i = 0; i < maxDepth; i++) {
      if (!node || node === document.body) break;
      if (isInteractiveElement(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function getValuePreview(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      const option = el.options?.[el.selectedIndex];
      return option?.text?.trim().slice(0, 60) || null;
    }
    if (isContentEditable(el) || el.getAttribute('role') === 'textbox') {
      const text = getFieldValue(el);
      if (!text) return null;
      return text.slice(0, 80);
    }
    if (tag !== 'input' && tag !== 'textarea') return null;
    if (el.type === 'password') return null;
    const text = String(el.value || '').trim();
    if (!text) return null;
    return text.slice(0, 80);
  }

  function getElementRect(el) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const topLeft = toTopViewportCoords(rect.left, rect.top);
    return {
      x: Math.round(topLeft.x),
      y: Math.round(topLeft.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function buildDescription(el, type) {
    const tag = el.tagName.toLowerCase();
    const label = getLabel(el);

    if (type === 'click') {
      if (tag === 'a') return t('click_link', label);
      if (tag === 'button' || el.type === 'submit' || el.getAttribute('role') === 'button')
        return t('click_button', label);
      if (tag === 'input' && el.type === 'checkbox')
        return el.checked ? t('check', label) : t('uncheck', label);
      if (tag === 'input' && el.type === 'radio') return t('select', label);
      if (el.getAttribute('role') === 'tab') return t('switch_tab', label);
      if (el.getAttribute('role') === 'menuitem') return t('click_generic', label);
      return t('click_generic', label);
    }

    if (type === 'fill') {
      if (tag === 'select') return t('select_dropdown', label);
      if (el.type === 'file') return t('upload_file', label);
      return t('type_field', label);
    }

    if (type === 'navigate') return t('navigate', label);

    return t('interact', label);
  }

  // ── Step capture ──────────────────────────────────────────────────────────
  function sendStep(el, type, x, y) {
    if (!isRecording) return;
    let resolvedX = x ?? null;
    let resolvedY = y ?? null;

    // For fill steps, keep spotlight anchored to the active field even when
    // users navigate by keyboard and no direct click point is available.
    if (type === 'fill' && (resolvedX == null || resolvedY == null)) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        resolvedX = rect.left + rect.width / 2;
        resolvedY = rect.top + rect.height / 2;
      }
    }

    if (resolvedX != null && resolvedY != null) {
      const top = toTopViewportCoords(resolvedX, resolvedY);
      resolvedX = top.x;
      resolvedY = top.y;
    }

    const vp = getTopViewportSize();
    const data = {
      description: buildDescription(el, type),
      type,
      clickX: resolvedX,
      clickY: resolvedY,
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      element: {
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        text: el.textContent?.trim().slice(0, 80) || null,
        role: el.getAttribute('role') || null,
        valuePreview: type === 'fill' ? getValuePreview(el) : null,
        rect: getElementRect(el)
      }
    };
    queueCapture(data);
  }

  function queueCapture(data) {
    captureQueue.push(data);
    flushCaptureQueue();
  }

  function flushCaptureQueue() {
    if (!isRecording || pendingCapture || !captureQueue.length) return;
    pendingCapture = true;
    const data = captureQueue.shift();
    chrome.runtime.sendMessage({ type: 'CAPTURE_STEP', data }, (resp) => {
      if (resp?.stepNumber) updateIndicatorCount(resp.stepNumber);
      pendingCapture = false;
      flushCaptureQueue();
    });
  }

  function waitForQueueDrain() {
    return new Promise((resolve) => {
      const tick = () => {
        if (!pendingCapture && captureQueue.length === 0) {
          resolve();
          return;
        }
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  // Click events (capture phase so we fire before navigation)
  document.addEventListener('click', (e) => {
    if (!isRecording) return;

    const pt = toTopViewportCoords(e.clientX, e.clientY);
    const target = findInteractiveAncestor(e.target);

    if (target) {
      // Skip typing-only elements (handled on blur)
      if (isTypingTarget(target)) {
        inputInteractionPoints.set(target, { x: e.clientX, y: e.clientY });
        return;
      }

      showRipple(pt.x, pt.y);
      sendStep(target, 'click', e.clientX, e.clientY);
      return;
    }

    // Fallback: capture clicks on custom widgets (e.g. div launchers, shadow hosts)
    const raw = e.target;
    if (!raw || raw === document || raw === document.documentElement || raw === document.body) {
      return;
    }
    showRipple(pt.x, pt.y);
    const vp = getTopViewportSize();
    queueCapture({
      description: t('click_page', ''),
      type: 'click',
      clickX: pt.x,
      clickY: pt.y,
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      element: {
        tag: raw.tagName?.toLowerCase() || 'unknown',
        type: null,
        text: raw.textContent?.trim().slice(0, 80) || null,
        role: raw.getAttribute?.('role') || null,
        valuePreview: null,
        rect: getElementRect(raw)
      }
    });
  }, true);

  // Focus: save initial value for text fields and open a fill group
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!isTypingTarget(el)) return;
    inputInitialValues.set(el, getFieldValue(el));
    if (!isRecording) return;
    if (el.type === 'password') return;
    if (activeFill && activeFill.el !== el) {
      forceFireTypingDebounce();
    }
    activeFill = {
      el,
      groupId: `fill_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      startedAt: performance.now(),
      lastValue: getFieldValue(el),
      framesSent: 0,
      keystrokes: [],
      keystrokesPending: []
    };
    // Notify the service worker immediately so video mode can start the
    // MediaRecorder before the first keystroke, not after the 550ms debounce.
    try {
      chrome.runtime.sendMessage({ type: 'FILL_STARTED', groupId: activeFill.groupId });
    } catch (_) {}
  }, true);

  // Typing: schedule a debounced frame capture during input
  document.addEventListener('input', (e) => {
    if (!isRecording) return;
    const el = e.target;
    if (!isTypingTarget(el)) return;
    if (el.type === 'password') return;
    if (!activeFill || activeFill.el !== el) return;

    const tNow = Math.max(0, Math.round(performance.now() - activeFill.startedAt));
    const ks = { value: getFieldValue(el), t: tNow };
    activeFill.keystrokes.push(ks);
    activeFill.keystrokesPending.push(ks);
    // Defensive cap: drop oldest pending entries if a runaway loop fills memory.
    if (activeFill.keystrokes.length > 2000) {
      activeFill.keystrokes.splice(0, activeFill.keystrokes.length - 2000);
    }
    if (activeFill.keystrokesPending.length > 2000) {
      activeFill.keystrokesPending.splice(0, activeFill.keystrokesPending.length - 2000);
    }

    cancelTypingDebounce();
    typingDebounceTimer = setTimeout(() => {
      typingDebounceTimer = null;
      sendFillFrame(false);
    }, TYPING_DEBOUNCE_MS);
  }, true);

  // Blur: capture fill step if value changed
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!isTypingTarget(el)) {
      inputInitialValues.delete(el);
      inputInteractionPoints.delete(el);
      return;
    }
    if (!isRecording || el.type === 'password') {
      inputInitialValues.delete(el);
      inputInteractionPoints.delete(el);
      if (activeFill && activeFill.el === el) {
        cancelTypingDebounce();
        activeFill = null;
      }
      return;
    }
    const prev = inputInitialValues.get(el);
    cancelTypingDebounce();
    const currentValue = getFieldValue(el);
    if (activeFill && activeFill.el === el && prev !== undefined && currentValue !== prev && currentValue.length > 0) {
      sendFillFrame(true);
    } else if (activeFill && activeFill.el === el) {
      // User focused but did not produce a net value change — discard any
      // in-progress recorder so the clip is not saved.
      try {
        chrome.runtime.sendMessage({ type: 'FILL_ABANDONED', groupId: activeFill.groupId });
      } catch (_) {}
      activeFill = null;
    }
    inputInitialValues.delete(el);
    inputInteractionPoints.delete(el);
  }, true);

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (isContentEditable(el)) return true;
    if (el.getAttribute('role') === 'textbox') return true;
    if (tag !== 'input') return false;
    return !['checkbox', 'radio', 'submit', 'button', 'file', 'reset', 'hidden'].includes(el.type);
  }

  function cancelTypingDebounce() {
    if (typingDebounceTimer != null) {
      clearTimeout(typingDebounceTimer);
      typingDebounceTimer = null;
    }
  }

  async function forceFireTypingDebounce() {
    if (typingDebounceTimer != null) {
      clearTimeout(typingDebounceTimer);
      typingDebounceTimer = null;
      if (activeFill && activeFill.el) {
        await sendFillFrame(false);
      }
    }
  }

  function sendFillFrame(isFinal) {
    if (!isRecording || !activeFill || !activeFill.el) return Promise.resolve();
    const el = activeFill.el;
    if (!el.isConnected) {
      activeFill = null;
      return Promise.resolve();
    }
    const value = getFieldValue(el);
    if (!isFinal && value === activeFill.lastValue && activeFill.framesSent > 0) return Promise.resolve();
    activeFill.lastValue = value;

    const interaction = inputInteractionPoints.get(el);
    let clickX = interaction?.x ?? null;
    let clickY = interaction?.y ?? null;
    if (clickX == null || clickY == null) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const center = toTopViewportCoords(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        clickX = center.x;
        clickY = center.y;
      }
    } else {
      const top = toTopViewportCoords(clickX, clickY);
      clickX = top.x;
      clickY = top.y;
    }

    const keystrokesBatch = activeFill.keystrokesPending;
    activeFill.keystrokesPending = [];

    const vp = getTopViewportSize();
    const data = {
      groupId: activeFill.groupId,
      isFinal: !!isFinal,
      value,
      t: Math.max(0, Math.round(performance.now() - activeFill.startedAt)),
      description: buildDescription(el, 'fill'),
      clickX,
      clickY,
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      keystrokes: keystrokesBatch,
      element: {
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        text: el.textContent?.trim().slice(0, 80) || null,
        role: el.getAttribute('role') || null,
        valuePreview: getValuePreview(el),
        rect: getElementRect(el)
      }
    };

    activeFill.framesSent += 1;
    const wasFinal = !!isFinal;

    const pending = new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'CAPTURE_FILL_FRAME', data }, (resp) => {
          if (resp?.stepNumber) updateIndicatorCount(resp.stepNumber);
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });

    if (wasFinal) {
      activeFill = null;
    }
    return pending;
  }

  // Select / change
  document.addEventListener('change', (e) => {
    if (!isRecording) return;
    const el = e.target;
    if (el.tagName.toLowerCase() === 'select') {
      sendStep(el, 'fill', null, null);
    }
  }, true);

  // SPA navigation via history API
  const _pushState = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    _pushState(...args);
    if (isRecording) onUrlChange();
  };
  history.replaceState = function (...args) {
    _replaceState(...args);
    if (isRecording) onUrlChange();
  };

  window.addEventListener('popstate', () => {
    if (isRecording) onUrlChange();
  });

  function onUrlChange() {
    if (window !== window.top) return;
    const vp = getTopViewportSize();
    const data = {
      description: t('navigate', document.title || location.pathname),
      type: 'navigate',
      clickX: null, clickY: null,
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      element: null
    };
    queueCapture(data);
  }

  function t(key, label) {
    const text = String(label || '').trim();
    const en = {
      click_link: `Click "${text}" link`,
      click_button: `Click "${text}" button`,
      click_generic: `Click "${text}"`,
      check: `Check "${text}"`,
      uncheck: `Uncheck "${text}"`,
      select: `Select "${text}"`,
      switch_tab: `Switch to "${text}" tab`,
      select_dropdown: `Select from "${text}" dropdown`,
      upload_file: `Upload file in "${text}"`,
      type_field: `Type in "${text}" field`,
      navigate: `Navigate to ${text}`,
      interact: `Interact with "${text}"`,
      click_page: 'Click on page'
    };
    const ar = {
      click_link: `انقر على رابط "${text}"`,
      click_button: `انقر على زر "${text}"`,
      click_generic: `انقر على "${text}"`,
      check: `حدد "${text}"`,
      uncheck: `أزل تحديد "${text}"`,
      select: `اختر "${text}"`,
      switch_tab: `انتقل إلى تبويب "${text}"`,
      select_dropdown: `اختر من القائمة المنسدلة "${text}"`,
      upload_file: `ارفع ملفًا في "${text}"`,
      type_field: `اكتب في الحقل "${text}"`,
      navigate: `الانتقال إلى ${text}`,
      interact: `تفاعل مع "${text}"`,
      click_page: 'انقر على الصفحة'
    };
    const dict = captionLanguage === 'ar' ? ar : en;
    return dict[key] || en[key] || text;
  }

  // Notify background when a subframe loads so late iframes join an active session
  if (window !== window.top) {
    try {
      chrome.runtime.sendMessage({ type: 'FRAME_READY' });
    } catch (_) {}
  }
})();
