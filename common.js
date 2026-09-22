const Core = (() => {
  const DB_NAME = 'remove-bg-local';
  const DB_VERSION = 5;
  const HISTORY_STORE = 'history';
  const MAX_HISTORY = 30;
  const MAX_DOCK_ITEMS = 9;
  let dbPromise = null;
  let toastTimer = null;
  let queueRunning = false;
  let redirectWhenIdle = false;
  let redirectReady = false;
  let lastDisplayedSequence = 0;
  let sequence = 0;
  const queue = [];
  const jobs = new Map();

  function $(s, root = document) { return root.querySelector(s); }
  function $$(s, root = document) { return [...root.querySelectorAll(s)]; }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
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
    const saved = { ...record, id: createId(), createdAt: Date.now() };
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

  async function processFile(file) {
    if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
    const resultBlob = await removeFile(file);
    return saveResult({ originalBlob: file, resultBlob, name: file.name || 'pasted-image.png' });
  }

  async function processUrl(url, name = 'url-image.jpg') {
    const resultBlob = await removeUrl(url);
    return saveResult({ originalUrl: url, resultBlob, name });
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

  function dataUrlToFile(dataUrl, filename = 'pasted-image.png') {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl || '');
    if (!match) return null;
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: match[1] });
  }

  function isHttpUrl(value) {
    try {
      const u = new URL((value || '').trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }

  function fileFromClipboardData(data) {
    if (!data) return null;
    for (const item of [...(data.items || [])]) {
      if (item.kind === 'file' && item.type?.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          return new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
        }
      }
    }
    for (const file of [...(data.files || [])]) {
      if (file.type?.startsWith('image/')) return file;
    }
    return null;
  }

  function urlFromClipboardData(data) {
    if (!data) return null;
    const html = data.getData?.('text/html') || '';
    if (html) {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const src = doc.querySelector('img')?.getAttribute('src') || '';
        if (src.startsWith('data:image/')) {
          const file = dataUrlToFile(src);
          if (file) return { file };
        }
        if (isHttpUrl(src)) return { url: src };
      } catch { /* ignore malformed clipboard html */ }
    }
    const uriList = (data.getData?.('text/uri-list') || '').split(/\r?\n/).find(v => v && !v.startsWith('#')) || '';
    if (isHttpUrl(uriList)) return { url: uriList.trim() };
    const text = (data.getData?.('text/plain') || '').trim();
    if (text.startsWith('data:image/')) {
      const file = dataUrlToFile(text);
      if (file) return { file };
    }
    if (isHttpUrl(text)) return { url: text };
    return null;
  }

  function payloadFromPasteEvent(event) {
    const file = fileFromClipboardData(event.clipboardData);
    if (file) return { file };
    return urlFromClipboardData(event.clipboardData);
  }

  async function readClipboardImage() {
    if (!navigator.clipboard?.read) throw new Error('Press Ctrl+V to paste the copied image.');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        return new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
      }
    }
    for (const item of items) {
      if (item.types.includes('text/plain')) {
        const text = await (await item.getType('text/plain')).text();
        if (isHttpUrl(text)) return { url: text.trim() };
      }
    }
    throw new Error('No image found in clipboard.');
  }

  function ensureDock() {
    let dock = $('#jobDock');
    if (dock) return dock;
    dock = document.createElement('div');
    dock.id = 'jobDock';
    dock.className = 'job-dock';
    dock.innerHTML = `
      <input id="globalFileInput" type="file" accept="image/*" multiple hidden>
      <button class="job-add" id="jobAddBtn" type="button" title="Add image">+</button>
      <div class="job-strip" id="jobStrip"></div>`;
    document.body.appendChild(dock);
    $('#jobAddBtn', dock).addEventListener('click', () => $('#globalFileInput', dock).click());
    $('#globalFileInput', dock).addEventListener('change', e => {
      const files = [...(e.target.files || [])].filter(f => f.type.startsWith('image/'));
      e.target.value = '';
      files.forEach(file => enqueueFile(file, { redirect: location.pathname !== '/result' }));
    });
    return dock;
  }

  function trimDock() {
    const strip = $('#jobStrip');
    if (!strip) return;
    while (strip.children.length > MAX_DOCK_ITEMS) {
      const first = strip.firstElementChild;
      const id = first?.dataset?.jobId;
      if (id) {
        const job = jobs.get(id);
        if (job?.previewUrl) URL.revokeObjectURL(job.previewUrl);
        jobs.delete(id);
      }
      first?.remove();
    }
  }

  function addJobCard(job) {
    ensureDock();
    const strip = $('#jobStrip');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'job-item queued';
    card.dataset.jobId = job.id;
    card.title = job.name || 'Queued image';
    const preview = job.file ? URL.createObjectURL(job.file) : job.url;
    job.previewUrl = job.file ? preview : null;
    card.innerHTML = `<img src="${preview}" alt="Queued image"><span class="job-state"><span class="mini-spinner"></span></span>`;
    card.addEventListener('click', () => {
      if (!job.record) return;
      setCurrentId(job.record.id);
      if (location.pathname === '/result') emit('removebg:select', { job, record: job.record });
      else location.assign('/result');
    });
    strip.appendChild(card);
    strip.scrollLeft = strip.scrollWidth;
    trimDock();
    return card;
  }

  function updateJobCard(job, status) {
    const card = document.querySelector(`[data-job-id="${CSS.escape(job.id)}"]`);
    if (!card) return;
    card.classList.remove('queued', 'processing', 'done', 'failed');
    card.classList.add(status);
    const state = $('.job-state', card);
    if (!state) return;
    if (status === 'processing') state.innerHTML = '<span class="mini-spinner"></span>';
    else if (status === 'done') state.innerHTML = '✓';
    else if (status === 'failed') state.innerHTML = '!';
    else state.innerHTML = '<span class="mini-spinner"></span>';
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function queueJob(job) {
    jobs.set(job.id, job);
    queue.push(job);
    addJobCard(job);
    emit('removebg:queued', { job });
    pumpQueue();
    return job.id;
  }

  function enqueueFile(file, options = {}) {
    if (!file || !file.type?.startsWith('image/')) {
      toast('Please choose an image file.');
      return null;
    }
    if (options.redirect) redirectWhenIdle = true;
    const job = {
      id: `job-${Date.now()}-${++sequence}`,
      sequence,
      type: 'file',
      file,
      name: file.name || `pasted-${Date.now()}.png`,
    };
    return queueJob(job);
  }

  function enqueueUrl(url, name = 'url-image.jpg', options = {}) {
    if (!isHttpUrl(url)) {
      toast('Please use a valid image URL.');
      return null;
    }
    if (options.redirect) redirectWhenIdle = true;
    const job = {
      id: `job-${Date.now()}-${++sequence}`,
      sequence,
      type: 'url',
      url,
      name,
    };
    return queueJob(job);
  }

  async function pumpQueue() {
    if (queueRunning) return;
    queueRunning = true;
    while (queue.length) {
      const job = queue.shift();
      updateJobCard(job, 'processing');
      emit('removebg:processing', { job });
      try {
        const record = job.type === 'file'
          ? await processFile(job.file)
          : await processUrl(job.url, job.name);
        job.record = record;
        redirectReady = true;
        updateJobCard(job, 'done');
        emit('removebg:done', { job, record });
      } catch (error) {
        job.error = error;
        updateJobCard(job, 'failed');
        emit('removebg:error', { job, error });
        toast(error.message || 'Background removal failed.');
      }
    }
    queueRunning = false;
    if (redirectWhenIdle && redirectReady && location.pathname !== '/result') {
      redirectWhenIdle = false;
      redirectReady = false;
      location.assign('/result');
    } else if (!queue.length && !queueRunning) {
      redirectWhenIdle = false;
      redirectReady = false;
    }
  }

  function handleGlobalPaste(event) {
    const activeTag = document.activeElement?.tagName;
    const payload = payloadFromPasteEvent(event);
    if (!payload?.file && ['INPUT', 'TEXTAREA'].includes(activeTag)) return;
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    if (payload.file) enqueueFile(payload.file, { redirect: location.pathname !== '/result' });
    else if (payload.url) enqueueUrl(payload.url, 'pasted-image.jpg', { redirect: location.pathname !== '/result' });
  }

  function installGlobalPaste() {
    ensureDock();
    document.addEventListener('paste', handleGlobalPaste, true);
  }

  function openFilePicker() {
    ensureDock();
    $('#globalFileInput')?.click();
  }

  function markDisplayed(sequenceNumber) {
    lastDisplayedSequence = Math.max(lastDisplayedSequence, sequenceNumber || 0);
  }

  function shouldDisplay(sequenceNumber) {
    return (sequenceNumber || 0) >= lastDisplayedSequence;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installGlobalPaste, { once: true });
  } else {
    installGlobalPaste();
  }

  return {
    $, $$, toast, get, getAll, removeRecord, clearHistory,
    saveResult, setCurrentId, getCurrentId, clearCurrentId,
    processFile, processUrl, copyPng, downloadPng, readClipboardImage,
    payloadFromPasteEvent, enqueueFile, enqueueUrl, openFilePicker,
    markDisplayed, shouldDisplay,
  };
})();
window.RemoveBGCore = Core;
