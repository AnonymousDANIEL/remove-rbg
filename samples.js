window.addEventListener('DOMContentLoaded', () => {
  const C = window.RemoveBGCore;
  const $ = C.$;
  const $$ = C.$$;
  const grid = $('#sampleGrid');
  const processing = $('#processingScreen');
  let activeFilter = 'all';

  const samples = [
    { id: 'portrait-woman', category: 'people', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=86' },
    { id: 'portrait-man', category: 'people', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=86' },
    { id: 'portrait-two', category: 'people', url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=86' },
    { id: 'golden-dog', category: 'animals', url: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1000&q=86' },
    { id: 'cat', category: 'animals', url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1000&q=86' },
    { id: 'sports-car', category: 'cars', url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=86' },
    { id: 'watch', category: 'products', url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=86' },
    { id: 'shoe', category: 'products', url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=86' },
    { id: 'headphones', category: 'products', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=86' },
    { id: 'camera', category: 'products', url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=86' },
    { id: 'backpack', category: 'products', url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&q=86' },
  ];

  async function processSample(sample) {
    try {
      processing.classList.remove('hidden');
      await C.processUrlAndOpen(sample.url, `${sample.id}.jpg`);
    } catch (err) {
      processing.classList.add('hidden');
      C.toast(err.message || 'Sample could not be processed.');
    }
  }

  function render() {
    grid.innerHTML = '';
    samples.filter(s => activeFilter === 'all' || s.category === activeFilter).forEach(sample => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'sample-pick-card';
      card.innerHTML = `
        <div class="sample-thumb"><img src="${sample.url}" alt="${sample.category} sample" loading="lazy"></div>
        <div class="sample-pick-footer"><span>${sample.category}</span><strong>Use sample →</strong></div>`;
      card.addEventListener('click', () => processSample(sample));
      grid.appendChild(card);
    });
  }

  $$('.sample-filter').forEach(btn => btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    $$('.sample-filter').forEach(b => b.classList.toggle('active', b === btn));
    render();
  }));

  render();
});
