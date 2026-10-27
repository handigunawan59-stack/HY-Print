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
export function calculate(pages, bwPrice, colorPrice) {
  let bw=0,color=0;
  for(const p of pages) if(p.selected) { if(p.color) color+=p.copies; else bw+=p.copies; }
  return {bw,color,total:bw*bwPrice+color*colorPrice};
}
export function printPlan(pages) {
  return pages.flatMap(p=>p.selected ? Array.from({length:p.copies},()=>({number:p.number,color:p.color})) : []);
}
export function documentKind(name) {
  const suffix = name.toLowerCase().split('.').pop();
  return suffix === 'pdf' || suffix === 'docx' ? suffix : null;
}
export function pageOverflow(renderedHeight, pageHeight) {
  return Number.isFinite(pageHeight) && pageHeight > 0 && renderedHeight > pageHeight + 3;
}
