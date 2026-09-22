window.addEventListener('DOMContentLoaded', () => {
  const fileInput = Core.$('#fileInput');
  const uploadBtn = Core.$('#uploadBtn');
  const dropZone = Core.$('#dropZone');
  const pasteBtn = Core.$('#pasteBtn');
  const urlBtn = Core.$('#urlBtn');
  const urlModal = Core.$('#urlModal');
  const urlInput = Core.$('#urlInput');
  const urlGo = Core.$('#urlGo');

  const samples = [
    ['https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=320&q=82','Person'],
    ['https://images.unsplash.com/photo-1552053831-71594a27632d?w=320&q=82','Dog'],
    ['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=320&q=82','Car'],
    ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=320&q=82','Shoe'],
  ];

  const strip = Core.$('#quickSamples');
  samples.forEach(([url,label]) => {
    const btn = document.createElement('button');
    btn.className = 'quick-sample';
    btn.type = 'button';
    btn.title = `Try ${label}`;
    btn.innerHTML = `<img src="${url}" alt="${label}">`;
    btn.addEventListener('click', async () => {
      try { await Core.submitUrl(url); } catch (e) { Core.toast(e.message); }
    });
    strip.appendChild(btn);
  });

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { await Core.submitFile(file); } catch (err) { Core.toast(err.message); }
  });

  ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, e => {
    e.preventDefault(); dropZone.classList.add('dragging');
  }));
  ['dragleave','drop'].forEach(type => dropZone.addEventListener(type, e => {
    e.preventDefault(); dropZone.classList.remove('dragging');
  }));
  dropZone.addEventListener('drop', async e => {
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
    if (!file) return Core.toast('Drop an image file.');
    try { await Core.submitFile(file); } catch (err) { Core.toast(err.message); }
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const payload = await Core.readClipboard();
      if (payload.file) await Core.submitFile(payload.file);
      else await Core.submitUrl(payload.url);
    } catch (err) {
      Core.toast(err.message);
    }
  });

  const closeUrl = () => urlModal.classList.add('hidden');
  urlBtn.addEventListener('click', () => {
    urlModal.classList.remove('hidden');
    setTimeout(() => urlInput.focus(), 20);
  });
  Core.$$('[data-close-url]').forEach(el => el.addEventListener('click', closeUrl));
  urlGo.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return Core.toast('Paste an image URL.');
    try { await Core.submitUrl(url); } catch (err) { Core.toast(err.message); }
  });
  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') urlGo.click();
  });
});
