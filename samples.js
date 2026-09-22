window.addEventListener('DOMContentLoaded', () => {
  const items = [
    {cat:'people', name:'Portrait', url:'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900&q=88'},
    {cat:'people', name:'Person', url:'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=900&q=88'},
    {cat:'animals', name:'Dog', url:'https://images.unsplash.com/photo-1552053831-71594a27632d?w=900&q=88'},
    {cat:'animals', name:'Cat', url:'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=900&q=88'},
    {cat:'products', name:'Shoe', url:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=88'},
    {cat:'products', name:'Headphones', url:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=88'},
    {cat:'cars', name:'Car', url:'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=900&q=88'},
    {cat:'cars', name:'Sports car', url:'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=900&q=88'},
  ];

  const grid = Core.$('#sampleGrid');

  function render(filter='all') {
    grid.innerHTML = '';
    items.filter(x => filter === 'all' || x.cat === filter).forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'sample-pick-card';
      btn.type = 'button';
      btn.innerHTML = `
        <div class="sample-thumb"><img src="${item.url}" alt="${item.name}" loading="lazy"></div>
        <div class="sample-pick-footer"><span>${item.cat}</span><strong>Use sample</strong></div>`;
      btn.addEventListener('click', async () => {
        try { await Core.submitUrl(item.url); }
        catch (err) { Core.toast(err.message); }
      });
      grid.appendChild(btn);
    });
  }

  Core.$$('.sample-filter').forEach(btn => btn.addEventListener('click', () => {
    Core.$$('.sample-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render(btn.dataset.filter);
  }));

  render();
});
