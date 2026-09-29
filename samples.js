import { $, initCommon, fetchRemoteImage, submitBlob, toast } from './common.js';

window.addEventListener('DOMContentLoaded', () => {
  initCommon();
  const samples = [
    ['Portrait','https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1000&q=88'],
    ['Dog','https://images.unsplash.com/photo-1552053831-71594a27632d?w=1000&q=88'],
    ['Car','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1000&q=88'],
    ['Shoe','https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1000&q=88'],
  ];
  const grid = $('#sampleGrid');
  for (const [name,url] of samples) {
    const btn = document.createElement('button'); btn.className='sample-card'; btn.type='button';
    btn.innerHTML = `<img src="/proxy-image?url=${encodeURIComponent(url)}" alt="${name}" loading="lazy"><span><strong>${name}</strong><em>Use sample</em></span>`;
    btn.addEventListener('click', async () => { try { const remote=await fetchRemoteImage(url); await submitBlob(remote.blob, remote.name, url); } catch(err) { toast(err.message); } });
    grid.appendChild(btn);
  }
});
