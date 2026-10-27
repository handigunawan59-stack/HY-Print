import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyColor, paperName, calculate, colorCoverage, printPlan } from '../src/model.js';

test('paper names tolerate rotated dimensions and show custom for unknown', () => {
  assert.equal(paperName(297, 210), 'A4');
  assert.equal(paperName(210, 330), 'F4');
  assert.equal(paperName(100, 100), 'Kustom');
});
test('threshold ignores small color coverage', () => {
  assert.equal(classifyColor(0.009, 1), false);
  assert.equal(classifyColor(0.01, 1), true);
});
test('color coverage counts visibly saturated pixels', () => {
  assert.equal(colorCoverage(new Uint8ClampedArray([255, 0, 0, 255, 220, 220, 220, 255])), 0.5);
});
test('only selected pages count and copies determine total', () => {
  const pages = [{selected:true,color:false,copies:3}, {selected:true,color:true,copies:2}, {selected:false,color:true,copies:9}];
  assert.deepEqual(calculate(pages, 500, 1500), {bw:3,color:2,total:4500});
});
test('print plan repeats selected pages in document order with color mode', () => {
  assert.deepEqual(printPlan([{number:1,selected:true,color:false,copies:2},{number:2,selected:false,color:true,copies:1},{number:3,selected:true,color:true,copies:1}]), [{number:1,color:false},{number:1,color:false},{number:3,color:true}]);
});

test('recognizes supported document formats and rejects legacy .doc', async () => {
  const { documentKind } = await import('../src/model.js');
  assert.equal(documentKind('invoice.PDF'), 'pdf');
  assert.equal(documentKind('invoice.docx'), 'docx');
  assert.equal(documentKind('invoice.doc'), null);
});

test('rejects rendered Word page that grew beyond its original page height', async () => {
  const { pageOverflow } = await import('../src/model.js');
  assert.equal(pageOverflow(1122, 1122), false);
  assert.equal(pageOverflow(1300, 1122), true);
});

test('print and preview filters use effective page color and preserve selection', async () => {
  const { filterPages } = await import('../src/model.js');
  const pages = [
    {number:1, selected:true, color:false, copies:2},
    {number:2, selected:true, color:true, copies:1},
    {number:3, selected:false, color:true, copies:1},
  ];
  assert.deepEqual(filterPages(pages, 'all').map(p => p.number), [1, 2, 3]);
  assert.deepEqual(filterPages(pages, 'color').map(p => p.number), [2, 3]);
  assert.deepEqual(filterPages(pages, 'bw').map(p => p.number), [1]);
  assert.deepEqual(filterPages(pages, 'color', true).map(p => p.number), [2]);
});
