window.addEventListener('DOMContentLoaded', () => {
  const C = window.RemoveBGCore;
  const $ = C.$;
  const fileInput = $('#fileInput');
  const uploadBtn = $('#uploadBtn');
  const dropZone = $('#dropZone');
  const pasteBtn = $('#pasteBtn');
  const urlBtn = $('#urlBtn');
  const urlModal = $('#urlModal');
  const urlInput = $('#urlInput');
  const processUrlBtn = $('#processUrlBtn');
  const processingScreen = $('#processingScreen');
  const quickSamples = $('#quickSamples');

  const samples = [
    { name: 'person.jpg', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=86' },
    { name: 'dog.jpg', url: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=86' },
    { name: 'car.jpg', url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1000&q=86' },
    { name: 'watch.jpg', url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=86' },
    { name: 'shoe.jpg', url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=86' },
  ];

  function setBusy(busy) {
    processingScreen.classList.toggle('hidden', !busy);
    uploadBtn.disabled = busy;
    pasteBtn.disabled = busy;
    processUrlBtn.disabled = busy;
  }

  async function runFile(file) {
    try {
      setBusy(true);
      await C.processFileAndOpen(file);
    } catch (err) {
      setBusy(false);
      C.toast(err.message || 'Background removal failed.');
    }
  }

  async function runUrl(url, name = 'url-image.jpg') {
    try {
      setBusy(true);
      closeUrlModal();
      await C.processUrlAndOpen(url, name);
    } catch (err) {
      setBusy(false);
      C.toast(err.message || 'Could not process that image.');
    }
  }

  function openUrlModal() {
    urlModal.classList.remove('hidden');
    setTimeout(() => urlInput.focus(), 40);
  }
  function closeUrlModal() { urlModal.classList.add('hidden'); }

  samples.forEach(sample => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-sample';
    btn.innerHTML = `<img src="${sample.url}" alt="Sample image" loading="lazy">`;
    btn.addEventListener('click', () => runUrl(sample.url, sample.name));
    quickSamples.appendChild(btn);
  });

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) runFile(fileInput.files[0]);
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
    if (file) runFile(file); else C.toast('Drop an image file here.');
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const file = await C.readClipboardImage();
      if (file) runFile(file);
    } catch (err) {
      C.toast(err.message || 'Press Ctrl+V to paste an image.');
    }
  });

  document.addEventListener('paste', e => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      runFile(file);
    }
  });

  urlBtn.addEventListener('click', openUrlModal);
  document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeUrlModal));
  processUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return C.toast('Paste an image URL first.');
    runUrl(url);
  });
  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') processUrlBtn.click();
    if (e.key === 'Escape') closeUrlModal();
  });
});
