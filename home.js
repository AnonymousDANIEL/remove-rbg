import { $, $$, toast, initCommon, submitBlob, fetchRemoteImage, readClipboardImage, settings } from './common.js';
import { preloadEngine } from './engine.js';

window.addEventListener('DOMContentLoaded', () => {
  initCommon();
  const input = $('#fileInput');
  const upload = $('#uploadBtn');
  const drop = $('#dropZone');
  const paste = $('#pasteBtn');
  const urlBtn = $('#urlBtn');
  const modal = $('#urlModal');
  const urlInput = $('#urlInput');
  const urlGo = $('#urlGo');

  upload.addEventListener('click', () => input.click());
  input.addEventListener('change', async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { await submitBlob(file, file.name); } catch (err) { toast(err.message); }
  });

  ['dragenter','dragover'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave','drop'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', async e => {
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
    if (!file) return toast('Drop an image file.');
    try { await submitBlob(file, file.name); } catch (err) { toast(err.message); }
  });

  paste.addEventListener('click', async () => {
    try {
      const item = await readClipboardImage();
      await submitBlob(item.blob, item.name);
    } catch (err) { toast(err.message); }
  });

  const close = () => modal.classList.add('hidden');
  urlBtn.addEventListener('click', () => { modal.classList.remove('hidden'); setTimeout(() => urlInput.focus(), 10); });
  $$('[data-close-url]').forEach(el => el.addEventListener('click', close));
  urlGo.addEventListener('click', async () => {
    try {
      const remote = await fetchRemoteImage(urlInput.value.trim());
      await submitBlob(remote.blob, remote.name, urlInput.value.trim());
    } catch (err) { toast(err.message); }
  });
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') urlGo.click(); });

  // Quiet warm-up after the page is visible. It never blocks upload/paste.
  setTimeout(() => preloadEngine(settings().quality).catch(() => {}), 700);
});
