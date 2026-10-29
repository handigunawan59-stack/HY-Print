/** Parse 1-based page numbers and inclusive ranges into unique ascending numbers. */
export function parsePageRange(input, pageCount) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100000) {
    throw new Error('Jumlah halaman dokumen tidak valid.');
  }
  if (typeof input !== 'string' || !input.trim() || input.length > 10000) {
    throw new Error('Masukkan nomor halaman, misalnya 1-3, 5.');
  }
  // Mark interval boundaries rather than expanding each repeated range.
  const boundaries = new Int32Array(pageCount + 2);
  for (const part of input.split(',')) {
    const match = part.trim().match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
    if (!match) throw new Error('Format halaman salah. Contoh: 1-3, 5.');
    const first = Number(match[1]);
    const last = match[2] === undefined ? first : Number(match[2]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last > pageCount) {
      throw new Error(`Nomor halaman harus antara 1 dan ${pageCount}.`);
    }
    if (last < first) throw new Error('Urutan rentang salah. Contoh: 2-5.');
    boundaries[first]++;
    boundaries[last + 1]--;
  }
  const pages = [];
  let active = 0;
  for (let n = 1; n <= pageCount; n++) {
    active += boundaries[n];
    if (active > 0) pages.push(n);
  }
  return pages;
}

