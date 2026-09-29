const DB='bg-history-v4', STORE='records', VER=1, MAX=30;
let dbp=null, toastTimer=null;
export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];

function openDb(){
  if(dbp)return dbp;
  dbp=new Promise((resolve,reject)=>{
    const q=indexedDB.open(DB,VER);
    q.onupgradeneeded=()=>{const db=q.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
    q.onsuccess=()=>resolve(q.result); q.onerror=()=>reject(q.error);
  });
  return dbp;
}
export async function put(x){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(x);t.oncomplete=res;t.onerror=()=>rej(t.error);});}
export async function get(id){if(!id)return null;const db=await openDb();return new Promise((res,rej)=>{const q=db.transaction(STORE).objectStore(STORE).get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});}
export async function all(){const db=await openDb();return new Promise((res,rej)=>{const q=db.transaction(STORE).objectStore(STORE).getAll();q.onsuccess=()=>res(q.result.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));q.onerror=()=>rej(q.error);});}
export async function del(id){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error);});}
export async function clearHistory(){const xs=await all();for(const x of xs)await del(x.id);}

export function toast(m){const e=$('#toast');if(!e)return;e.textContent=m;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),2600);}
export function settings(){return{mode:localStorage.getItem('bg-mode')||'smart',quality:localStorage.getItem('bg-quality')||'hd'};}
export function initCommon(){
  $$('[data-mode-choice]').forEach(b=>b.addEventListener('click',()=>{localStorage.setItem('bg-mode',b.dataset.modeChoice);sync();}));
  $$('[data-quality-choice]').forEach(b=>b.addEventListener('click',()=>{localStorage.setItem('bg-quality',b.dataset.qualityChoice);sync();}));
  sync(); bindPaste();
  const badge=$('#engineBadge'); if(badge)badge.textContent='Railway Local AI';
}
function sync(){const s=settings();$$('[data-mode-choice]').forEach(b=>b.classList.toggle('active',b.dataset.modeChoice===s.mode));$$('[data-quality-choice]').forEach(b=>b.classList.toggle('active',b.dataset.qualityChoice===s.quality));}
async function err(res){try{return (await res.json()).error||`Request failed (${res.status})`;}catch{return `Request failed (${res.status})`;}}
export async function submitBlob(blob,name='image.png'){
  if(!blob?.type?.startsWith('image/'))throw new Error('Please choose or paste an image.');
  const s=settings(), form=new FormData(); form.append('image',blob,name); form.append('mode',s.mode); form.append('quality',s.quality);
  const r=await fetch('/api/jobs',{method:'POST',body:form}); if(!r.ok)throw new Error(await err(r)); const job=await r.json(); location.assign(`/processing?id=${encodeURIComponent(job.id)}`);
}
export async function submitUrl(url){
  const s=settings(); const r=await fetch('/api/jobs-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,mode:s.mode,quality:s.quality})});
  if(!r.ok)throw new Error(await err(r)); const job=await r.json(); location.assign(`/processing?id=${encodeURIComponent(job.id)}`);
}
function clipFile(data){for(const i of [...(data?.items||[])])if(i.kind==='file'&&i.type?.startsWith('image/')){const f=i.getAsFile();if(f)return f;}return [...(data?.files||[])].find(f=>f.type?.startsWith('image/'))||null;}
function urlish(v){try{const u=new URL((v||'').trim());return ['http:','https:'].includes(u.protocol)?u.toString():null;}catch{return null;}}
function clipUrl(data){const html=data?.getData?.('text/html')||'';if(html){try{const src=new DOMParser().parseFromString(html,'text/html').querySelector('img')?.src;if(urlish(src))return src;}catch{}}return urlish(data?.getData?.('text/uri-list'))||urlish(data?.getData?.('text/plain'));}
function bindPaste(){document.addEventListener('paste',async e=>{const t=e.target;if(t&&(t.matches?.('input,textarea')||t.isContentEditable))return;const f=clipFile(e.clipboardData),u=f?null:clipUrl(e.clipboardData);if(!f&&!u)return;e.preventDefault();try{if(f)await submitBlob(f,f.name||`pasted-${Date.now()}.png`);else await submitUrl(u);}catch(x){toast(x.message);}});}
export async function readClipboardImage(){if(!navigator.clipboard?.read)throw new Error('Press Ctrl+V to paste.');for(const item of await navigator.clipboard.read()){const type=item.types.find(t=>t.startsWith('image/'));if(type){const b=await item.getType(type);return{blob:b,name:`pasted-${Date.now()}.png`};}}throw new Error('No image found in clipboard.');}
export async function saveRecord(record){await put(record);localStorage.setItem('bg-current-id',record.id);const xs=await all();for(const old of xs.slice(MAX))await del(old.id);return record;}
export async function copyPng(blob){await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);}
export function downloadPng(blob,name='image.png'){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name.replace(/\.[^.]+$/,'')+'-no-bg.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export {err};
