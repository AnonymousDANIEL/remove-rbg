const DB='bg-history-v4', STORE='records', VER=1, MAX=40;
let dbp=null, toastTimer=null;
const pollers=new Map();
const objectUrls=new Set();

export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];

function openDb(){
  if(dbp)return dbp;
  dbp=new Promise((resolve,reject)=>{
    const q=indexedDB.open(DB,VER);
    q.onupgradeneeded=()=>{
      const db=q.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    q.onsuccess=()=>resolve(q.result);
    q.onerror=()=>reject(q.error);
  });
  return dbp;
}

export async function put(x){
  const db=await openDb();
  return new Promise((res,rej)=>{
    const t=db.transaction(STORE,'readwrite');
    t.objectStore(STORE).put(x);
    t.oncomplete=res;
    t.onerror=()=>rej(t.error);
  });
}

export async function get(id){
  if(!id)return null;
  const db=await openDb();
  return new Promise((res,rej)=>{
    const q=db.transaction(STORE).objectStore(STORE).get(id);
    q.onsuccess=()=>res(q.result||null);
    q.onerror=()=>rej(q.error);
  });
}

export async function all(){
  const db=await openDb();
  return new Promise((res,rej)=>{
    const q=db.transaction(STORE).objectStore(STORE).getAll();
    q.onsuccess=()=>res(
      q.result
        .map(x=>{if(!x.kind&&x.resultBlob)x.kind='result';return x;})
        .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))
    );
    q.onerror=()=>rej(q.error);
  });
}

export async function del(id){
  const db=await openDb();
  return new Promise((res,rej)=>{
    const t=db.transaction(STORE,'readwrite');
    t.objectStore(STORE).delete(id);
    t.oncomplete=res;
    t.onerror=()=>rej(t.error);
  });
}

export async function clearHistory(){
  const xs=await all();
  for(const x of xs)await del(x.id);
  emitUpdate();
}

export function toast(message){
  const el=$('#toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
}

export function settings(){
  return{
    mode:localStorage.getItem('bg-mode')||'smart',
    quality:localStorage.getItem('bg-quality')||'hd'
  };
}

function syncSettings(){
  const s=settings();
  $$('[data-mode-choice]').forEach(b=>b.classList.toggle('active',b.dataset.modeChoice===s.mode));
  $$('[data-quality-choice]').forEach(b=>b.classList.toggle('active',b.dataset.qualityChoice===s.quality));
}

export async function err(res){
  try{return (await res.json()).error||`Request failed (${res.status})`;}
  catch{return `Request failed (${res.status})`;}
}

function uid(){
  return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emitUpdate(record=null){
  window.dispatchEvent(new CustomEvent('bg-record-updated',{detail:record}));
}

async function trimHistory(){
  const xs=await all();
  for(const old of xs.slice(MAX))await del(old.id);
}

export async function saveRecord(record){
  await put(record);
  if(record.kind==='result')localStorage.setItem('bg-current-id',record.id);
  await trimHistory();
  emitUpdate(record);
  return record;
}

async function optimisticRecord({blob=null,name='image.png',sourceUrl=''}){
  const s=settings();
  const rec={
    id:uid(),
    jobId:null,
    kind:'pending',
    status:'uploading',
    createdAt:Date.now(),
    name,
    originalBlob:blob,
    originalUrl:sourceUrl,
    mode:s.mode,
    quality:s.quality,
    error:null
  };
  await put(rec);
  emitUpdate(rec);
  return rec;
}

export async function submitBlob(blob,name='image.png'){
  if(!blob?.type?.startsWith('image/'))throw new Error('Please choose or paste an image.');
  const rec=await optimisticRecord({blob,name});
  try{
    const form=new FormData();
    form.append('image',blob,name);
    form.append('mode',rec.mode);
    form.append('quality',rec.quality);

    const r=await fetch('/api/jobs',{method:'POST',body:form});
    if(!r.ok)throw new Error(await err(r));
    const job=await r.json();

    rec.jobId=job.id;
    rec.status=job.status||'queued';
    await put(rec);
    emitUpdate(rec);
    pollJob(rec.id,job.id);
    return rec;
  }catch(e){
    rec.kind='error';
    rec.status='error';
    rec.error=e.message||'Upload failed.';
    await put(rec);
    emitUpdate(rec);
    throw e;
  }
}

export async function submitUrl(url){
  const value=(url||'').trim();
  if(!value)throw new Error('Paste an image URL.');
  const rec=await optimisticRecord({name:'url-image.jpg',sourceUrl:value});
  try{
    const r=await fetch('/api/jobs-url',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:value,mode:rec.mode,quality:rec.quality})
    });
    if(!r.ok)throw new Error(await err(r));
    const job=await r.json();

    rec.jobId=job.id;
    rec.name=job.name||rec.name;
    rec.status=job.status||'queued';
    await put(rec);
    emitUpdate(rec);
    pollJob(rec.id,job.id);
    return rec;
  }catch(e){
    rec.kind='error';
    rec.status='error';
    rec.error=e.message||'URL upload failed.';
    await put(rec);
    emitUpdate(rec);
    throw e;
  }
}

async function fetchBlob(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(await err(r));
  const blob=await r.blob();
  if(!blob.size)throw new Error('Empty image result.');
  return blob;
}

async function finalizeRecord(localId,job){
  const rec=await get(localId);
  if(!rec)return;

  const resultBlob=await fetchBlob('/api/jobs/'+encodeURIComponent(job.id)+'/result');
  let originalBlob=rec.originalBlob;
  if(!originalBlob?.size){
    originalBlob=await fetchBlob('/api/jobs/'+encodeURIComponent(job.id)+'/original');
  }

  const done={
    ...rec,
    kind:'result',
    status:'done',
    resultBlob,
    originalBlob,
    engine:job.engine||'Railway Local AI',
    elapsedMs:job.processingMs||0,
    finishedAt:Date.now(),
    error:null
  };
  await saveRecord(done);
}

async function pollJob(localId,jobId){
  if(!localId||!jobId||pollers.has(localId))return;
  pollers.set(localId,true);
  try{
    while(true){
      const current=await get(localId);
      if(!current||current.kind==='result')break;

      const r=await fetch('/api/jobs/'+encodeURIComponent(jobId),{cache:'no-store'});
      if(!r.ok){
        if(r.status===404){
          current.kind='error';
          current.status='error';
          current.error='Processing job expired. Paste the image again.';
          await put(current);
          emitUpdate(current);
          break;
        }
        throw new Error(await err(r));
      }

      const job=await r.json();
      current.status=job.status;
      current.engine=job.engine||current.engine;
      current.elapsedMs=job.processingMs||current.elapsedMs;
      current.error=job.error||null;
      await put(current);
      emitUpdate(current);

      if(job.status==='done'){
        await finalizeRecord(localId,job);
        break;
      }
      if(job.status==='error'){
        current.kind='error';
        current.status='error';
        current.error=job.error||'Background removal failed.';
        await put(current);
        emitUpdate(current);
        break;
      }
      await new Promise(res=>setTimeout(res,650));
    }
  }catch(e){
    const current=await get(localId);
    if(current&&current.kind!=='result'){
      current.status='waiting';
      current.error=e.message||'Temporary connection problem.';
      await put(current);
      emitUpdate(current);
      setTimeout(()=>pollJob(localId,jobId),1500);
    }
  }finally{
    pollers.delete(localId);
  }
}

async function resumePending(){
  const xs=await all();
  for(const rec of xs){
    if(rec.kind==='pending'&&rec.jobId)pollJob(rec.id,rec.jobId);
  }
}

function clipboardFile(data){
  for(const item of [...(data?.items||[])]){
    if(item.kind==='file'&&item.type?.startsWith('image/')){
      const f=item.getAsFile();
      if(f)return f;
    }
  }
  return [...(data?.files||[])].find(f=>f.type?.startsWith('image/'))||null;
}

function httpUrl(value){
  try{
    const u=new URL((value||'').trim());
    return ['http:','https:'].includes(u.protocol)?u.toString():null;
  }catch{return null;}
}

function clipboardUrl(data){
  const html=data?.getData?.('text/html')||'';
  if(html){
    try{
      const src=new DOMParser().parseFromString(html,'text/html').querySelector('img')?.src;
      if(httpUrl(src))return src;
    }catch{}
  }
  return httpUrl(data?.getData?.('text/uri-list'))||httpUrl(data?.getData?.('text/plain'));
}

function bindGlobalPaste(){
  document.addEventListener('paste',async e=>{
    const target=e.target;
    if(target&&(target.matches?.('input,textarea')||target.isContentEditable))return;

    const file=clipboardFile(e.clipboardData);
    const url=file?null:clipboardUrl(e.clipboardData);
    if(!file&&!url)return;

    e.preventDefault();
    try{
      if(file)await submitBlob(file,file.name||`pasted-${Date.now()}.png`);
      else await submitUrl(url);
      toast('Added to queue');
    }catch(ex){toast(ex.message);}
  });
}

export async function readClipboardImage(){
  if(!navigator.clipboard?.read)throw new Error('Press Ctrl+V to paste.');
  for(const item of await navigator.clipboard.read()){
    const type=item.types.find(t=>t.startsWith('image/'));
    if(type){
      const blob=await item.getType(type);
      return{blob,name:`pasted-${Date.now()}.png`};
    }
  }
  throw new Error('No image found in clipboard.');
}

export async function copyPng(blob){
  await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
}

export function downloadPng(blob,name='image.png'){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=name.replace(/\.[^.]+$/,'')+'-no-bg.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

function makeObjectUrl(blob){
  const u=URL.createObjectURL(blob);
  objectUrls.add(u);
  return u;
}

function clearObjectUrls(){
  for(const u of objectUrls)URL.revokeObjectURL(u);
  objectUrls.clear();
}

async function renderTray(){
  const tray=$('#jobTray');
  const rail=$('#jobTrayRail');
  if(!tray||!rail)return;

  const xs=await all();
  rail.innerHTML='';
  clearObjectUrls();

  const shown=xs.slice(0,20);
  tray.classList.toggle('empty',shown.length===0);

  for(const rec of shown){
    const tile=document.createElement('button');
    tile.type='button';
    tile.className='job-tile '+(rec.kind==='result'?'done':rec.kind==='error'?'failed':'pending');
    tile.title=rec.kind==='result'?'Open result':rec.kind==='error'?(rec.error||'Failed'):(rec.status==='queued'?'Queued':'Removing background…');

    const img=document.createElement('img');
    if(rec.kind==='result'&&rec.resultBlob?.size)img.src=makeObjectUrl(rec.resultBlob);
    else if(rec.originalBlob?.size)img.src=makeObjectUrl(rec.originalBlob);
    else if(rec.originalUrl)img.src=rec.originalUrl;
    img.alt=rec.name||'image';
    tile.appendChild(img);

    if(rec.kind==='result'){
      const ok=document.createElement('span');
      ok.className='job-done-mark';
      ok.textContent='✓';
      tile.appendChild(ok);
    }else{
      const state=document.createElement('span');
      state.className='job-state';
      if(rec.kind==='error'){
        state.innerHTML='<b>!</b>';
      }else{
        state.innerHTML='<i class="mini-spinner"></i>';
        const tiny=document.createElement('em');
        tiny.textContent=rec.status==='queued'?'Q':rec.status==='uploading'?'↑':'';
        state.appendChild(tiny);
      }
      tile.appendChild(state);
    }

    tile.addEventListener('click',()=>{
      if(rec.kind==='result'){
        localStorage.setItem('bg-current-id',rec.id);
        location.assign('/result?record='+encodeURIComponent(rec.id));
      }else if(rec.kind==='error'){
        toast(rec.error||'Background removal failed.');
      }
    });

    rail.appendChild(tile);
  }
}

function installTray(){
  let tray=$('#jobTray');
  if(!tray){
    tray=document.createElement('div');
    tray.id='jobTray';
    tray.className='job-tray empty';
    tray.innerHTML='<input id="trayFileInput" type="file" accept="image/*" hidden><button id="trayAdd" class="job-add" type="button" title="Add image">+</button><div id="jobTrayRail" class="job-tray-rail"></div>';
    document.body.appendChild(tray);
  }

  document.body.classList.add('with-job-tray');

  const input=$('#trayFileInput');
  const add=$('#trayAdd');
  if(add&&input&&!add.dataset.bound){
    add.dataset.bound='1';
    add.addEventListener('click',()=>input.click());
    input.addEventListener('change',async e=>{
      const f=e.target.files?.[0];
      e.target.value='';
      if(!f)return;
      try{
        await submitBlob(f,f.name);
        toast('Added to queue');
      }catch(ex){toast(ex.message);}
    });
  }

  window.addEventListener('bg-record-updated',renderTray);
  renderTray();
}

export function initCommon(){
  $$('[data-mode-choice]').forEach(b=>b.addEventListener('click',()=>{
    localStorage.setItem('bg-mode',b.dataset.modeChoice);
    syncSettings();
  }));
  $$('[data-quality-choice]').forEach(b=>b.addEventListener('click',()=>{
    localStorage.setItem('bg-quality',b.dataset.qualityChoice);
    syncSettings();
  }));

  syncSettings();
  installTray();
  bindGlobalPaste();
  resumePending();

  const badge=$('#engineBadge');
  if(badge)badge.textContent='Railway Local AI';
}
