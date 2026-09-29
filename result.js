import { $, $$, toast, initCommon, dbGet, dbAll, dbDelete, clearHistory, copyPng, downloadPng, submitBlob } from './common.js';

window.addEventListener('DOMContentLoaded', async () => {
  initCommon();
  const id = new URLSearchParams(location.search).get('id') || localStorage.getItem('bg-current-id');
  let current = await dbGet(id);
  if (!current || current.kind !== 'result') {
    current = (await dbAll()).find(x => x.kind === 'result');
  }
  if (!current) return location.assign('/');

  let urls = [];
  const makeUrl = blob => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const clearUrls = () => { urls.forEach(URL.revokeObjectURL); urls = []; };

  const stage = $('#resultStage');
  const editor = $('#editorCard');
  const removed = $('#removedImage');
  const original = $('#originalImage');
  const compareRemoved = $('#compareRemoved');
  const compareOriginal = $('#compareOriginal');
  const name = $('#resultName');
  const stats = $('#resultStats');
  const rail = $('#historyRail');
  const empty = $('#historyEmpty');
  const fileInput = $('#newFileInput');

  async function show(record) {
    current = record;
    localStorage.setItem('bg-current-id', record.id);
    clearUrls();
    const a = makeUrl(record.resultBlob);
    const b = makeUrl(record.originalBlob);
    removed.src = a; compareRemoved.src = a; original.src = b; compareOriginal.src = b;
    name.textContent = record.name || 'image.png';
    const seconds = record.elapsedMs ? (record.elapsedMs / 1000).toFixed(1) : null;
    stats.innerHTML = [
      record.engine,
      record.requestedMode ? `Mode: ${record.requestedMode}` : null,
      record.requestedQuality ? `Quality: ${record.requestedQuality.toUpperCase()}` : null,
      seconds ? `${seconds}s` : null,
      navigator.gpu ? 'WebGPU available' : 'CPU/WASM',
    ].filter(Boolean).map(x => `<span>${x}</span>`).join('');

    const probe = new Image();
    probe.onload = () => {
      const w = probe.naturalWidth || 1, h = probe.naturalHeight || 1, ratio = w / h;
      stage.style.setProperty('--image-ratio', `${w} / ${h}`);
      let width = 620;
      if (ratio > 1.7) width = 900;
      else if (ratio > 1.25) width = 780;
      else if (ratio < .75) width = 470;
      else if (ratio < 1.05) width = 540;
      editor.style.setProperty('--editor-width', `${width}px`);
    };
    probe.src = b;
    await renderHistory();
  }

  async function renderHistory() {
    const records = (await dbAll()).filter(x => x.kind === 'result');
    rail.innerHTML = '';
    empty.classList.toggle('hidden', records.length > 0);
    rail.classList.toggle('hidden', records.length === 0);
    for (const record of records) {
      const box = document.createElement('div');
      box.className = 'history-item' + (record.id === current.id ? ' active' : '');
      const open = document.createElement('button'); open.className = 'history-open'; open.type = 'button';
      const u = URL.createObjectURL(record.resultBlob);
      const img = new Image(); img.src = u; img.onload = () => URL.revokeObjectURL(u); open.appendChild(img);
      open.addEventListener('click', () => show(record));
      const tools = document.createElement('div'); tools.className = 'history-tools';
      const cp = document.createElement('button'); cp.type='button'; cp.title='Copy'; cp.textContent='⧉';
      cp.addEventListener('click', async e => { e.stopPropagation(); try { await copyPng(record.resultBlob); toast('Copied'); } catch(err) { toast(err.message); } });
      const del = document.createElement('button'); del.type='button'; del.title='Delete'; del.textContent='×';
      del.addEventListener('click', async e => { e.stopPropagation(); await dbDelete(record.id); if (record.id === current.id) { const left=(await dbAll()).filter(x=>x.kind==='result'); if(left[0]) show(left[0]); else location.assign('/'); } else renderHistory(); });
      tools.append(cp,del); box.append(open,tools); rail.appendChild(box);
    }
  }

  $$('.mode-tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.mode-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); stage.className = `result-stage mode-${btn.dataset.mode}`;
  }));
  $('#compareRange').addEventListener('input', e => {
    const v = Number(e.target.value); $('#compareAfter').style.clipPath = `inset(0 ${100-v}% 0 0)`; $('#compareLine').style.left = `${v}%`;
  });
  $('#downloadBtn').addEventListener('click', () => downloadPng(current.resultBlob, current.name));
  $('#copyBtn').addEventListener('click', async () => { try { await copyPng(current.resultBlob); toast('Image copied'); } catch(err) { toast(err.message); } });
  $('#newImageBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async e => { const f=e.target.files?.[0]; e.target.value=''; if(f) await submitBlob(f,f.name); });
  $('#deleteBtn').addEventListener('click', async () => { await dbDelete(current.id); const left=(await dbAll()).filter(x=>x.kind==='result'); if(left[0]) show(left[0]); else location.assign('/'); });
  $('#clearAllBtn').addEventListener('click', async () => { await clearHistory(); location.assign('/'); });

  await show(current);
  window.addEventListener('beforeunload', clearUrls);
});
