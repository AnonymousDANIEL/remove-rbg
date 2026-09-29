import{$,$$,toast,initCommon,get,all,put,del,clearHistory,copyPng,downloadPng,submitBlob}from'./common.js';
window.addEventListener('DOMContentLoaded',async()=>{
  initCommon();
  const params=new URLSearchParams(location.search);
  const recordId=params.get('record')||localStorage.getItem('bg-current-id');
  let current=await get(recordId);
  if(!current||current.kind!=='result')current=(await all()).find(x=>x.kind==='result');
  if(!current)return location.assign('/');

  const stage=$('#resultStage'),editor=$('#editorCard'),rail=$('#historyRail'),empty=$('#historyEmpty'),fi=$('#newFileInput');
  let urls=[];
  const make=blob=>{const u=URL.createObjectURL(blob);urls.push(u);return u;};
  const clearUrls=()=>{urls.forEach(URL.revokeObjectURL);urls=[];};
  async function fetchBlob(url){
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok){let m='Image unavailable';try{m=(await r.json()).error||m;}catch{}throw new Error(m);}
    const b=await r.blob();
    if(!b.size)throw new Error('Empty image result.');
    return b;
  }
  async function resultBlob(rec){
    if(rec.resultBlob?.size)return rec.resultBlob;
    if(rec.jobId)return fetchBlob('/api/jobs/'+encodeURIComponent(rec.jobId)+'/result');
    throw new Error('Result image is unavailable.');
  }
  async function originalBlob(rec){
    if(rec.originalBlob?.size)return rec.originalBlob;
    if(rec.jobId)return fetchBlob('/api/jobs/'+encodeURIComponent(rec.jobId)+'/original');
    throw new Error('Original image is unavailable.');
  }
  async function show(rec){
    current=rec;localStorage.setItem('bg-current-id',rec.id);clearUrls();
    let rb,ob;
    try{[rb,ob]=await Promise.all([resultBlob(rec),originalBlob(rec)]);}catch(e){toast(e.message);return;}
    if(!rec.resultBlob?.size||!rec.originalBlob?.size){rec={...rec,resultBlob:rb,originalBlob:ob};try{await put(rec);}catch{}current=rec;}
    const a=rec.jobId?('/api/jobs/'+encodeURIComponent(rec.jobId)+'/result?v='+(rec.finishedAt||Date.now())):make(rb);
    const b=make(ob);
    $('#removedImage').src=a;$('#compareRemoved').src=a;$('#originalImage').src=b;$('#compareOriginal').src=b;
    $('#resultName').textContent=rec.name||'image.png';
    $('#resultStats').innerHTML=[rec.engine,`Mode: ${rec.mode}`,`Quality: ${(rec.quality||'hd').toUpperCase()}`,rec.elapsedMs?((rec.elapsedMs/1000).toFixed(1)+'s'):null].filter(Boolean).map(x=>'<span>'+x+'</span>').join('');
    const probe=new Image();probe.onload=()=>{const w=probe.naturalWidth||1,h=probe.naturalHeight||1,r=w/h;stage.style.setProperty('--image-ratio',w+'/'+h);editor.style.setProperty('--editor-width',(r>1.7?900:r>1.25?780:r<.75?470:r<1.05?540:620)+'px');};probe.src=b;
    await history();
  }
  async function history(){
    const xs=(await all()).filter(x=>x.kind==='result');rail.innerHTML='';empty.classList.toggle('hidden',xs.length>0);rail.classList.toggle('hidden',xs.length===0);
    for(const rec of xs){
      const box=document.createElement('div');box.className='history-item'+(rec.id===current?.id?' active':'');
      const open=document.createElement('button');open.className='history-open';const img=new Image();
      if(rec.jobId)img.src='/api/jobs/'+encodeURIComponent(rec.jobId)+'/result';
      else if(rec.resultBlob?.size){const u=URL.createObjectURL(rec.resultBlob);img.src=u;img.onload=()=>URL.revokeObjectURL(u);}
      open.appendChild(img);open.onclick=()=>show(rec);
      const tools=document.createElement('div');tools.className='history-tools';
      const cp=document.createElement('button');cp.textContent='⧉';cp.onclick=async e=>{e.stopPropagation();try{await copyPng(await resultBlob(rec));toast('Copied');}catch(x){toast(x.message);}};
      const rm=document.createElement('button');rm.textContent='×';rm.onclick=async e=>{e.stopPropagation();await del(rec.id);if(rec.id===current?.id){const left=(await all()).filter(x=>x.kind==='result');if(left[0])show(left[0]);else location.assign('/');}else history();};
      tools.append(cp,rm);box.append(open,tools);rail.appendChild(box);
    }
  }
  $$('.mode-tab').forEach(b=>b.onclick=()=>{$$('.mode-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');stage.className='result-stage mode-'+b.dataset.mode;});
  $('#compareRange').oninput=e=>{const v=+e.target.value;$('#compareAfter').style.clipPath=`inset(0 ${100-v}% 0 0)`;$('#compareLine').style.left=v+'%';};
  $('#downloadBtn').onclick=async()=>{try{downloadPng(await resultBlob(current),current.name);}catch(x){toast(x.message);}};
  $('#copyBtn').onclick=async()=>{try{await copyPng(await resultBlob(current));toast('Image copied');}catch(x){toast(x.message);}};
  $('#newImageBtn').onclick=()=>fi.click();
  fi.onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(f)try{await submitBlob(f,f.name);toast('Added to queue');}catch(x){toast(x.message);}};
  $('#deleteBtn').onclick=async()=>{await del(current.id);const left=(await all()).filter(x=>x.kind==='result');if(left[0])show(left[0]);else location.assign('/');};
  $('#clearAllBtn').onclick=async()=>{await clearHistory();location.assign('/');};
  window.addEventListener('bg-record-updated',history);
  await show(current);
  window.onbeforeunload=clearUrls;
});