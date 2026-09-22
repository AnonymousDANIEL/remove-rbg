const Core = (() => {
  const DB_NAME = 'remove-bg-local-v7';
  const STORE = 'history';
  const DB_VERSION = 1;
  const MAX_HISTORY = 30;
  let dbPromise = null;
  let toastTimer = null;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function mode() {
    return localStorage.getItem('remove-bg-mode') === 'hd' ? 'hd' : 'fast';
  }

  function setMode(value) {
    localStorage.setItem('remove-bg-mode', value === 'hd' ? 'hd' : 'fast');
    syncModeButtons();
  }

  function syncModeButtons() {
    $$('[data-quality]').forEach(btn => {
      const active = btn.dataset.quality === mode();
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function bindModeButtons() {
    $$('[data-quality]').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.quality));
    });
    syncModeButtons();
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
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
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(id) {
    if (!id) return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a,b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function del(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clear() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveHistory(record) {
    const saved = {
      ...record,
      id: record.id || `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
      createdAt: record.createdAt || Date.now(),
    };
    await put(saved);
    const all = await getAll();
    for (const old of all.slice(MAX_HISTORY)) await del(old.id);
    localStorage.setItem('remove-bg-current-record', saved.id);
    return saved;
  }

  function currentRecordId() {
    return localStorage.getItem('remove-bg-current-record');
  }

  function setCurrentRecord(id) {
    if (id) localStorage.setItem('remove-bg-current-record', id);
  }

  async function responseError(response) {
    try {
      const data = await response.json();
      return data.error || `Request failed (${response.status})`;
    } catch {
      return `Request failed (${response.status})`;
    }
  }

  async function createJobFromFile(file) {
    if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
    const form = new FormData();
    form.append('image', file, file.name || 'pasted-image.png');
    form.append('mode', mode());

    const response = await fetch('/api/jobs', { method: 'POST', body: form });
    if (!response.ok) throw new Error(await responseError(response));
    return response.json();
  }

  async function createJobFromUrl(url) {
    const response = await fetch('/api/jobs-url', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ url, mode: mode() }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    return response.json();
  }

  function goProcessing(job) {
    const q = new URLSearchParams({ id: job.id, name: job.name || 'image.png', mode: job.mode || mode() });
    location.assign(`/processing?${q.toString()}`);
  }

  async function submitFile(file) {
    const job = await createJobFromFile(file);
    goProcessing(job);
  }

  async function submitUrl(url) {
    const job = await createJobFromUrl(url);
    goProcessing(job);
  }

  function fileFromClipboardData(data) {
    if (!data) return null;
    for (const item of [...(data.items || [])]) {
      if (item.kind === 'file' && item.type?.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const ext = (blob.type.split('/')[1] || 'png').replace('jpeg','jpg');
          return new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
        }
      }
    }
    for (const file of [...(data.files || [])]) {
      if (file.type?.startsWith('image/')) return file;
    }
    return null;
  }

  function isHttpUrl(value) {
    try {
      const u = new URL((value || '').trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }

  function clipboardUrl(data) {
    if (!data) return null;
    const html = data.getData?.('text/html') || '';
    if (html) {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const src = doc.querySelector('img')?.getAttribute('src') || '';
        if (isHttpUrl(src)) return src;
      } catch {}
    }
    const uri = (data.getData?.('text/uri-list') || '').split(/\r?\n/).find(v => v && !v.startsWith('#')) || '';
    if (isHttpUrl(uri)) return uri.trim();
    const text = (data.getData?.('text/plain') || '').trim();
    return isHttpUrl(text) ? text : null;
  }

  async function readClipboard() {
    if (!navigator.clipboard?.read) throw new Error('Press Ctrl+V to paste the copied image.');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg','jpg');
        return { file: new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type || 'image/png' }) };
      }
    }
    for (const item of items) {
      if (item.types.includes('text/plain')) {
        const text = (await (await item.getType('text/plain')).text()).trim();
        if (isHttpUrl(text)) return { url: text };
      }
    }
    throw new Error('No image found in clipboard.');
  }

  function bindGlobalPaste() {
    document.addEventListener('paste', async event => {
      const target = event.target;
      if (target && (target.matches?.('input,textarea') || target.isContentEditable)) return;

      const file = fileFromClipboardData(event.clipboardData);
      const url = file ? null : clipboardUrl(event.clipboardData);
      if (!file && !url) return;

      event.preventDefault();
      try {
        if (file) await submitFile(file);
        else await submitUrl(url);
      } catch (err) {
        toast(err.message || 'Could not process that image.');
      }
    });
  }

  async function copyPng(blob) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Image copy is not supported in this browser.');
    }
    await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
  }

  function downloadPng(blob, filename='removed-background.png') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.[^.]+$/, '') + '-no-bg.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function setup() {
    bindModeButtons();
    bindGlobalPaste();
  }

  return {
    $, $$, toast, mode, setMode, setup, readClipboard,
    createJobFromFile, createJobFromUrl, submitFile, submitUrl, goProcessing,
    saveHistory, get, getAll, del, clear, currentRecordId, setCurrentRecord,
    copyPng, downloadPng, responseError,
  };
})();

window.addEventListener('DOMContentLoaded', () => Core.setup());
