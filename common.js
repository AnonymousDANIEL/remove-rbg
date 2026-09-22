const Core = (() => {
  const DB_NAME = 'remove-bg-local';
  const DB_VERSION = 4;
  const HISTORY_STORE = 'history';
  const MAX_HISTORY = 24;
  let dbPromise = null;
  let toastTimer = null;

  function $(s, root = document) { return root.querySelector(s); }
  function $$(s, root = document) { return [...root.querySelectorAll(s)]; }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function put(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const req = tx.objectStore(HISTORY_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const req = tx.objectStore(HISTORY_STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function removeRecord(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearHistory() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function trimHistory() {
    const items = await getAll();
    for (const item of items.slice(MAX_HISTORY)) await removeRecord(item.id);
  }

  function createId() {
    return `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
  }

  async function saveResult(record) {
    const saved = {
      ...record,
      id: createId(),
      createdAt: Date.now(),
    };
    await put(saved);
    await trimHistory();
    localStorage.setItem('remove-bg-current-id', saved.id);
    return saved;
  }

  function setCurrentId(id) { localStorage.setItem('remove-bg-current-id', id); }
  function getCurrentId() { return localStorage.getItem('remove-bg-current-id'); }
  function clearCurrentId() { localStorage.removeItem('remove-bg-current-id'); }

  async function apiError(response) {
    try {
      const data = await response.json();
      return data.error || `Request failed (${response.status})`;
    } catch {
      return `Request failed (${response.status})`;
    }
  }

  async function removeFile(file) {
    const form = new FormData();
    form.append('image', file, file.name || 'pasted-image.png');
    const response = await fetch('/api/remove', { method: 'POST', body: form });
    if (!response.ok) throw new Error(await apiError(response));
    return response.blob();
  }

  async function removeUrl(url) {
    const response = await fetch('/api/remove-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) throw new Error(await apiError(response));
    return response.blob();
  }

  async function processFileAndOpen(file) {
    if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
    const resultBlob = await removeFile(file);
    await saveResult({
      originalBlob: file,
      resultBlob,
      name: file.name || 'pasted-image.png',
    });
    location.assign('/result');
  }

  async function processUrlAndOpen(url, name = 'url-image.jpg') {
    const resultBlob = await removeUrl(url);
    await saveResult({ originalUrl: url, resultBlob, name });
    location.assign('/result');
  }

  async function copyPng(blob) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Image copy is not supported in this browser.');
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  function downloadPng(blob, filename = 'removed-background.png') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.[^.]+$/, '') + '-no-bg.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function readClipboardImage() {
    if (!navigator.clipboard?.read) throw new Error('Press Ctrl+V to paste an image in this browser.');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      return new File([blob], 'pasted-image.png', { type: blob.type || 'image/png' });
    }
    throw new Error('No image found in clipboard.');
  }

  return {
    $, $$, toast, get, getAll, removeRecord, clearHistory,
    saveResult, setCurrentId, getCurrentId, clearCurrentId,
    processFileAndOpen, processUrlAndOpen, copyPng, downloadPng, readClipboardImage,
  };
})();
window.RemoveBGCore = Core;
