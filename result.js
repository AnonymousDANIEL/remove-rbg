window.addEventListener('DOMContentLoaded', async () => {
  const C = window.RemoveBGCore;
  const $ = C.$;
  const $$ = C.$$;
  const resultShell = $('#resultShell');
  const emptyResult = $('#emptyResult');
  const editorCard = $('#editorCard');
  const resultStage = $('#resultStage');
  const removedImage = $('#removedImage');
  const originalImage = $('#originalImage');
  const compareOriginal = $('#compareOriginal');
  const compareRemoved = $('#compareRemoved');
  const compareAfter = $('#compareAfter');
  const compareLine = $('#compareLine');
  const compareRange = $('#compareRange');
  const resultMeta = $('#resultMeta');
  const historyRail = $('#historyRail');
  const historyEmpty = $('#historyEmpty');
  const clearHistoryBtn = $('#clearHistoryBtn');
  const downloadBtn = $('#downloadBtn');
  const copyBtn = $('#copyBtn');
  const deleteCurrentBtn = $('#deleteCurrentBtn');
  const newImageBtn = $('#newImageBtn');
  const newImageInput = $('#newImageInput');

  let current = null;
  let objectUrls = [];
  let historyUrls = [];

  function revoke(list) {
    while (list.length) URL.revokeObjectURL(list.pop());
  }
  function blobUrl(blob, bucket) {
    const url = URL.createObjectURL(blob);
    bucket.push(url);
    return url;
  }

  function setMode(mode) {
    resultStage.classList.remove('mode-removed', 'mode-original', 'mode-compare');
    resultStage.classList.add(`mode-${mode}`);
    $$('.mode-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  }

  function updateCompare(value) {
    compareAfter.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    compareLine.style.left = `${value}%`;
  }

  function applyLayout(width, height) {
    if (!width || !height) return;
    const ratio = width / height;
    const maxH = Math.min(window.innerHeight * 0.66, 680);
    let widthPx = maxH * ratio;
    if (ratio < 0.85) widthPx = Math.min(widthPx, 500);
    else if (ratio <= 1.15) widthPx = Math.min(widthPx, 650);
    else widthPx = Math.min(widthPx, 920);
    widthPx = Math.max(300, widthPx);
    editorCard.style.setProperty('--editor-width', `${Math.round(widthPx)}px`);
    resultStage.style.setProperty('--image-ratio', `${width} / ${height}`);
  }

  function showRecord(record) {
    revoke(objectUrls);
    current = record;
    C.setCurrentId(record.id);
    const resultUrl = blobUrl(record.resultBlob, objectUrls);
    const originalUrl = record.originalBlob ? blobUrl(record.originalBlob, objectUrls) : record.originalUrl;

    removedImage.src = resultUrl;
    compareRemoved.src = resultUrl;
    originalImage.src = originalUrl || resultUrl;
    compareOriginal.src = originalUrl || resultUrl;
    resultMeta.textContent = record.name || 'image.png';
    setMode('removed');
    updateCompare(50);
    compareRange.value = 50;

    const measure = new Image();
    measure.onload = () => applyLayout(measure.naturalWidth, measure.naturalHeight);
    measure.src = originalUrl || resultUrl;

    resultShell.classList.remove('hidden');
    emptyResult.classList.add('hidden');
  }

  async function renderHistory() {
    revoke(historyUrls);
    const records = await C.getAll();
    historyRail.innerHTML = '';
    historyEmpty.classList.toggle('hidden', records.length > 0);
    clearHistoryBtn.classList.toggle('hidden', records.length === 0);

    for (const record of records) {
      const resultUrl = blobUrl(record.resultBlob, historyUrls);
      const card = document.createElement('article');
      card.className = `history-item${current?.id === record.id ? ' active' : ''}`;
      card.innerHTML = `
        <button class="history-open" type="button" title="Open"><img src="${resultUrl}" alt="Previous result"></button>
        <div class="history-tools">
          <button type="button" data-copy title="Copy image">⧉</button>
          <button type="button" data-delete title="Delete">×</button>
        </div>`;
      $('.history-open', card).addEventListener('click', () => {
        showRecord(record);
        renderHistory();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      $('[data-copy]', card).addEventListener('click', async e => {
        e.stopPropagation();
        try { await C.copyPng(record.resultBlob); C.toast('Image copied.'); }
        catch (err) { C.toast(err.message || 'Could not copy image.'); }
      });
      $('[data-delete]', card).addEventListener('click', async e => {
        e.stopPropagation();
        await C.removeRecord(record.id);
        if (current?.id === record.id) {
          current = null;
          C.clearCurrentId();
          resultShell.classList.add('hidden');
          emptyResult.classList.remove('hidden');
        }
        await renderHistory();
      });
      historyRail.appendChild(card);
    }
  }

  newImageBtn.addEventListener('click', () => newImageInput.click());
  newImageInput.addEventListener('change', async () => {
    const file = newImageInput.files?.[0];
    newImageInput.value = '';
    if (!file) return;
    try {
      C.setProcessing(true, 'Removing background…');
      await C.processFileAndOpen(file);
    } catch (err) {
      C.setProcessing(false);
      C.toast(err.message || 'Background removal failed.');
    }
  });

  $$('.mode-tab').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  compareRange.addEventListener('input', () => updateCompare(Number(compareRange.value)));

  downloadBtn.addEventListener('click', () => {
    if (!current) return;
    C.downloadPng(current.resultBlob, current.name || 'removed-background.png');
  });
  copyBtn.addEventListener('click', async () => {
    if (!current) return;
    try { await C.copyPng(current.resultBlob); C.toast('Image copied.'); }
    catch (err) { C.toast(err.message || 'Could not copy image.'); }
  });

  deleteCurrentBtn.addEventListener('click', async () => {
    if (!current) return;
    await C.removeRecord(current.id);
    C.clearCurrentId();
    location.assign('/');
  });

  clearHistoryBtn.addEventListener('click', async () => {
    await C.clearHistory();
    current = null;
    C.clearCurrentId();
    resultShell.classList.add('hidden');
    emptyResult.classList.remove('hidden');
    await renderHistory();
    C.toast('History cleared.');
  });

  const currentId = C.getCurrentId();
  if (currentId) current = await C.get(currentId);
  if (!current) {
    const records = await C.getAll();
    current = records[0] || null;
    if (current) C.setCurrentId(current.id);
  }
  if (current) showRecord(current);
  else {
    resultShell.classList.add('hidden');
    emptyResult.classList.remove('hidden');
  }
  await renderHistory();

  window.addEventListener('beforeunload', () => { revoke(objectUrls); revoke(historyUrls); });
});
