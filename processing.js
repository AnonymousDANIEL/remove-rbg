import { $, initCommon, dbGet, dbDelete, saveResult, toast } from './common.js';
import { processImage } from './engine.js';

function progressText(key, current, total) {
  const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  if (key.startsWith('fetch:') || key.includes('download')) return [`Preparing AI model…`, pct];
  if (key.startsWith('compute:decode')) return ['Reading image…', 15];
  if (key.startsWith('compute:inference')) return ['Removing background…', 55];
  if (key.startsWith('compute:mask')) return ['Refining edges…', 78];
  if (key.startsWith('compute:encode')) return ['Creating transparent PNG…', 92 + Math.round(pct * .08)];
  if (key.startsWith('smart:')) return ['Checking background…', 10 + Math.round(pct * .1)];
  if (key.startsWith('graphic:')) return ['Removing solid background…', 35 + Math.round(pct * .6)];
  return ['Processing image…', pct];
}

window.addEventListener('DOMContentLoaded', async () => {
  initCommon();
  const id = new URLSearchParams(location.search).get('id');
  const title = $('#processingTitle');
  const detail = $('#processingDetail');
  const bar = $('#progressBar');
  const pctEl = $('#progressPct');
  const nameEl = $('#processingName');
  const modeEl = $('#processingMode');
  const qualityEl = $('#processingQuality');

  if (!id) { title.textContent = 'No image found'; return; }
  const pending = await dbGet(id);
  if (!pending) { title.textContent = 'Image expired'; detail.textContent = 'Paste or upload the image again.'; return; }

  nameEl.textContent = pending.name || 'image.png';
  modeEl.textContent = pending.requestedMode === 'graphic' ? 'Graphic' : pending.requestedMode === 'portrait' ? 'Portrait' : 'Smart';
  qualityEl.textContent = pending.requestedQuality === 'fast' ? 'Fast' : 'HD';

  const update = (key, current, total) => {
    const [text, pct] = progressText(key, current, total);
    detail.textContent = text;
    const safe = Math.max(2, Math.min(99, pct || 2));
    bar.style.width = `${safe}%`;
    pctEl.textContent = `${safe}%`;
  };

  try {
    const started = performance.now();
    const result = await processImage(pending.originalBlob, {
      mode: pending.requestedMode,
      quality: pending.requestedQuality,
      progress: update,
    });
    bar.style.width = '100%'; pctEl.textContent = '100%'; detail.textContent = 'Done';
    const record = await saveResult(pending, result.blob, {
      engine: result.engine,
      elapsedMs: Math.round(performance.now() - started),
      analysis: result.analysis,
    });
    setTimeout(() => location.replace(`/result?id=${encodeURIComponent(record.id)}`), 120);
  } catch (err) {
    console.error(err);
    title.textContent = 'Could not remove background';
    detail.textContent = err?.message || 'Please try another image.';
    document.body.classList.add('processing-error');
    toast(detail.textContent);
  }
});
