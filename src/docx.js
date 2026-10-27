import {pageOverflow} from './model.js';

/** Render DOCX inside a script-disabled, network-restricted frame and create a raster PDF. */
export async function convertDocx(bytes, onProgress=()=>{}) {
  const [{renderAsync}, {default:html2canvas}, {jsPDF}] = await Promise.all([
    import('docx-preview'), import('html2canvas'), import('jspdf')
  ]);
  const frame=document.createElement('iframe');
  frame.setAttribute('sandbox','allow-same-origin');
  frame.setAttribute('aria-hidden','true');
  frame.tabIndex=-1;
  Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'1200px',height:'1000px',border:'0',pointerEvents:'none'});
  frame.srcdoc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data: blob:"></head><body><div id="styles"></div><div id="document"></div></body></html>`;
  const ready=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(new Error('File Word tidak dapat disiapkan. Coba lagi atau simpan sebagai PDF di Word.'));});
  document.body.append(frame);
  try {
    await ready;
    const doc=frame.contentDocument;
    await renderAsync(bytes,doc.getElementById('document'),doc.getElementById('styles'),{
      inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:false,renderHeaders:true,renderFooters:true,renderComments:false,renderAltChunks:false,useBase64URL:true
    });
    await doc.fonts.ready;
    const images=[...doc.images];
    await Promise.all(images.map(image=>image.decode().catch(()=>{})));
    const sections=[...doc.querySelectorAll('.docx-wrapper > section.docx')];
    if(!sections.length) throw new Error('Halaman Word tidak dapat dibaca. Simpan dokumen sebagai PDF di Word.');
    if(sections.length>100) throw new Error('File Word lebih dari 100 halaman. Simpan dokumen sebagai PDF di Word, lalu buka PDF tersebut.');
    for(const section of sections) {
      const expectedHeight=parseFloat(doc.defaultView.getComputedStyle(section).minHeight);
      if(section.scrollHeight>section.clientHeight+3 || pageOverflow(section.getBoundingClientRect().height,expectedHeight)) throw new Error('Isi Word terlalu panjang untuk diproses di sini. Simpan dokumen sebagai PDF di Word agar tidak ada isi yang terpotong.');
    }
    let result;
    for(let i=0;i<sections.length;i++) {
      onProgress(i+1,sections.length);
      const section=sections[i];const rect=section.getBoundingClientRect();
      if(rect.width<1||rect.height<1||rect.width>2500||rect.height>3500) throw new Error('Ukuran halaman Word tidak dapat diproses. Simpan dokumen sebagai PDF di Word.');
      const width=rect.width*.75,height=rect.height*.75,orientation=width>height?'landscape':'portrait';
      const canvas=await html2canvas(section,{backgroundColor:'#fff',scale:1.5,useCORS:false,allowTaint:false,logging:false});
      if(!result) result=new jsPDF({unit:'pt',format:[width,height],orientation,compress:true});
      else result.addPage([width,height],orientation);
      result.addImage(canvas.toDataURL('image/jpeg',.94),'JPEG',0,0,width,height,undefined,'FAST');
      canvas.width=canvas.height=0;
    }
    return result.output('arraybuffer');
  } finally { frame.remove(); }
}

