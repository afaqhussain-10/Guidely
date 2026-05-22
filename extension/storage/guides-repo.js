// Repository for guide CRUD.
//
// All read/write access to the stored list of guides flows through this
// module so callers never touch chrome.storage.local directly. Today the
// backing store is chrome.storage.local; a future revision can swap in
// IndexedDB or a remote backend without touching call sites.
//
// Exposed as `self.GuidesRepo` so the file works unchanged in service
// workers (`self`), popup pages, and the guide viewer.
(function () {
  'use strict';

  const STORAGE_KEY = 'guides';
  const MAX_GUIDES = 20;

  async function readAll() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  async function writeAll(guides) {
    await chrome.storage.local.set({ [STORAGE_KEY]: guides });
  }

  async function list() {
    return readAll();
  }

  async function get(id) {
    const guides = await readAll();
    return guides.find((g) => g.id === id) || null;
  }

  // Insert a freshly recorded guide at the head of the list and trim to the
  // retention cap. The cap exists because guides currently embed base64
  // screenshots — once media moves to IndexedDB the cap can be lifted here.
  async function add(guide) {
    const guides = await readAll();
    guides.unshift(guide);
    if (guides.length > MAX_GUIDES) guides.splice(MAX_GUIDES);
    await writeAll(guides);
    return guide;
  }

  async function update(id, patch) {
    const guides = await readAll();
    const guide = guides.find((g) => g.id === id);
    if (!guide) return null;
    Object.assign(guide, patch);
    await writeAll(guides);
    return guide;
  }

  async function remove(id) {
    const guides = await readAll();
    const next = guides.filter((g) => g.id !== id);
    await writeAll(next);
  }

  async function updateStep(guideId, stepIndex, patch) {
    const guides = await readAll();
    const guide = guides.find((g) => g.id === guideId);
    if (!guide || !Array.isArray(guide.steps)) return null;
    if (stepIndex < 0 || stepIndex >= guide.steps.length) return null;
    Object.assign(guide.steps[stepIndex], patch);
    await writeAll(guides);
    return guide.steps[stepIndex];
  }

  async function removeStep(guideId, stepIndex) {
    const guides = await readAll();
    const guide = guides.find((g) => g.id === guideId);
    if (!guide || !Array.isArray(guide.steps)) return null;
    if (stepIndex < 0 || stepIndex >= guide.steps.length) return null;
    guide.steps.splice(stepIndex, 1);
    guide.steps.forEach((s, i) => { s.number = i + 1; });
    await writeAll(guides);
    return guide;
  }

  self.GuidesRepo = {
    list,
    get,
    add,
    update,
    remove,
    updateStep,
    removeStep
  };
})();
