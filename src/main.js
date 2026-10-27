import './style.css';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {paperName, classifyColor, colorCoverage, calculate, printPlan, documentKind} from './model.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['file','notice','file-info','filename','file-detail','page-count','pages','select-all','select-none','change-file','preview','preview-empty','preview-label','threshold','apply-detection','bw-price','color-price','total','summary','print'].map(id=>[id,$(id)]));
const state = {pdf:null,pages:[],name:'',token:0,previewToken:0,busy:false,printing:false,loadingTask:null};
const saved = key => { try { return localStorage.getItem('hyprint.'+key); } catch { return null; } };
for (const key of ['threshold','bw-price','color-price']) {
  const value = saved(key);
  if (value !== null && Number.isFinite(Number(value))) ui[key].value = value;
}
function showNotice(text) { ui.notice.textContent=text; ui.notice.hidden=!text; }
function clampInput(input,min,max,fallback) {
  const n=Number(input.value); const value=Number.isFinite(n) && input.value!=='' ? Math.max(min,Math.min(max,n)) : fallback;
  input.value=value; return value;
}
function persist(id,value) { try { localStorage.setItem('hyprint.'+id,String(value)); } catch {} }
function price(id) { return clampInput(ui[id],0,10000000,0); }
function threshold() { return clampInput(ui.threshold,.1,100,1); }
function updateSummary() {
  const values=calculate(state.pages,price('bw-price'),price('color-price'));
  ui.total.textContent='Rp '+new Intl.NumberFormat('id-ID').format(values.total);
  ui.summary.textContent=`${values.bw} hitam putih · ${values.color} warna`;
  ui.print.disabled=state.busy || !state.pdf || values.bw+values.color===0;
}
function setBusy(value) {
  state.busy=value; document.body.classList.toggle('busy',value);
  ui['select-all'].disabled=value || !state.pages.length;
  ui['select-none'].disabled=value || !state.pages.length;
  ui['apply-detection'].disabled=value || !state.pages.length;
  updateSummary();
}
function el(tag,attrs={},text) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) { if(key==='class') node.className=value; else if(key==='title') node.title=value; else node.setAttribute(key,String(value)); }
  if(text!==undefined) node.textContent=text;
  return node;
}
function drawRows() {
  ui.pages.replaceChildren();
  if(!state.pages.length) { const tr=el('tr'),td=el('td',{colspan:5,class:'empty'},'Halaman akan muncul setelah PDF dipilih.');tr.append(td);ui.pages.append(tr);return; }
  state.pages.forEach((page,index)=>{
    const tr=el('tr');
    const checked=el('input',{type:'checkbox','aria-label':`Cetak halaman ${page.number}`}); checked.checked=page.selected;
    checked.addEventListener('change',()=>{page.selected=checked.checked;updateSummary()});
    const pageButton=el('button',{type:'button',class:'page-link','aria-label':`Pratinjau halaman ${page.number}`},`Hal. ${page.number}`);
    pageButton.addEventListener('click',()=>showPreview(index));
    const size=el('span',{},`${page.paper} · ${page.width.toFixed(0)} × ${page.height.toFixed(0)} mm`);
    const select=el('select',{class:'row-mode','aria-label':`Mode halaman ${page.number}`,title:`Perkiraan cakupan warna ${ (page.coverage*100).toFixed(2) }% dari halaman`});
    select.append(el('option',{value:'bw'},'Hitam putih'),el('option',{value:'color'},'Warna')); select.value=page.color?'color':'bw';
    select.addEventListener('change',()=>{page.color=select.value==='color';updateSummary()});
    const copies=el('input',{class:'row-copies',type:'number',min:1,max:99,step:1,'aria-label':`Salinan halaman ${page.number}`});copies.value=page.copies;
    copies.addEventListener('change',()=>{page.copies=Math.trunc(clampInput(copies,1,99,1));copies.value=page.copies;updateSummary()});
    for(const item of [checked,pageButton,size,select,copies]) { const td=el('td');td.append(item);tr.append(td); }
    ui.pages.append(tr);
  });
}
async function showPreview(index) {
  if(!state.pdf || !state.pages[index]) return;
  const token=++state.previewToken;
  try {
    const page=await state.pdf.getPage(state.pages[index].number);
    const v=page.getViewport({scale:1}); const scale=Math.min(1.4,700/Math.max(v.width,v.height));
    const viewport=page.getViewport({scale}); const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#fff'}).promise;
    if(token!==state.previewToken) return;
    ui.preview.width=canvas.width;ui.preview.height=canvas.height;ui.preview.getContext('2d').drawImage(canvas,0,0);
    ui.preview.hidden=false;ui['preview-empty'].hidden=true;ui['preview-label'].textContent=`Halaman ${index+1} dari ${state.pages.length}`;
  } catch(error) { if(token===state.previewToken) showNotice('Pratinjau tidak dapat dibuat: '+error.message); }
}
async function inspectFile(file) {
  if(!file) return;
  if(state.printing) {showNotice('Tunggu hingga penyiapan cetak selesai sebelum mengganti dokumen.');return;}
  const token=++state.token;
  state.previewToken++;
  if(state.loadingTask) {state.loadingTask.destroy();state.loadingTask=null;}
  state.pdf=null;state.pages=[];state.name='';
  ui['file-info'].hidden=true;ui['page-count'].textContent='Belum ada file';
  ui.preview.hidden=true;ui['preview-empty'].hidden=false;ui['preview-label'].textContent='Belum ada halaman';
  drawRows();setBusy(false);
  const kind=documentKind(file.name);
  if(!kind) { showNotice('Pilih PDF atau Word .docx. Format Word lama .doc harus disimpan ulang sebagai .docx atau PDF di Word.');return; }
  setBusy(true); showNotice('Membuka PDF dan memeriksa warna halaman…');
  let loadingTask;
  try {
    let bytes=await file.arrayBuffer();
    if(kind==='docx') {
      showNotice('Mengonversi Word ke PDF di browser…');
      const {convertDocx}=await import('./docx.js');
      bytes=await convertDocx(bytes,(n,total)=>{if(token===state.token) showNotice(`Mengonversi halaman Word ${n} dari ${total}…`)});
    }
    loadingTask=pdfjs.getDocument({data:bytes});const pdf=await loadingTask.promise;
    if(token!==state.token){loadingTask.destroy();return;}
    if(pdf.numPages>300) { loadingTask.destroy();throw new Error('Dokumen melebihi 300 halaman. Bagi PDF menjadi beberapa file agar pemeriksaan tetap lancar.'); }
    const pages=[];
    for(let n=1;n<=pdf.numPages;n++) {
      const page=await pdf.getPage(n), viewport=page.getViewport({scale:1});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d',{willReadFrequently:true});
      await page.render({canvasContext:context,viewport,background:'#fff'}).promise;
      const coverage=colorCoverage(context.getImageData(0,0,canvas.width,canvas.height).data);
      const width=viewport.width*25.4/72,height=viewport.height*25.4/72;
      pages.push({number:n,width,height,paper:paperName(width,height),coverage,color:classifyColor(coverage,threshold()),selected:true,copies:1});
      canvas.width=canvas.height=0;
      if(token!==state.token){loadingTask.destroy();return;}
      showNotice(`Memeriksa halaman ${n} dari ${pdf.numPages}…`);
    }
    if(state.loadingTask) {state.loadingTask.destroy();state.loadingTask=null;}
    state.pdf=pdf;state.loadingTask=loadingTask;state.pages=pages;state.name=file.name;
    ui.filename.textContent=file.name;ui['file-detail'].textContent=`${pages.length} halaman · ${(file.size/1024/1024).toFixed(2)} MB`;
    ui['file-info'].hidden=false;ui['page-count'].textContent=`${pages.length} halaman`;
    drawRows();setBusy(false);showNotice(kind==='docx'?'Word dikonversi di browser. Periksa hasilnya: tata letak atau font dapat berbeda dari Microsoft Word.':'');await showPreview(0);
  } catch(error) {
    if(loadingTask) loadingTask.destroy();
    if(token!==state.token) return;
    setBusy(false);
    const message=error?.name==='PasswordException'?'PDF dilindungi kata sandi. Gunakan PDF yang tidak terkunci.':(error?.message||'Format PDF tidak dapat dibaca.');
    showNotice(`Dokumen tidak dapat dibuka. ${message}`);
  }
}
for(const id of ['bw-price','color-price','threshold']) {
  ui[id].addEventListener('change',()=>{const value=id==='threshold'?threshold():price(id);persist(id,value);updateSummary()});
  if(id!=='threshold') ui[id].addEventListener('input',updateSummary);
}
ui.file.addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';inspectFile(file)});
ui['change-file'].addEventListener('click',()=>ui.file.click());
const drop=document.querySelector('.drop-zone');
for(const event of ['dragenter','dragover']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover')});
for(const event of ['dragleave','drop']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover')});
drop.addEventListener('drop',e=>inspectFile(e.dataTransfer.files[0]));
ui['select-all'].addEventListener('click',()=>{state.pages.forEach(p=>p.selected=true);drawRows();updateSummary()});
ui['select-none'].addEventListener('click',()=>{state.pages.forEach(p=>p.selected=false);drawRows();updateSummary()});
ui['apply-detection'].addEventListener('click',()=>{const t=threshold();persist('threshold',t);state.pages.forEach(p=>p.color=classifyColor(p.coverage,t));drawRows();updateSummary()});
ui.print.addEventListener('click',async()=>{
  const plan=printPlan(state.pages);
  if(!state.pdf || !plan.length) return;
  if(plan.length>250) {showNotice('Maksimal 250 halaman per proses cetak. Kurangi pilihan atau jumlah salinan.');return;}
  const popup=window.open('','_blank');
  if(!popup){showNotice('Browser memblokir jendela cetak. Izinkan pop-up untuk situs ini dan coba lagi.');return;}
  popup.document.title='HY Print';
  popup.document.body.textContent='Menyiapkan halaman cetak. Mohon tunggu…';
  state.printing=true;setBusy(true);showNotice('Menyiapkan halaman untuk dialog cetak…');
  try {
    const cache=new Map();
    for(const item of plan) {
      const key=`${item.number}-${item.color}`;
      if(cache.has(key)) continue;
      const page=await state.pdf.getPage(item.number),viewport=page.getViewport({scale:2});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const ctx=canvas.getContext('2d',{willReadFrequently:!item.color});
      await page.render({canvasContext:ctx,viewport,background:'#fff'}).promise;
      if(!item.color) {
        const img=ctx.getImageData(0,0,canvas.width,canvas.height);
        for(let i=0;i<img.data.length;i+=4){const gray=Math.round(.299*img.data[i]+.587*img.data[i+1]+.114*img.data[i+2]);img.data[i]=img.data[i+1]=img.data[i+2]=gray;}
        ctx.putImageData(img,0,0);
      }
      cache.set(key,canvas.toDataURL('image/png'));canvas.width=canvas.height=0;
    }
    popup.document.head.innerHTML='<style>@page{margin:0}html,body{margin:0;padding:0} .page{height:100vh;width:100%;display:flex;align-items:center;justify-content:center;break-after:page;page-break-after:always;overflow:hidden}.page:last-child{break-after:auto;page-break-after:auto}img{width:100%;height:100%;object-fit:contain}@media screen{.page{height:100vh}}</style>';
    popup.document.body.replaceChildren();
    const images=[];
    for(const item of plan){const section=popup.document.createElement('div');section.className='page';const image=popup.document.createElement('img');image.src=cache.get(`${item.number}-${item.color}`);image.alt='';section.append(image);popup.document.body.append(section);images.push(image);}
    await Promise.all(images.map(img=>img.decode()));
    popup.focus();popup.print();
    showNotice('Dialog cetak dibuka. Pilih printer dan kertas, lalu pastikan salinan di dialog adalah 1.');
  } catch(error){popup.close();showNotice('Halaman tidak dapat disiapkan untuk cetak: '+(error.message||'kesalahan tidak diketahui'));}
  finally{state.printing=false;setBusy(false);}
});
updateSummary();




