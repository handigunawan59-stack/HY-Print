import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOrder, planOrder } from '../src/order.js';

const documents = [
  {id:'doc-a', pages:[{number:1,selected:true,blank:false,color:false,copies:2},{number:2,selected:true,blank:true,color:false,copies:1}]},
  {id:'doc-b', pages:[{number:1,selected:true,blank:false,color:true,copies:3},{number:2,selected:false,blank:false,color:false,copies:1}]}
];

test('sum all documents while excluding blank and unselected pages',()=>{
  assert.deepEqual(summarizeOrder(documents,'all',500,1500),{documents:2,total:4,blank:1,content:3,printing:2,sheets:5,bw:2,color:3,totalPrice:5500});
});

test('build the print sequence across documents without mixing same page numbers',()=>{
  assert.deepEqual(planOrder(documents,'all',false),[
    {documentId:'doc-a',number:1,color:false},{documentId:'doc-a',number:1,color:false},
    {documentId:'doc-b',number:1,color:true},{documentId:'doc-b',number:1,color:true},{documentId:'doc-b',number:1,color:true}
  ]);
});

test('reverse full order of pages across documents while preserving copies',()=>{
  assert.deepEqual(planOrder(documents,'all',true).map(p=>p.documentId), ['doc-b','doc-b','doc-b','doc-a','doc-a']);
});

test('color filter includes only color pages from all documents',()=>{
  assert.deepEqual(summarizeOrder(documents,'color',500,1500),{documents:2,total:4,blank:1,content:3,printing:1,sheets:3,bw:0,color:3,totalPrice:4500});
});

test('select a range only in the chosen document and preserve selection on invalid input', async()=>{
  const {applyRange} = await import('../src/order.js');
  const pages=[{number:1,selected:true},{number:2,selected:true},{number:3,selected:true}];
  applyRange(pages,'2-3');
  assert.deepEqual(pages.map(p=>p.selected),[false,true,true]);
  assert.throws(()=>applyRange(pages,'1-7'));
  assert.deepEqual(pages.map(p=>p.selected),[false,true,true]);
});

test('bulk settings affect selected nonblank pages and leave unchanged values intact', async()=>{
  const {applyBulk} = await import('../src/order.js');
  const pages=[{selected:true,blank:false,color:false,copies:1},{selected:true,blank:true,color:false,copies:1},{selected:false,blank:false,color:false,copies:1}];
  applyBulk(pages,{color:true});
  assert.deepEqual(pages,[{selected:true,blank:false,color:true,copies:1},{selected:true,blank:true,color:false,copies:1},{selected:false,blank:false,color:false,copies:1}]);
  applyBulk(pages,{copies:3});
  assert.equal(pages[0].copies,3);
  assert.throws(()=>applyBulk(pages,{color:false,copies:100}));
  assert.equal(pages[0].color,true);
});

test('an unapplied range in any document blocks the order until it is applied or cleared', async()=>{
  const {hasPendingRange}=await import('../src/order.js');
  assert.equal(hasPendingRange([{rangeDirty:false},{rangeDirty:true}]),true);
  assert.equal(hasPendingRange([{rangeDirty:false},{rangeDirty:false}]),false);
});
