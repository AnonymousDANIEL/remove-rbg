window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const name = params.get('name') || 'image.png';
  const mode = params.get('mode') === 'hd' ? 'hd' : 'fast';

  Core.$('#processingName').textContent = name;
  Core.$('#processingMode').textContent = mode === 'hd' ? 'HD quality' : 'Fast quality';

  if (!id) {
    Core.$('#processingText').textContent = 'No processing job found.';
    return;
  }

  let stopped = false;
  let delay = 300;

  async function poll() {
    if (stopped) return;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await Core.responseError(response));
      const job = await response.json();

      if (job.status === 'done') {
        stopped = true;
        location.replace(`/result?id=${encodeURIComponent(id)}`);
        return;
      }

      if (job.status === 'error') {
        stopped = true;
        Core.$('#processingText').textContent = job.error || 'Background removal failed.';
        document.body.classList.add('processing-error');
        return;
      }

      const text = job.status === 'queued'
        ? 'Queued for the AI model…'
        : 'Processing the newest image…';
      Core.$('#processingText').textContent = text;

      delay = Math.min(900, delay + 60);
      setTimeout(poll, delay);
    } catch (err) {
      Core.$('#processingText').textContent = err.message || 'Connection problem. Retrying…';
      setTimeout(poll, 1000);
    }
  }

  poll();
});
