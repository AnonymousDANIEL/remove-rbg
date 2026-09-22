window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const jobId = params.get('id');

  const removedImage = Core.$('#removedImage');
  const originalImage = Core.$('#originalImage');
  const compareOriginal = Core.$('#compareOriginal');
  const compareRemoved = Core.$('#compareRemoved');
  const stage = Core.$('#resultStage');
  const card = Core.$('#editorCard');
  const resultName = Core.$('#resultName');
  const historyRail = Core.$('#historyRail');
  const historyEmpty = Core.$('#historyEmpty');
  const newFileInput = Core.$('#newFileInput');

  let current = null;
  let objectUrls = [];

  function clearObjectUrls() {
    objectUrls.forEach(u => URL.revokeObjectURL(u));
    objectUrls = [];
  }

  function setBlobImages(record) {
    clearObjectUrls();
    const resultUrl = URL.createObjectURL(record.resultBlob);
    const originalUrl = URL.createObjectURL(record.originalBlob);
    objectUrls.push(resultUrl, originalUrl);

    removedImage.src = resultUrl;
    compareRemoved.src = resultUrl;
    originalImage.src = originalUrl;
    compareOriginal.src = originalUrl;
    resultName.textContent = record.name || 'image.png';

    const probe = new Image();
    probe.onload = () => {
      const ratio = probe.naturalWidth / Math.max(1, probe.naturalHeight);
      stage.style.setProperty('--image-ratio', `${probe.naturalWidth} / ${probe.naturalHeight}`);
      let width = 600;
      if (ratio > 1.65) width = 820;
      else if (ratio < .8) width = 460;
      else if (ratio < 1.05) width = 520;
      card.style.setProperty('--editor-width', `${width}px`);
    };
    probe.src = originalUrl;
  }

  async function loadServerJob(id) {
    const statusRes = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache:'no-store' });
    if (!statusRes.ok) throw new Error(await Core.responseError(statusRes));
    const job = await statusRes.json();

    if (job.status !== 'done') {
      location.replace(`/processing?id=${encodeURIComponent(id)}&name=${encodeURIComponent(job.name || 'image.png')}&mode=${encodeURIComponent(job.mode || 'fast')}`);
      return null;
    }

    const [resultRes, originalRes] = await Promise.all([
      fetch(`/api/jobs/${encodeURIComponent(id)}/result`, { cache:'no-store' }),
      fetch(`/api/jobs/${encodeURIComponent(id)}/original`, { cache:'no-store' }),
    ]);
    if (!resultRes.ok) throw new Error(await Core.responseError(resultRes));
    if (!originalRes.ok) throw new Error(await Core.responseError(originalRes));

    const resultBlob = await resultRes.blob();
    const rawOriginal = await originalRes.blob();
    const originalBlob = new Blob([rawOriginal], { type: guessMime(job.name) });

    const existing = (await Core.getAll()).find(r => r.jobId === id);
    if (existing) {
      Core.setCurrentRecord(existing.id);
      return existing;
    }

    return Core.saveHistory({
      jobId: id,
      name: job.name || 'image.png',
      mode: job.mode || 'fast',
      originalBlob,
      resultBlob,
    });
  }

  function guessMime(name='') {
    const n = name.toLowerCase();
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.gif')) return 'image/gif';
    if (n.endsWith('.bmp')) return 'image/bmp';
    return 'image/png';
  }

  async function renderCurrent(record) {
    if (!record) return;
    current = record;
    Core.setCurrentRecord(record.id);
    setBlobImages(record);
    await renderHistory();
  }

  async function renderHistory() {
    const all = await Core.getAll();
    historyRail.innerHTML = '';
    historyEmpty.classList.toggle('hidden', all.length > 0);
    historyRail.classList.toggle('hidden', all.length === 0);

    for (const record of all) {
      const wrap = document.createElement('div');
      wrap.className = 'history-item' + (record.id === current?.id ? ' active' : '');

      const open = document.createElement('button');
      open.className = 'history-open';
      open.type = 'button';
      const url = URL.createObjectURL(record.resultBlob);
      const img = new Image();
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      open.appendChild(img);
      open.addEventListener('click', () => renderCurrent(record));

      const tools = document.createElement('div');
      tools.className = 'history-tools';
      const copy = document.createElement('button');
      copy.type = 'button'; copy.title = 'Copy'; copy.textContent = '⧉';
      copy.addEventListener('click', async e => {
        e.stopPropagation();
        try { await Core.copyPng(record.resultBlob); Core.toast('Copied'); }
        catch (err) { Core.toast(err.message); }
      });
      const del = document.createElement('button');
      del.type = 'button'; del.title = 'Delete'; del.textContent = '×';
      del.addEventListener('click', async e => {
        e.stopPropagation();
        await Core.del(record.id);
        if (record.id === current?.id) {
          const left = await Core.getAll();
          if (left[0]) await renderCurrent(left[0]); else location.assign('/');
        } else await renderHistory();
      });
      tools.append(copy, del);
      wrap.append(open, tools);
      historyRail.appendChild(wrap);
    }
  }

  Core.$$('.mode-tab').forEach(btn => btn.addEventListener('click', () => {
    Core.$$('.mode-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    stage.className = `result-stage mode-${btn.dataset.mode}`;
  }));

  const range = Core.$('#compareRange');
  range.addEventListener('input', () => {
    const v = Number(range.value);
    Core.$('#compareAfter').style.clipPath = `inset(0 ${100-v}% 0 0)`;
    Core.$('#compareLine').style.left = `${v}%`;
  });

  Core.$('#downloadBtn').addEventListener('click', () => {
    if (current) Core.downloadPng(current.resultBlob, current.name);
  });

  Core.$('#copyBtn').addEventListener('click', async () => {
    if (!current) return;
    try { await Core.copyPng(current.resultBlob); Core.toast('Image copied'); }
    catch (err) { Core.toast(err.message); }
  });

  Core.$('#newImageBtn').addEventListener('click', () => newFileInput.click());
  newFileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { await Core.submitFile(file); } catch (err) { Core.toast(err.message); }
  });

  Core.$('#deleteBtn').addEventListener('click', async () => {
    if (current) await Core.del(current.id);
    const left = await Core.getAll();
    if (left[0]) await renderCurrent(left[0]); else location.assign('/');
  });

  Core.$('#clearAllBtn').addEventListener('click', async () => {
    await Core.clear();
    location.assign('/');
  });

  try {
    let record = null;
    if (jobId) {
      try { record = await loadServerJob(jobId); }
      catch (e) { Core.toast(e.message); }
    }
    if (!record) record = await Core.get(Core.currentRecordId());
    if (!record) record = (await Core.getAll())[0] || null;
    if (!record) return location.assign('/');
    await renderCurrent(record);
  } catch (err) {
    Core.toast(err.message || 'Could not load result.');
  }

  window.addEventListener('beforeunload', clearObjectUrls);
});
