import { $, $$, toast, initCommon, submitBlob, fetchRemoteImage, readClipboardImage } from './common.js';

window.addEventListener('DOMContentLoaded', () => {
  // Important: bind the UI first. Do not import/download the AI engine on the home page.
  // That way Upload / Paste / Drag / URL always work even if the AI CDN is slow or blocked.
  initCommon();

  const input = $('#fileInput');
  const upload = $('#uploadBtn');
  const drop = $('#dropZone');
  const paste = $('#pasteBtn');
  const urlBtn = $('#urlBtn');
  const modal = $('#urlModal');
  const urlInput = $('#urlInput');
  const urlGo = $('#urlGo');

  if (!input || !upload || !drop || !paste || !urlBtn || !modal || !urlInput || !urlGo) {
    console.error('Home controls are missing.');
    return;
  }

  upload.addEventListener('click', () => input.click());

  input.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await submitBlob(file, file.name);
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Could not open that image.');
    }
  });

  ['dragenter','dragover'].forEach(type => drop.addEventListener(type, e => {
    e.preventDefault();
    drop.classList.add('dragging');
  }));

  ['dragleave','drop'].forEach(type => drop.addEventListener(type, e => {
    e.preventDefault();
    drop.classList.remove('dragging');
  }));

  drop.addEventListener('drop', async e => {
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type?.startsWith('image/'));
    if (!file) return toast('Drop an image file.');
    try {
      await submitBlob(file, file.name);
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Could not open that image.');
    }
  });

  paste.addEventListener('click', async () => {
    try {
      const item = await readClipboardImage();
      await submitBlob(item.blob, item.name);
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Press Ctrl+V to paste the copied image.');
    }
  });

  const close = () => modal.classList.add('hidden');
  urlBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    setTimeout(() => urlInput.focus(), 10);
  });

  $$('[data-close-url]').forEach(el => el.addEventListener('click', close));

  urlGo.addEventListener('click', async () => {
    try {
      const value = urlInput.value.trim();
      if (!value) throw new Error('Paste an image URL.');
      const remote = await fetchRemoteImage(value);
      await submitBlob(remote.blob, remote.name, value);
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Could not load that image URL.');
    }
  });

  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') urlGo.click();
  });
});
