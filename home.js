import{$,$$,toast,initCommon,submitBlob,submitUrl,readClipboardImage}from'./common.js';
window.addEventListener('DOMContentLoaded',()=>{initCommon();const input=$('#fileInput'),up=$('#uploadBtn'),drop=$('#dropZone'),paste=$('#pasteBtn'),urlBtn=$('#urlBtn'),modal=$('#urlModal'),urlInput=$('#urlInput'),urlGo=$('#urlGo');
up.onclick=()=>input.click();input.onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(f)try{await submitBlob(f,f.name);}catch(x){toast(x.message);}};
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('dragging');}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('dragging');}));
drop.addEventListener('drop',async e=>{const f=[...(e.dataTransfer?.files||[])].find(x=>x.type.startsWith('image/'));if(!f)return toast('Drop an image file.');try{await submitBlob(f,f.name);}catch(x){toast(x.message);}});
paste.onclick=async()=>{try{const x=await readClipboardImage();await submitBlob(x.blob,x.name);}catch(e){toast(e.message);}};
const close=()=>modal.classList.add('hidden');urlBtn.onclick=()=>{modal.classList.remove('hidden');urlInput.focus();};$$('[data-close-url]').forEach(e=>e.onclick=close);urlGo.onclick=async()=>{try{await submitUrl(urlInput.value.trim());}catch(e){toast(e.message);}};urlInput.onkeydown=e=>{if(e.key==='Enter')urlGo.click();};});
