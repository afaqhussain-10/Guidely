// Repository for large binary media (video clips, and any future blobs).
//
// Backed by IndexedDB so we can hold webm clips and other blobs that would
// otherwise blow chrome.storage.local's quota. Keys are opaque mediaIds;
// values are { blob, type, createdAt }.
//
// Exposed as `self.MediaRepo` so this file works in service workers,
// offscreen documents, popup pages, and the guide viewer.
(function () {
  'use strict';

  const DB_NAME = 'guidely-media';
  const DB_VERSION = 1;
  const STORE = 'blobs';

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function asPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; }).catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  function newId() {
    return `media_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  async function put(blob, id) {
    if (!(blob instanceof Blob)) throw new Error('MediaRepo.put requires a Blob');
    const mediaId = id || newId();
    await withStore('readwrite', (store) => {
      store.put({ blob, type: blob.type || '', createdAt: Date.now() }, mediaId);
    });
    return mediaId;
  }

  async function get(mediaId) {
    if (!mediaId) return null;
    let record = null;
    await withStore('readonly', (store) => asPromise(store.get(mediaId)).then((r) => { record = r; }));
    return record ? record.blob : null;
  }

  // Convenience for the viewer: returns an object URL that can be assigned
  // to <video> or <img>. Caller is responsible for revoking it.
  async function getObjectURL(mediaId) {
    const blob = await get(mediaId);
    return blob ? URL.createObjectURL(blob) : null;
  }

  async function remove(mediaId) {
    if (!mediaId) return;
    await withStore('readwrite', (store) => { store.delete(mediaId); });
  }

  async function removeMany(mediaIds) {
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) return;
    const unique = Array.from(new Set(mediaIds.filter(Boolean)));
    if (unique.length === 0) return;
    await withStore('readwrite', (store) => {
      for (const id of unique) store.delete(id);
    });
  }

  self.MediaRepo = {
    put,
    get,
    getObjectURL,
    remove,
    removeMany
  };
})();
