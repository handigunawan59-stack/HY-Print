import {filterPages, calculate} from './model.js';
import {parsePageRange} from './page-range.js';

export function hasPendingRange(documents) {
  return documents.some(doc => doc.rangeDirty === true);
}

export function summarizeOrder(documents, mode, bwPrice, colorPrice) {
  const pages = documents.flatMap(doc => doc.pages);
  const printable = filterPages(pages, mode, true, true);
  const values = calculate(printable, bwPrice, colorPrice);
  const blank = pages.filter(page => page.blank).length;
  return {documents:documents.length, total:pages.length, blank, content:pages.length-blank,
    printing:printable.length, sheets:values.bw+values.color, bw:values.bw,
    color:values.color, totalPrice:values.total};
}

export function planOrder(documents, mode, reverse=false) {
  const pages = documents.flatMap(doc => filterPages(doc.pages,mode,true,true).map(page=>({documentId:doc.id,...page})));
  if (reverse) pages.reverse();
  return pages.flatMap(page=>Array.from({length:page.copies},()=>({documentId:page.documentId,number:page.number,color:page.color})));
}

export function applyRange(pages, text) {
  const selected = new Set(parsePageRange(text, pages.length));
  for (const page of pages) page.selected = selected.has(page.number);
}

export function applyBulk(pages, {color, copies}) {
  if (color !== undefined && typeof color !== 'boolean') throw new TypeError('Mode warna tidak valid.');
  if (copies !== undefined && (!Number.isInteger(copies) || copies < 1 || copies > 99)) throw new RangeError('Salinan harus 1–99.');
  for (const page of pages) if (page.selected && !page.blank) {
    if (color !== undefined) page.color = color;
    if (copies !== undefined) page.copies = copies;
  }
}

