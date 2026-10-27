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

test('blank detection keeps even slight visible marks and does not consider empty data blank', async () => {
  const { isBlankPage } = await import('../src/model.js');
  assert.equal(isBlankPage(new Uint8ClampedArray([255,255,255,255, 255,255,255,255])), true);
  assert.equal(isBlankPage(new Uint8ClampedArray([255,255,255,255, 245,245,245,255])), false);
  assert.equal(isBlankPage(new Uint8ClampedArray([255,255,255,255, 0,0,0,255])), false);
  assert.equal(isBlankPage(new Uint8ClampedArray()), false);
});

test('skip blank excludes only selected blank pages from print and estimates', async () => {
  const { filterPages } = await import('../src/model.js');
  const pages = [{number:1, selected:true, color:false, blank:true, copies:2}, {number:2, selected:true, color:false, blank:false, copies:1}, {number:3, selected:true, color:true, blank:false, copies:3}];
  assert.deepEqual(filterPages(pages,'all',true,true).map(p => p.number), [2,3]);
  assert.deepEqual(filterPages(pages,'bw',true,true).map(p => p.number), [2]);
  assert.deepEqual(filterPages(pages,'blank').map(p => p.number), [1]);
  assert.deepEqual(calculate(filterPages(pages,'all',true,true),500,1500), {bw:1,color:3,total:5000});
  pages[0].blank=false; // operator corrected the detection
  assert.deepEqual(filterPages(pages,'bw',true,true).map(p => p.number), [1,2]);
});

test('reverse print prepares selected pages last to first and keeps each page copies together', () => {
  const pages=[{number:1,selected:true,color:false,copies:2},{number:2,selected:false,color:false,copies:1},{number:3,selected:true,color:true,copies:2}];
  assert.deepEqual(printPlan(pages, true), [{number:3,color:true},{number:3,color:true},{number:1,color:false},{number:1,color:false}]);
  assert.deepEqual(pages.map(page=>page.number), [1,2,3]);
});

test('blank detector does not discard a page containing one extremely pale colored mark', async () => {
  const { isBlankPage } = await import('../src/model.js');
  assert.equal(isBlankPage(new Uint8ClampedArray([255,255,255,255, 254,255,255,255])), false);
});

test('compensates for driver page reversal to maintain the requested final order', async () => {
  const { reverseForDriver } = await import('../src/model.js');
  assert.equal(reverseForDriver(true,false), true);
  assert.equal(reverseForDriver(true,true), false);
  assert.equal(reverseForDriver(false,true), true);
  assert.equal(reverseForDriver(false,false), false);
});

test('print preferences default to reversed driver compensation and preserve user choices', async () => {
  const { printPreferences, storePrintPreferences } = await import('../src/model.js');
  const values=new Map();
  const storage={getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value)};
  assert.deepEqual(printPreferences(storage), {reverse:true,driverReverse:true,skipBlank:false});
  storePrintPreferences(storage, {reverse:false,driverReverse:false,skipBlank:true});
  assert.deepEqual(printPreferences(storage), {reverse:false,driverReverse:false,skipBlank:true});
});
