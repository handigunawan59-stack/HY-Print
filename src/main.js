import './style.css';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {paperName, classifyColor, colorCoverage, isBlankPage, isBlankFromEvidence, calculate, documentSummary, printPlan, reverseForDriver, printPreferences, storePrintPreferences, documentKind, filterPages} from './model.js';
import {validatePasswordChange} from './admin-password.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['file','notice','file-info','filename','file-detail','page-count','pages','select-all','select-none','change-file','preview-label','doc-summary','threshold','bw-price','color-price','bw-rate','color-rate','threshold-info','settings-status','settings-retry','total','summary','print','admin-open','admin-close','admin-dialog','admin-message','login-form','admin-form','admin-password','admin-logout','preview-dialog','preview-title','preview-meta','preview-close','preview-canvas','password-details','password-form','current-password','new-password','confirm-password'].map(id=>[id,$(id)]));
const state = {pdf:null,pages:[],name:'',token:0,busy:false,printing:false,loadingTask:null,settings:null,previewFilter:'all',printFilter:'all'};
let preferences={reverse:true,driverReverse:true};
try {preferences=printPreferences(localStorage)} catch {}
$('print-order').value=preferences.reverse?'reverse':'forward';$('driver-reverse').checked=preferences.driverReverse;
function savePrintOptions(){try {storePrintPreferences(localStorage,{reverse:$('print-order').value==='reverse',driverReverse:$('driver-reverse').checked})} catch {}}
const rupiah = n => 'Rp '+new Intl.NumberFormat('id-ID').format(n);
function showNotice(text) { ui.notice.textContent=text; ui.notice.hidden=!text; }
function showAdmin(text) { ui['admin-message'].textContent=text; ui['admin-message'].hidden=!text; }
function clampInput(input,min,max,fallback) {
  const n=Number(input.value); const value=Number.isFinite(n) && input.value!=='' ? Math.max(min,Math.min(max,n)) : fallback;
  input.value=value; return value;
}
function updateSummary() {
  const pages=filterPages(state.pages,state.printFilter,true,true);
  const values=calculate(pages,state.settings?.bwPrice??0,state.settings?.colorPrice??0);
  const counts=documentSummary(state.pages,state.printFilter);
  ui.total.textContent=rupiah(values.total);
  ui['doc-summary'].textContent=counts.total?`Total ${counts.total} halaman · ${counts.blank} kosong · ${counts.content} berisi`:'Belum ada dokumen';
  ui.summary.textContent=counts.total?`${counts.printing} halaman dipilih · ${counts.sheets} halaman cetak · ${counts.bw} hitam putih · ${counts.color} warna`:'Belum ada halaman untuk dicetak';
  ui.print.disabled=state.busy || !state.pdf || !state.settings || values.bw+values.color===0;
}
function setBusy(value) {
  state.busy=value; document.body.classList.toggle('busy',value);
  ui['select-all'].disabled=value || !state.pages.length;
  ui['select-none'].disabled=value || !state.pages.length;
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
  const visible=filterPages(state.pages,state.previewFilter);
  ui['preview-label'].textContent=state.pages.length?`${visible.length} dari ${state.pages.length} halaman`:'Belum ada halaman';
  if(!visible.length) {ui.pages.append(el('p',{class:'empty'},state.pages.length?'Tidak ada halaman yang sesuai pilihan ini.':'Pilih dokumen untuk melihat halaman di sini.'));return;}
  visible.forEach(page=>{
    const tile=el('article',{class:'page-tile'}),imageArea=el('button',{type:'button',class:'tile-image','aria-label':`Perbesar pratinjau halaman ${page.number}`});
    imageArea.addEventListener('click',()=>showPreview(page));
    const image=el('img',{src:page.thumb,alt:`Pratinjau halaman ${page.number}`,class:page.color?'':'bw'});imageArea.append(image);
    const header=el('div',{class:'tile-head'}),label=el('label');
    const check=el('input',{type:'checkbox','aria-label':`Cetak halaman ${page.number}`});check.checked=page.selected && !page.blank;check.disabled=page.blank;
    check.addEventListener('change',()=>{page.selected=check.checked;updateSummary()});label.append(check,document.createTextNode(`Hal. ${page.number}`));
    header.append(label,el('span',{},page.paper));
    const controls=el('div',{class:'tile-controls'});
    const mode=el('select',{'aria-label':`Warna cetak halaman ${page.number}`,title:`Warna pada halaman sekitar ${(page.coverage*100).toFixed(2)}%`});
    mode.append(el('option',{value:'bw'},'Hitam putih'),el('option',{value:'color'},'Warna'));mode.value=page.color?'color':'bw';
    mode.addEventListener('change',()=>{page.color=mode.value==='color';drawRows();updateSummary()});
    const copies=el('input',{type:'number',min:1,max:99,step:1,'aria-label':`Salinan halaman ${page.number}`});copies.value=page.copies;
    copies.addEventListener('change',()=>{page.copies=Math.trunc(clampInput(copies,1,99,1));copies.value=page.copies;updateSummary()});
    const blank=el('select',{'aria-label':`Status halaman kosong ${page.number}`,title:'Periksa halaman ini dan ubah jika perlu'});
    blank.append(el('option',{value:'content'},'Ada isi'),el('option',{value:'blank'},'Kosong'));blank.value=page.blank?'blank':'content';
    blank.addEventListener('change',()=>{page.blank=blank.value==='blank';drawRows();updateSummary()});
    controls.append(mode,copies);tile.append(imageArea,header,controls,blank);ui.pages.append(tile);
  });
}
let previewToken=0;
async function showPreview(page) {
  if(!state.pdf)return;
  const token=++previewToken;
  ui['preview-title'].textContent=`Halaman ${page.number}`;
  ui['preview-meta'].textContent=`${page.paper} · ${page.width.toFixed(0)} × ${page.height.toFixed(0)} mm · ${page.color?'Warna':'Hitam putih'}`;
  ui['preview-canvas'].width=1;ui['preview-canvas'].height=1;
  if(!ui['preview-dialog'].open)ui['preview-dialog'].showModal();
  try {
    const pdfPage=await state.pdf.getPage(page.number),base=pdfPage.getViewport({scale:1});
    const viewport=pdfPage.getViewport({scale:Math.min(2,1300/Math.max(base.width,base.height))});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport,background:'#fff'}).promise;
    if(token!==previewToken)return;
    ui['preview-canvas'].width=canvas.width;ui['preview-canvas'].height=canvas.height;ui['preview-canvas'].classList.toggle('bw',!page.color);
    ui['preview-canvas'].getContext('2d').drawImage(canvas,0,0);
  } catch(error){if(token===previewToken){ui['preview-dialog'].close();showNotice('Halaman tidak bisa ditampilkan: '+error.message)}}
}
ui['preview-close'].addEventListener('click',()=>ui['preview-dialog'].close());
ui['preview-dialog'].addEventListener('close',()=>previewToken++);
function applySettings(value,{reclassify=false}={}) {
  if(!Number.isFinite(value.threshold)||value.threshold<.1||value.threshold>100||!Number.isInteger(value.bwPrice)||value.bwPrice<0||value.bwPrice>10000000||!Number.isInteger(value.colorPrice)||value.colorPrice<0||value.colorPrice>10000000) throw new Error('Data pengaturan tidak valid.');
  state.settings=value;
  ui['bw-rate'].textContent=rupiah(value.bwPrice);ui['color-rate'].textContent=rupiah(value.colorPrice);ui['threshold-info'].textContent=`${value.threshold} %`;
  ui.threshold.value=value.threshold;ui['bw-price'].value=value.bwPrice;ui['color-price'].value=value.colorPrice;
  ui['settings-status'].textContent='';ui['settings-retry'].hidden=true;
  if(reclassify){state.pages.forEach(p=>p.color=classifyColor(p.coverage,value.threshold));drawRows();}
  updateSummary();
}
async function loadSettings({reclassify=false}={}) {
  ui['settings-status'].textContent='Memuat pengaturan admin…';ui['settings-retry'].hidden=true;
  try {
    const response=await fetch('/api/settings',{cache:'no-store'});
    if(!response.ok) throw new Error('Pengaturan belum tersedia.');
    const value=await response.json();
    applySettings(value,{reclassify});return true;
  } catch(error) {
    state.settings=null;ui['bw-rate'].textContent='—';ui['color-rate'].textContent='—';ui['threshold-info'].textContent='—';
    ui['settings-status'].textContent='Pengaturan tidak dapat dimuat. Periksa koneksi, lalu coba lagi.';ui['settings-retry'].hidden=false;updateSummary();return false;
  }
}
async function api(path,options={}) {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...options.headers}});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok) {const error=new Error(response.status===429?'Terlalu banyak percobaan. Coba lagi nanti.':response.status===401?'Sesi tidak aktif atau kata sandi salah.':'Permintaan gagal. Periksa koneksi dan coba lagi.');error.status=response.status;throw error;}
  return data;
}
async function openAdmin() {
  showAdmin('');ui['login-form'].hidden=true;ui['admin-form'].hidden=true;ui['password-details'].hidden=true;ui['admin-dialog'].showModal();
  try {await api('/api/admin/session');setAdminAuthenticated(true);} catch(error) {setAdminAuthenticated(false);if(error.status!==401)showAdmin(error.message);}
}
function setAdminAuthenticated(authenticated) {
  ui['login-form'].hidden=authenticated;
  ui['admin-form'].hidden=!authenticated;
  ui['password-details'].hidden=!authenticated;
  if(!authenticated) { ui['password-form'].reset();ui['password-details'].open=false; }
}
ui['admin-open'].addEventListener('click',openAdmin);
ui['admin-close'].addEventListener('click',()=>{ui['admin-password'].value='';ui['admin-dialog'].close()});
ui['admin-dialog'].addEventListener('close',()=>{ui['admin-password'].value='';ui['password-form'].reset();ui['password-details'].open=false;showAdmin('')});
ui['password-details'].addEventListener('toggle',()=>{if(!ui['password-details'].open)ui['password-form'].reset()});
ui['login-form'].addEventListener('submit',async event=>{
  event.preventDefault();showAdmin('');const button=ui['login-form'].querySelector('button');button.disabled=true;
  try {await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:ui['admin-password'].value})});ui['admin-password'].value='';setAdminAuthenticated(true);}
  catch(error){showAdmin(error.message)} finally{button.disabled=false;}
});
ui['admin-form'].addEventListener('submit',async event=>{
  event.preventDefault();showAdmin('');const button=ui['admin-form'].querySelector('button[type=submit]');button.disabled=true;
  try {
    const threshold=Number(ui.threshold.value),bwPrice=Number(ui['bw-price'].value),colorPrice=Number(ui['color-price'].value);
    const result=await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({threshold,bwPrice,colorPrice})});
    applySettings(result.settings,{reclassify:true});
    showAdmin('Pengaturan disimpan. Warna halaman diperiksa kembali. Perubahan mungkin belum langsung muncul di perangkat lain.');
  } catch(error){showAdmin(error.message);if(error.status===401)setAdminAuthenticated(false);} finally{button.disabled=false;}
});
ui['password-form'].addEventListener('submit',async event=>{
  event.preventDefault();showAdmin('');
  const currentPassword=ui['current-password'].value,newPassword=ui['new-password'].value;
  const validation=validatePasswordChange(currentPassword,newPassword,ui['confirm-password'].value);
  if(validation){showAdmin(validation);return;}
  const button=ui['password-form'].querySelector('button[type=submit]');button.disabled=true;
  try {
    await api('/api/admin/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
    setAdminAuthenticated(false);
    showAdmin('Kata sandi berhasil diubah. Masuk kembali dengan kata sandi baru.');
  } catch(error){
    if(error.status===401 || error.status===409){setAdminAuthenticated(false);showAdmin('Sesi berakhir atau kata sandi telah berubah. Masuk kembali.');}
    else if(error.status===403)showAdmin('Kata sandi saat ini salah atau permintaan tidak diizinkan.');
    else if(error.status===400)showAdmin('Kata sandi baru harus berbeda dari sebelumnya dan terdiri dari 12–256 karakter.');
    else showAdmin(error.message);
  } finally{button.disabled=false;}
});
ui['admin-logout'].addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST'});setAdminAuthenticated(false);showAdmin('Anda telah keluar.')}catch(error){showAdmin(error.message)}});
ui['settings-retry'].addEventListener('click',()=>loadSettings({reclassify:true}));
async function inspectFile(file) {
  if(!file) return;
  if(state.printing) {showNotice('Tunggu sampai dokumen siap dicetak sebelum memilih dokumen lain.');return;}
  const token=++state.token;
  if(state.loadingTask) {state.loadingTask.destroy();state.loadingTask=null;}
  state.pdf=null;state.pages=[];state.name='';
  ui['file-info'].hidden=true;ui['page-count'].textContent='Belum ada dokumen';
  drawRows();setBusy(false);
  const kind=documentKind(file.name);
  if(!kind) { showNotice('Pilih PDF atau Word .docx. Format Word lama .doc harus disimpan ulang sebagai .docx atau PDF di Word.');return; }
  if(!state.settings){showNotice('Pengaturan harga belum tersedia. Periksa koneksi lalu coba lagi.');return;}
  setBusy(true); showNotice('Membuka dokumen dan memeriksa setiap halaman…');
  let loadingTask;
  try {
    let bytes=await file.arrayBuffer();
    if(kind==='docx') {
      showNotice('Mengubah Word menjadi PDF…');
      const {convertDocx}=await import('./docx.js');
      bytes=await convertDocx(bytes,(n,total)=>{if(token===state.token) showNotice(`Mengubah halaman Word ${n} dari ${total}…`)});
    }
    loadingTask=pdfjs.getDocument({data:bytes});const pdf=await loadingTask.promise;
    if(token!==state.token){loadingTask.destroy();return;}
    if(pdf.numPages>300) { loadingTask.destroy();throw new Error('Dokumen melebihi 300 halaman. Bagi PDF menjadi beberapa dokumen agar pemeriksaan tetap lancar.'); }
    const pages=[];
    for(let n=1;n<=pdf.numPages;n++) {
      const page=await pdf.getPage(n), viewport=page.getViewport({scale:1});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d',{willReadFrequently:true});
      await page.render({canvasContext:context,viewport,background:'#fff'}).promise;
      const pixelData=context.getImageData(0,0,canvas.width,canvas.height).data;
      const coverage=colorCoverage(pixelData);
      let blank=false;
      if (isBlankPage(pixelData)) {
        try {
          const text=await page.getTextContent();
          if (Array.isArray(text.items) && !text.items.some(item=>typeof item.str==='string' && item.str.trim())) {
            const highViewport=page.getViewport({scale:2});
            if (highViewport.width * highViewport.height <= 32000000) {
              const high=document.createElement('canvas');
              high.width=Math.ceil(highViewport.width);high.height=Math.ceil(highViewport.height);
              const highContext=high.getContext('2d',{willReadFrequently:true});
              await page.render({canvasContext:highContext,viewport:highViewport,background:'#fff'}).promise;
              blank=isBlankFromEvidence(pixelData,text.items,highContext.getImageData(0,0,high.width,high.height).data);
              high.width=high.height=0;
            }
          }
        } catch { blank=false; }
      }
      const width=viewport.width*25.4/72,height=viewport.height*25.4/72;
      const scale=Math.min(180/canvas.width,210/canvas.height,1),thumb=document.createElement('canvas');
      thumb.width=Math.max(1,Math.round(canvas.width*scale));thumb.height=Math.max(1,Math.round(canvas.height*scale));thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
      pages.push({number:n,width,height,paper:paperName(width,height),coverage,color:classifyColor(coverage,state.settings.threshold),blank,selected:true,copies:1,thumb:thumb.toDataURL('image/jpeg',.78)});
      canvas.width=canvas.height=thumb.width=thumb.height=0;
      if(token!==state.token){loadingTask.destroy();return;}
      showNotice(`Memeriksa halaman ${n} dari ${pdf.numPages}…`);
    }
    if(state.loadingTask) {state.loadingTask.destroy();state.loadingTask=null;}
    state.pdf=pdf;state.loadingTask=loadingTask;state.pages=pages;state.name=file.name;
    ui.filename.textContent=file.name;ui['file-detail'].textContent=`${pages.length} halaman · ${(file.size/1024/1024).toFixed(2)} MB`;
    ui['file-info'].hidden=false;ui['page-count'].textContent=`${pages.length} halaman`;
    drawRows();setBusy(false);showNotice(kind==='docx'?'Word sudah diubah menjadi PDF. Periksa hasilnya karena tata letak atau huruf bisa berbeda.':'');
  } catch(error) {
    if(loadingTask) loadingTask.destroy();
    if(token!==state.token) return;
    setBusy(false);
    const message=error?.name==='PasswordException'?'PDF dilindungi kata sandi. Gunakan PDF yang tidak terkunci.':(error?.message||'Dokumen tidak bisa dibaca.');
    showNotice(`Dokumen tidak dapat dibuka. ${message}`);
  }
}
ui.file.addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';inspectFile(file)});
ui['change-file'].addEventListener('click',()=>ui.file.click());
const drop=document.querySelector('.drop-zone');
for(const event of ['dragenter','dragover']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover')});
for(const event of ['dragleave','drop']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover')});
drop.addEventListener('drop',e=>inspectFile(e.dataTransfer.files[0]));
ui['select-all'].addEventListener('click',()=>{state.pages.forEach(p=>p.selected=true);drawRows();updateSummary()});
ui['select-none'].addEventListener('click',()=>{state.pages.forEach(p=>p.selected=false);drawRows();updateSummary()});
for(const button of document.querySelectorAll('[data-preview-filter]'))button.addEventListener('click',()=>{state.previewFilter=button.dataset.previewFilter;document.querySelectorAll('[data-preview-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))});drawRows()});
for(const button of document.querySelectorAll('[data-print-filter]'))button.addEventListener('click',()=>{state.printFilter=button.dataset.printFilter;document.querySelectorAll('[data-print-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))});updateSummary()});
$('print-order').addEventListener('change',savePrintOptions);
$('driver-reverse').addEventListener('change',savePrintOptions);
ui.print.addEventListener('click',async()=>{
  const reverse=reverseForDriver($('print-order').value==='reverse',$('driver-reverse').checked);
  const plan=printPlan(filterPages(state.pages,state.printFilter,true,true),reverse);
  if(!state.pdf || !state.settings || !plan.length) return;
  if(plan.length>250) {showNotice('Maksimal 250 halaman cetak setiap kali mencetak. Kurangi halaman atau jumlah salinan.');return;}
  const popup=window.open('','_blank');
  if(!popup){showNotice('Jendela cetak diblokir. Izinkan jendela baru untuk situs ini, lalu coba lagi.');return;}
  popup.document.title='HY Print';
  popup.document.body.textContent='Menyiapkan halaman cetak. Mohon tunggu…';
  state.printing=true;setBusy(true);showNotice('Menyiapkan halaman untuk dicetak…');
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
    showNotice('Jendela cetak terbuka. Pilih printer dan kertas, lalu pilih 1 salinan.');
  } catch(error){popup.close();showNotice('Halaman belum siap dicetak: '+(error.message||'kesalahan tidak diketahui'));}
  finally{state.printing=false;setBusy(false);}
});
loadSettings();
