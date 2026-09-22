const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const fileInput = $('#fileInput');
const uploadBtn = $('#uploadBtn');
const dropZone = $('#dropZone');
const pasteBtn = $('#pasteBtn');
const urlBtn = $('#urlBtn');
const urlModal = $('#urlModal');
const urlInput = $('#urlInput');
const processUrlBtn = $('#processUrlBtn');
const workSection = $('#workSection');
const resultStage = $('#resultStage');
const processingOverlay = $('#processingOverlay');
const removedImage = $('#removedImage');
const originalImage = $('#originalImage');
const compareOriginal = $('#compareOriginal');
const compareRemoved = $('#compareRemoved');
const compareAfter = $('#compareAfter');
const compareLine = $('#compareLine');
const compareRange = $('#compareRange');
const resultMeta = $('#resultMeta');
const downloadBtn = $('#downloadBtn');
const copyBtn = $('#copyBtn');
const deleteCurrentBtn = $('#deleteCurrentBtn');
const replaceBtn = $('#replaceBtn');
const newImageBtn = $('#newImageBtn');
const historyRail = $('#historyRail');
const historyEmpty = $('#historyEmpty');
const clearHistoryBtn = $('#clearHistoryBtn');
const quickSamples = $('#quickSamples');
const sampleGrid = $('#sampleGrid');
const toast = $('#toast');

const SAMPLE_IMAGES = [
  { id: 'portrait-man', category: 'people', ratio: '4 / 5', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=86' },
  { id: 'golden-dog', category: 'animals', ratio: '4 / 5', url: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1000&q=86' },
  { id: 'sports-car', category: 'cars', ratio: '16 / 10', url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=86' },
  { id: 'watch', category: 'products', ratio: '1 / 1', url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=86' },
  { id: 'portrait-woman', category: 'people', ratio: '4 / 5', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=86' },
  { id: 'cat', category: 'animals', ratio: '4 / 5', url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1000&q=86' },
  { id: 'shoe', category: 'products', ratio: '4 / 3', url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=86' },
  { id: 'portrait-two', category: 'people', ratio: '4 / 5', url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=86' },
  { id: 'headphones', category: 'products', ratio: '1 / 1', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=86' },
  { id: 'camera', category: 'products', ratio: '4 / 3', url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=86' },
  { id: 'backpack', category: 'products', ratio: '4 / 5', url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&q=86' },
  { id: 'portrait-three', category: 'people', ratio: '4 / 5', url: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=1000&q=86' }
];

let current = null;
let mainObjectUrls = [];
let historyObjectUrls = [];
let sampleObjectUrls = [];
let toastTimer = null;
let dbPromise = null;
let activeFilter = 'all';
const urlRemovalPromises = new Map();
const sampleQueue = [];
let sampleWorkerRunning = false;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function parseApiError(response) {
  try {
    const data = await response.json();
    return data.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function revokeAll(list) {
  while (list.length) URL.revokeObjectURL(list.pop());
}

function blobUrl(blob, bucket) {
  const url = URL.createObjectURL(blob);
  bucket.push(url);
  return url;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('remove-bg-local', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('history')) {
        const history = db.createObjectStore('history', { keyPath: 'id' });
        history.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('sampleCache')) {
        db.createObjectStore('sampleCache', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function dbPut(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getHistory() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readonly');
    const req = tx.objectStore('history').getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function trimHistory(maxItems = 24) {
  const items = await getHistory();
  for (const item of items.slice(maxItems)) await dbDelete('history', item.id);
}

async function addHistory(record) {
  const saved = {
    ...record,
    id: `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
    createdAt: Date.now()
  };
  await dbPut('history', saved);
  await trimHistory();
  await renderHistory();
  return saved;
}

async function renderHistory() {
  revokeAll(historyObjectUrls);
  const records = await getHistory();
  historyRail.innerHTML = '';
  historyEmpty.classList.toggle('hidden', records.length > 0);
  clearHistoryBtn.classList.toggle('hidden', records.length === 0);

  for (const record of records) {
    const card = document.createElement('div');
    card.className = 'history-item';
    const resultUrl = blobUrl(record.resultBlob, historyObjectUrls);
    card.innerHTML = `
      <button class="history-open" type="button" title="Open result"><img src="${resultUrl}" alt="Previous removed background result"></button>
      <div class="history-tools">
        <button type="button" data-copy title="Copy">⧉</button>
        <button type="button" data-delete title="Delete">×</button>
      </div>`;
    $('.history-open', card).addEventListener('click', () => openHistoryRecord(record));
    $('[data-copy]', card).addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyBlob(record.resultBlob);
    });
    $('[data-delete]', card).addEventListener('click', async (e) => {
      e.stopPropagation();
      await dbDelete('history', record.id);
      if (current?.historyId === record.id) current.historyId = null;
      await renderHistory();
    });
    historyRail.appendChild(card);
  }
}

function originalSource(record, bucket = mainObjectUrls) {
  if (record.originalBlob) return blobUrl(record.originalBlob, bucket);
  return record.originalUrl || '';
}

function setMainImages(record) {
  revokeAll(mainObjectUrls);
  const resultUrl = blobUrl(record.resultBlob, mainObjectUrls);
  const origUrl = originalSource(record, mainObjectUrls);
  removedImage.src = resultUrl;
  compareRemoved.src = resultUrl;
  originalImage.src = origUrl;
  compareOriginal.src = origUrl;
  resultMeta.textContent = record.name || 'removed-background.png';
}

function openHistoryRecord(record) {
  current = { ...record, historyId: record.id };
  setMainImages(current);
  workSection.classList.remove('hidden');
  setViewMode('removed');
  workSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setViewMode(mode) {
  resultStage.classList.remove('mode-removed', 'mode-original', 'mode-compare');
  resultStage.classList.add(`mode-${mode}`);
  $$('.mode-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
}

function setBusy(busy) {
  processingOverlay.classList.toggle('hidden', !busy);
  uploadBtn.disabled = busy;
  pasteBtn.disabled = busy;
  processUrlBtn.disabled = busy;
}

function updateCompare(value) {
  const pct = `${value}%`;
  compareAfter.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  compareLine.style.left = pct;
}

async function removeFileToBlob(file) {
  const form = new FormData();
  form.append('image', file, file.name || 'pasted-image.png');
  const response = await fetch('/api/remove', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await parseApiError(response));
  return await response.blob();
}

async function removeUrlToBlob(url) {
  if (urlRemovalPromises.has(url)) return urlRemovalPromises.get(url);
  const promise = (async () => {
    const response = await fetch('/api/remove-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    return await response.blob();
  })().finally(() => urlRemovalPromises.delete(url));
  urlRemovalPromises.set(url, promise);
  return promise;
}

async function finishMain(record, saveHistory = true) {
  current = { ...record };
  setMainImages(current);
  workSection.classList.remove('hidden');
  setViewMode('removed');
  if (saveHistory) {
    const saved = await addHistory(record);
    current.historyId = saved.id;
  }
  requestAnimationFrame(() => workSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function processFile(file) {
  if (!file || !file.type?.startsWith('image/')) {
    showToast('Please choose an image file.');
    return;
  }
  try {
    workSection.classList.remove('hidden');
    setBusy(true);
    requestAnimationFrame(() => workSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const resultBlob = await removeFileToBlob(file);
    await finishMain({ originalBlob: file, resultBlob, name: file.name || 'pasted-image.png' });
    showToast('Background removed.');
  } catch (err) {
    showToast(err.message || 'Background removal failed.');
  } finally {
    setBusy(false);
  }
}

async function processRemoteUrl(url, name = 'url-image') {
  try {
    workSection.classList.remove('hidden');
    setBusy(true);
    closeUrlModal();
    requestAnimationFrame(() => workSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const resultBlob = await removeUrlToBlob(url);
    await finishMain({ originalUrl: url, resultBlob, name });
    showToast('Background removed.');
  } catch (err) {
    showToast(err.message || 'Could not process that URL.');
  } finally {
    setBusy(false);
  }
}

async function copyBlob(blob) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard image copy is not supported in this browser.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Image copied.');
  } catch (err) {
    showToast(err.message || 'Could not copy image.');
  }
}

function downloadBlob(blob, filename = 'removed-background.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\.[^.]+$/, '') + '-no-bg.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function openUrlModal() {
  urlModal.classList.remove('hidden');
  setTimeout(() => urlInput.focus(), 50);
}
function closeUrlModal() { urlModal.classList.add('hidden'); }

async function readClipboardImage() {
  try {
    if (!navigator.clipboard?.read) throw new Error('Press Ctrl+V to paste an image in this browser.');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        return new File([blob], 'pasted-image.png', { type: blob.type || 'image/png' });
      }
    }
    throw new Error('No image found in clipboard.');
  } catch (err) {
    showToast(err.message || 'Press Ctrl+V to paste an image.');
    return null;
  }
}

function renderQuickSamples() {
  quickSamples.innerHTML = '';
  SAMPLE_IMAGES.slice(0, 6).forEach(sample => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-sample';
    btn.title = `Try ${sample.category} sample`;
    btn.innerHTML = `<img src="${sample.url}" alt="${sample.category} sample" loading="lazy">`;
    btn.addEventListener('click', () => processSampleAsMain(sample));
    quickSamples.appendChild(btn);
  });
}

async function getSampleResult(sample) {
  const cached = await dbGet('sampleCache', sample.id);
  if (cached?.resultBlob) return cached.resultBlob;
  const resultBlob = await removeUrlToBlob(sample.url);
  await dbPut('sampleCache', { id: sample.id, resultBlob, updatedAt: Date.now() });
  return resultBlob;
}

async function processSampleAsMain(sample) {
  try {
    workSection.classList.remove('hidden');
    setBusy(true);
    requestAnimationFrame(() => workSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const resultBlob = await getSampleResult(sample);
    await finishMain({ originalUrl: sample.url, resultBlob, name: `${sample.id}.jpg` });
    showToast('Sample processed.');
  } catch (err) {
    showToast(err.message || 'Sample could not be processed.');
  } finally {
    setBusy(false);
  }
}

function queueSample(sample, card) {
  if (card.dataset.queued === '1' || card.classList.contains('ready')) return;
  card.dataset.queued = '1';
  sampleQueue.push({ sample, card });
  runSampleWorker();
}

async function runSampleWorker() {
  if (sampleWorkerRunning) return;
  sampleWorkerRunning = true;
  while (sampleQueue.length) {
    const { sample, card } = sampleQueue.shift();
    if (!document.body.contains(card)) continue;
    try {
      const resultBlob = await getSampleResult(sample);
      const url = blobUrl(resultBlob, sampleObjectUrls);
      const img = $('.sample-after-img', card);
      img.src = url;
      card.classList.add('ready');
      card.classList.remove('failed');
      $('.sample-loading', card).textContent = 'Before / After';
    } catch {
      card.classList.add('failed');
      card.dataset.queued = '0';
      $('.sample-loading', card).textContent = 'Click to retry';
    }
  }
  sampleWorkerRunning = false;
}

function buildSampleCard(sample) {
  const card = document.createElement('article');
  card.className = 'sample-card';
  card.dataset.category = sample.category;
  card.innerHTML = `
    <div class="sample-frame" style="aspect-ratio:${sample.ratio}">
      <img class="sample-before" src="${sample.url}" alt="${sample.category} sample before" loading="lazy">
      <div class="sample-after-layer checkerboard"><img class="sample-after-img" alt="${sample.category} sample after"></div>
      <div class="sample-divider"><span>↔</span></div>
      <input class="sample-range" type="range" min="0" max="100" value="50" aria-label="Compare sample before and after">
      <div class="sample-loading">Preparing sample</div>
    </div>
    <div class="sample-card-footer">
      <span class="sample-label">${sample.category}</span>
      <button class="use-sample-btn" type="button">Use sample</button>
    </div>`;

  const frame = $('.sample-frame', card);
  const range = $('.sample-range', card);
  range.addEventListener('input', () => frame.style.setProperty('--split', `${range.value}%`));
  $('.use-sample-btn', card).addEventListener('click', () => processSampleAsMain(sample));
  $('.sample-loading', card).addEventListener('click', () => queueSample(sample, card));
  return card;
}

let sampleObserver = null;
function renderSampleGrid() {
  revokeAll(sampleObjectUrls);
  if (sampleObserver) sampleObserver.disconnect();
  sampleGrid.innerHTML = '';
  const visible = SAMPLE_IMAGES.filter(s => activeFilter === 'all' || s.category === activeFilter);
  const cards = visible.map(sample => {
    const card = buildSampleCard(sample);
    sampleGrid.appendChild(card);
    return { sample, card };
  });

  sampleObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const item = cards.find(x => x.card === entry.target);
      if (item) queueSample(item.sample, item.card);
      sampleObserver.unobserve(entry.target);
    });
  }, { rootMargin: '250px 0px' });

  cards.forEach(({ card }) => sampleObserver.observe(card));
}

uploadBtn.addEventListener('click', () => fileInput.click());
replaceBtn.addEventListener('click', () => fileInput.click());
newImageBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) processFile(fileInput.files[0]);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, e => {
  e.preventDefault();
  dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
}));
dropZone.addEventListener('drop', e => {
  const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
  if (file) processFile(file); else showToast('Drop an image file here.');
});

pasteBtn.addEventListener('click', async () => {
  const file = await readClipboardImage();
  if (file) processFile(file);
});

document.addEventListener('paste', e => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (file) {
    e.preventDefault();
    processFile(file);
  }
});

urlBtn.addEventListener('click', openUrlModal);
$$('[data-close-modal]').forEach(el => el.addEventListener('click', closeUrlModal));
processUrlBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) return showToast('Paste an image URL first.');
  processRemoteUrl(url, 'url-image');
});
urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') processUrlBtn.click();
  if (e.key === 'Escape') closeUrlModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUrlModal(); });

$$('.mode-tab').forEach(btn => btn.addEventListener('click', () => setViewMode(btn.dataset.mode)));
compareRange.addEventListener('input', () => updateCompare(Number(compareRange.value)));
updateCompare(50);

downloadBtn.addEventListener('click', () => {
  if (!current?.resultBlob) return;
  downloadBlob(current.resultBlob, current.name || 'removed-background.png');
});
copyBtn.addEventListener('click', () => current?.resultBlob && copyBlob(current.resultBlob));

deleteCurrentBtn.addEventListener('click', async () => {
  if (current?.historyId) await dbDelete('history', current.historyId);
  current = null;
  revokeAll(mainObjectUrls);
  workSection.classList.add('hidden');
  await renderHistory();
  $('#uploaderSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

clearHistoryBtn.addEventListener('click', async () => {
  await dbClear('history');
  if (current) current.historyId = null;
  await renderHistory();
  showToast('History cleared.');
});

$$('.sample-filter').forEach(btn => btn.addEventListener('click', () => {
  activeFilter = btn.dataset.filter;
  $$('.sample-filter').forEach(x => x.classList.toggle('active', x === btn));
  renderSampleGrid();
}));

window.addEventListener('beforeunload', () => {
  revokeAll(mainObjectUrls);
  revokeAll(historyObjectUrls);
  revokeAll(sampleObjectUrls);
});

(async function init() {
  renderQuickSamples();
  renderSampleGrid();
  try { await renderHistory(); } catch { showToast('Local history is unavailable in this browser.'); }
})();
