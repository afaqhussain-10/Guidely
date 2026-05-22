// Offscreen recorder. Owns the tab-capture MediaStream and a MediaRecorder
// that is started / stopped once per fill step.
//
// Why offscreen: MV3 service workers cannot host MediaRecorder, <video>, or
// getUserMedia. We isolate that machinery here and stream completed clips
// directly into IndexedDB (via MediaRepo) so blobs never cross the message
// boundary — the service worker only sees mediaIds.
//
// Message protocol (all messages carry `target: 'guidely-recorder'`):
//   START_STREAM    { streamId }            → opens the tabCapture stream
//   START_RECORDING { groupId? }            → begins MediaRecorder
//   STOP_RECORDING  {}                      → finalizes, writes blob to
//                                             MediaRepo, replies { mediaId }
//   STOP_STREAM     {}                      → tears the stream down
(function () {
  'use strict';

  const TARGET = 'guidely-recorder';

  let stream = null;
  let recorder = null;
  let chunks = [];
  let activeGroupId = null;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== TARGET) return;

    switch (msg.type) {
      case 'START_STREAM':
        startStream(msg.streamId)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: errMessage(err) }));
        return true;

      case 'START_RECORDING':
        startRecording(msg.groupId)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: errMessage(err) }));
        return true;

      case 'STOP_RECORDING':
        stopRecording()
          .then((mediaId) => sendResponse({ success: true, mediaId }))
          .catch((err) => sendResponse({ success: false, error: errMessage(err) }));
        return true;

      case 'STOP_STREAM':
        stopStream();
        sendResponse({ success: true });
        return false;
    }
  });

  async function startStream(streamId) {
    if (!streamId) throw new Error('streamId required');
    if (stream) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });
  }

  async function startRecording(groupId) {
    if (!stream) throw new Error('No active tab stream');
    // If a previous recorder is somehow still running, discard it cleanly
    // so we never leak chunks across fills.
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_) {}
    }
    chunks = [];
    activeGroupId = groupId || null;

    const mimeType = pickMimeType();
    const options = mimeType
      ? { mimeType, videoBitsPerSecond: 1_500_000 }
      : { videoBitsPerSecond: 1_500_000 };
    recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    // Small timeslice so ondataavailable fires periodically; protects us
    // against very long fills where a single final chunk would be huge.
    recorder.start(500);
  }

  async function stopRecording() {
    if (!recorder || recorder.state === 'inactive') {
      chunks = [];
      activeGroupId = null;
      return null;
    }
    const localRecorder = recorder;
    const localMimeType = recorder.mimeType || 'video/webm';

    await new Promise((resolve) => {
      localRecorder.onstop = () => resolve();
      try {
        localRecorder.stop();
      } catch (_) {
        resolve();
      }
    });

    const collected = chunks;
    chunks = [];
    recorder = null;
    activeGroupId = null;

    if (!collected.length) return null;
    const blob = new Blob(collected, { type: localMimeType });
    if (blob.size === 0) return null;
    return await MediaRepo.put(blob);
  }

  function stopStream() {
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_) {}
    }
    recorder = null;
    chunks = [];
    activeGroupId = null;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
      stream = null;
    }
  }

  function pickMimeType() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const c of candidates) {
      try {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
          return c;
        }
      } catch (_) {}
    }
    return '';
  }

  function errMessage(err) {
    return err && err.message ? err.message : String(err || 'recorder error');
  }
})();
