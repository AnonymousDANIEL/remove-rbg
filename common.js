const DB_NAME = 'free-bg-remover-v1';
const DB_VERSION = 1;
const STORE = 'images';
const MAX_HISTORY = 30;
let dbPromise;
let toastTimer;

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function toast(message) {
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
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('kind', 'kind');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function dbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGet(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    req.onerror = () => reject(req.error);
  });
}

export async function clearHistory() {
  const all = await dbAll();
  await Promise.all(all.filter(x => x.kind === 'result').map(x => dbDelete(x.id)));
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function settings() {
  return {
    mode: localStorage.getItem('bg-mode') || 'smart',
    quality: localStorage.getItem('bg-quality') || 'hd',
  };
}

export function setSetting(key, value) {
  localStorage.setItem(key === 'mode' ? 'bg-mode' : 'bg-quality', value);
  syncSettingButtons();
}

export function syncSettingButtons() {
  const s = settings();
  $$('[data-mode-choice]').forEach(b => b.classList.toggle('active', b.dataset.modeChoice === s.mode));
  $$('[data-quality-choice]').forEach(b => b.classList.toggle('active', b.dataset.qualityChoice === s.quality));
}

export function bindSettingButtons() {
  $$('[data-mode-choice]').forEach(b => b.addEventListener('click', () => setSetting('mode', b.dataset.modeChoice)));
  $$('[data-quality-choice]').forEach(b => b.addEventListener('click', () => setSetting('quality', b.dataset.qualityChoice)));
  syncSettingButtons();
}

export async function createPending(blob, name = 'image.png', sourceUrl = '') {
  if (!blob?.type?.startsWith('image/')) throw new Error('Please choose or paste an image.');
  const id = uuid();
  const s = settings();
  const record = {
    id,
    kind: 'pending',
    createdAt: Date.now(),
    originalBlob: blob,
    name,
    sourceUrl,
    requestedMode: s.mode,
    requestedQuality: s.quality,
  };
  await dbPut(record);
  localStorage.setItem('bg-pending-id', id);
  return record;
}

export async function saveResult(pending, resultBlob, meta = {}) {
  const record = {
    ...pending,
    kind: 'result',
    resultBlob,
    finishedAt: Date.now(),
    ...meta,
  };
  await dbPut(record);
  localStorage.setItem('bg-current-id', record.id);
  const all = (await dbAll()).filter(x => x.kind === 'result');
  await Promise.all(all.slice(MAX_HISTORY).map(x => dbDelete(x.id)));
  return record;
}

export function goProcessing(id) {
  location.assign(`/processing?id=${encodeURIComponent(id)}`);
}

export async function submitBlob(blob, name = 'image.png', sourceUrl = '') {
  const pending = await createPending(blob, name, sourceUrl);
  goProcessing(pending.id);
}

export async function fetchRemoteImage(url) {
  const endpoint = `/proxy-image?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) {
    let msg = `Could not load image (${response.status})`;
    try { msg = (await response.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await response.blob();
  const pathname = new URL(url).pathname;
  const name = pathname.split('/').pop() || 'url-image.jpg';
  return { blob, name };
}

function pasteFile(data) {
  if (!data) return null;
  for (const item of [...(data.items || [])]) {
    if (item.kind === 'file' && item.type?.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return [...(data.files || [])].find(f => f.type?.startsWith('image/')) || null;
}

function looksLikeUrl(value) {
  try {
    const u = new URL((value || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function pasteUrl(data) {
  if (!data) return null;
  const html = data.getData?.('text/html') || '';
  if (html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const src = doc.querySelector('img')?.src || '';
      if (looksLikeUrl(src)) return src;
    } catch {}
  }
  const uri = (data.getData?.('text/uri-list') || '').split(/\r?\n/).find(v => v && !v.startsWith('#')) || '';
  if (looksLikeUrl(uri)) return uri.trim();
  const text = (data.getData?.('text/plain') || '').trim();
  return looksLikeUrl(text) ? text : null;
}

export async function readClipboardImage() {
  if (!navigator.clipboard?.read) throw new Error('Press Ctrl+V to paste the copied image.');
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find(t => t.startsWith('image/'));
    if (type) {
      const blob = await item.getType(type);
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      return { blob, name: `pasted-${Date.now()}.${ext}` };
    }
  }
  for (const item of items) {
    if (item.types.includes('text/plain')) {
      const text = (await (await item.getType('text/plain')).text()).trim();
      if (looksLikeUrl(text)) return fetchRemoteImage(text);
    }
  }
  throw new Error('No image found in clipboard.');
}

export function bindGlobalPaste() {
  document.addEventListener('paste', async event => {
    const t = event.target;
    if (t && (t.matches?.('input,textarea') || t.isContentEditable)) return;
    const file = pasteFile(event.clipboardData);
    const url = file ? null : pasteUrl(event.clipboardData);
    if (!file && !url) return;
    event.preventDefault();
    try {
      if (file) await submitBlob(file, file.name || `pasted-${Date.now()}.png`);
      else {
        const remote = await fetchRemoteImage(url);
        await submitBlob(remote.blob, remote.name, url);
      }
    } catch (e) { toast(e.message || 'Paste failed.'); }
  });
}

export async function copyPng(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Copy image is not supported by this browser.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function downloadPng(blob, filename = 'removed-background.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\.[^.]+$/, '') + '-no-bg.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function initCommon() {
  bindSettingButtons();
  bindGlobalPaste();
  const engine = $('#engineBadge');
  if (engine) engine.textContent = navigator.gpu ? 'Local GPU' : 'Local CPU';
}
