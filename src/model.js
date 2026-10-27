const sizes = [['A4',210,297], ['A3',297,420], ['A5',148,210], ['Letter',215.9,279.4], ['Legal',215.9,355.6], ['F4',210,330]];
export function paperName(w,h) {
  const [short,long] = [w,h].sort((a,b)=>a-b);
  return sizes.find(([,a,b])=>Math.abs(short-Math.min(a,b))<=2 && Math.abs(long-Math.max(a,b))<=2)?.[0] ?? 'Kustom';
}
export function classifyColor(coverage, thresholdPercent) { return coverage >= thresholdPercent / 100; }
export function colorCoverage(rgba) {
  let colored=0;
  for(let i=0;i<rgba.length;i+=4) {
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    if(Math.max(r,g,b)-Math.min(r,g,b)>=30 && Math.min(r,g,b)<240) colored++;
  }
  return rgba.length ? colored/(rgba.length/4) : 0;
}
// Only purely white pixels count as blank. Preserve even very faint marks.
export function isBlankPage(rgba) {
  if (!rgba.length || rgba.length % 4 !== 0) return false;
  for (let i=0; i<rgba.length; i+=4) {
    if (rgba[i] !== 255 || rgba[i+1] !== 255 || rgba[i+2] !== 255) return false;
  }
  return true;
}
// A low-resolution white preview is insufficient evidence on its own.
export function isBlankFromEvidence(lowResolution, textItems, highResolution) {
  if (!isBlankPage(lowResolution) || !Array.isArray(textItems)) return false;
  if (textItems.some(item => typeof item.str === 'string' && item.str.trim())) return false;
  return !!highResolution && isBlankPage(highResolution);
}
export function calculate(pages, bwPrice, colorPrice) {
  let bw=0,color=0;
  for(const p of pages) if(p.selected && !p.blank) { if(p.color) color+=p.copies; else bw+=p.copies; }
  return {bw,color,total:bw*bwPrice+color*colorPrice};
}
export function printPlan(pages, reverse = false) {
  const ordered = reverse ? [...pages].reverse() : pages;
  return ordered.flatMap(p=>p.selected && !p.blank ? Array.from({length:p.copies},()=>({number:p.number,color:p.color})) : []);
}
// A reversing driver cancels an already reversed document; compensate once.
export function reverseForDriver(desiredReverse, driverReverses) {
  return Boolean(desiredReverse) !== Boolean(driverReverses);
}
export function printPreferences(storage) {
  const defaults={reverse:true,driverReverse:true};
  try {
    const saved=JSON.parse(storage.getItem('hyprint.printPreferences') || 'null');
    if (saved && ['reverse','driverReverse'].every(key=>typeof saved[key]==='boolean')) return {reverse:saved.reverse,driverReverse:saved.driverReverse};
  } catch {}
  return defaults;
}
export function storePrintPreferences(storage, preferences) {
  try {storage.setItem('hyprint.printPreferences',JSON.stringify(preferences));} catch {}
}
export function documentKind(name) {
  const suffix = name.toLowerCase().split('.').pop();
  return suffix === 'pdf' || suffix === 'docx' ? suffix : null;
}
export function pageOverflow(renderedHeight, pageHeight) {
  return Number.isFinite(pageHeight) && pageHeight > 0 && renderedHeight > pageHeight + 3;
}
export function filterPages(pages, mode = 'all', selectedOnly = false, skipBlank = false) {
  if (!['all', 'color', 'bw', 'blank'].includes(mode)) throw new RangeError('Invalid page filter');
  return pages.filter(page => (!selectedOnly || page.selected) && (!skipBlank || !page.blank)
    && (mode === 'all' || (mode === 'blank' ? page.blank : !page.blank && page.color === (mode === 'color'))));
}
export function documentSummary(pages, mode='all') {
  const printing=filterPages(pages,mode,true,true);
  const counts=calculate(printing,0,0);
  const blank=pages.filter(page=>page.blank).length;
  return {total:pages.length,blank,content:pages.length-blank,printing:printing.length,
          sheets:counts.bw+counts.color,bw:counts.bw,color:counts.color};
}

