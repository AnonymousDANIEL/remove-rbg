import removeBackground, { preload } from 'https://esm.sh/@imgly/background-removal@1.7.0?bundle';

const PUBLIC_PATH = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';

function modelFor(quality) {
  if (quality === 'fast') return 'small';
  // Full "large" on CPU can be painfully slow. Use it only when WebGPU exists.
  return navigator.gpu ? 'large' : 'medium';
}

function configFor(quality, progress) {
  return {
    publicPath: PUBLIC_PATH,
    device: navigator.gpu ? 'gpu' : 'cpu',
    proxyToWorker: true,
    model: modelFor(quality),
    output: { format: 'image/png', quality: 1 },
    progress,
  };
}

export async function preloadEngine(quality = 'hd') {
  return preload(configFor(quality));
}

async function bitmapFromBlob(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob, { imageOrientation: 'from-image' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] || 0;
}

async function analyzeBorder(blob) {
  const bitmap = await bitmapFromBlob(blob);
  const max = 512;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(2, Math.round(bitmap.width * scale));
  const h = Math.max(2, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const data = ctx.getImageData(0, 0, w, h).data;
  const rs = [], gs = [], bs = [], colors = [];
  const push = (x, y) => {
    const i = (y * w + x) * 4;
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 220) return;
    rs.push(r); gs.push(g); bs.push(b); colors.push([r,g,b]);
  };
  const stepX = Math.max(1, Math.floor(w / 60));
  const stepY = Math.max(1, Math.floor(h / 60));
  for (let x = 0; x < w; x += stepX) { push(x, 0); push(x, h-1); }
  for (let y = 0; y < h; y += stepY) { push(0, y); push(w-1, y); }
  const bg = [median(rs), median(gs), median(bs)];
  let mean = 0;
  for (const [r,g,b] of colors) mean += Math.hypot(r-bg[0], g-bg[1], b-bg[2]);
  mean /= Math.max(1, colors.length);
  const lum = (bg[0] + bg[1] + bg[2]) / 3;
  return { bg, borderNoise: mean, nearlyBlack: lum < 42, nearlyWhite: lum > 215, solid: mean < 23 };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

async function removeSolidBackground(blob, progress) {
  progress?.('graphic:decode', 0, 4);
  const analysis = await analyzeBorder(blob);
  const bitmap = await bitmapFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  progress?.('graphic:mask', 1, 4);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const [br,bg,bb] = analysis.bg;

  // Soft thresholds preserve coloured glow/shadows while removing flat background.
  // Black/white backgrounds use a tighter low threshold; coloured backgrounds slightly wider.
  const low = (analysis.nearlyBlack || analysis.nearlyWhite) ? 7 : 12;
  const high = (analysis.nearlyBlack || analysis.nearlyWhite) ? 48 : 62;

  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i]-br, d[i+1]-bg, d[i+2]-bb);
    const a = smoothstep(low, high, dist);
    d[i+3] = Math.round(d[i+3] * a);
  }
  progress?.('graphic:apply', 2, 4);
  ctx.putImageData(image, 0, 0);
  progress?.('graphic:encode', 3, 4);
  const result = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG export failed.')), 'image/png'));
  progress?.('graphic:encode', 4, 4);
  return { result, analysis };
}

export async function processImage(blob, { mode = 'smart', quality = 'hd', progress } = {}) {
  if (mode === 'graphic') {
    const graphic = await removeSolidBackground(blob, progress);
    return { blob: graphic.result, engine: 'Graphic Smart', analysis: graphic.analysis };
  }

  if (mode === 'smart') {
    progress?.('smart:analyze', 0, 1);
    const analysis = await analyzeBorder(blob);
    progress?.('smart:analyze', 1, 1);
    if (analysis.solid && (analysis.nearlyBlack || analysis.nearlyWhite)) {
      const graphic = await removeSolidBackground(blob, progress);
      return { blob: graphic.result, engine: 'Smart Graphic', analysis };
    }
  }

  const config = configFor(quality, progress);
  const result = await removeBackground(blob, config);
  return {
    blob: result,
    engine: navigator.gpu ? `AI WebGPU (${modelFor(quality)})` : `AI CPU (${modelFor(quality)})`,
    analysis: null,
  };
}
