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
  const quickSamples = $('#quickSamples');

  const samples = [
    { name: 'person.jpg', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=86' },
    { name: 'dog.jpg', url: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=86' },
    { name: 'car.jpg', url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1000&q=86' },
    { name: 'watch.jpg', url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=86' },
    { name: 'shoe.jpg', url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=86' },
  ];

  function runFile(file) {
    C.enqueueFile(file, { redirect: true });
  }

  function runUrl(url, name = 'url-image.jpg') {
    closeUrlModal();
    C.enqueueUrl(url, name, { redirect: true });
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
    [...(fileInput.files || [])].filter(f => f.type.startsWith('image/')).forEach(runFile);
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
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) files.forEach(runFile); else C.toast('Drop an image file here.');
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const payload = await C.readClipboardImage();
      if (payload instanceof File) runFile(payload);
      else if (payload?.url) runUrl(payload.url, 'pasted-image.jpg');
    } catch (err) {
      C.toast(err.message || 'Press Ctrl+V to paste the copied image.');
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
