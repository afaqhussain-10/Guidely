// Repository for user-facing UI preferences.
//
// Caption language is persisted in chrome.storage.local so the popup and
// background share the same value. The guide viewer's editor/presentation
// mode lives in localStorage because it is a per-tab UI choice that does
// not need to survive extension reloads or be visible to the background.
(function () {
  'use strict';

  const KEY_CAPTION_LANGUAGE = 'captionLanguage';
  const KEY_GUIDE_VIEW_MODE = 'guideViewMode';

  function normalizeCaptionLanguage(value) {
    return value === 'ar' ? 'ar' : 'en';
  }

  async function getCaptionLanguage() {
    const r = await chrome.storage.local.get(KEY_CAPTION_LANGUAGE);
    return normalizeCaptionLanguage(r[KEY_CAPTION_LANGUAGE]);
  }

  async function setCaptionLanguage(value) {
    await chrome.storage.local.set({
      [KEY_CAPTION_LANGUAGE]: normalizeCaptionLanguage(value)
    });
  }

  function getGuideViewMode() {
    try {
      return localStorage.getItem(KEY_GUIDE_VIEW_MODE);
    } catch (_) {
      return null;
    }
  }

  function setGuideViewMode(mode) {
    try {
      localStorage.setItem(KEY_GUIDE_VIEW_MODE, mode);
    } catch (_) {}
  }

  self.PrefsRepo = {
    getCaptionLanguage,
    setCaptionLanguage,
    getGuideViewMode,
    setGuideViewMode
  };
})();
