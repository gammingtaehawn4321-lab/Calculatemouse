'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/../server/Code.gs','utf8');
const db=[['mtestone','첫째',10,5,1,2,3,4,1],['mtesttwo','둘째',20,0,0,0,0,0,1]];
let revision=1, ids=0;
const ctx={Date,Number,String,Array,Math,JSON,RegExp,Error,isFinite,console,
  SpreadsheetApp:{flush(){}},
  Utilities:{getUuid:()=>`abcd1234-1234-1234-1234-00000000000${++ids}`}};
vm.createContext(ctx);
vm.runInContext(code,ctx);
const sheet={
 appendRow(row){db.push(row)},deleteRow(r){db.splice(r-2,1)},
 getRange(row,col){return {setValue(value){db[row-2][col-1]=value;}}}
};
const meta={getRange(){return {setValue(value){revision=value;}}}};
ctx.sheetData=()=>({sheet,meta,rows:db.map(r=>r.slice()),revision});
ctx.getSnapshot=()=>ctx.snapshot(ctx.sheetData());
let r=ctx.mutate('id',{type:'update',id:'mtestone',field:'bonus',value:44,expectedRevision:1});
assert(r.ok);assert.equal(db[0][2],44);assert.equal(db[0][8],2);assert.equal(r.revision,2);
r=ctx.mutate('id',{type:'update',id:'mtestone',field:'bonus',value:99,expectedRevision:1});
assert.equal(r.error,'CONFLICT');assert.equal(db[0][2],44);
r=ctx.mutate('id',{type:'update',id:'mtesttwo',field:'cat',value:70,expectedRevision:1});
assert(r.ok);assert.equal(db[1][5],70);assert.equal(revision,3);
r=ctx.mutate('id',{type:'add',name:'셋째',bonus:1,group:3});
assert(r.ok);assert.equal(db.length,3);assert.equal(db[2][1],'셋째');assert.equal(db[2][9],3);assert.equal(r.members[2].group,3);
r=ctx.mutate('id',{type:'add',name:'첫째',bonus:0});
assert.equal(r.error,'DUPLICATE');assert.equal(db.length,3);
assert.throws(()=>ctx.mutate('id',{type:'update',id:'mtestone',field:'bonus',value:-5,expectedRevision:2}),/Invalid numeric value/);
assert.equal(db[0][2],44);
r=ctx.mutate('id',{type:'update',id:'mtesttwo',field:'group',value:4,expectedRevision:2});
assert(r.ok);assert.equal(db[1][9],4);
r=ctx.mutate('id',{type:'delete',id:'mtestone',expectedRevision:2});
assert(r.ok);assert.equal(db.length,2);
r=ctx.mutate('id',{type:'delete',id:'mtestone',expectedRevision:2});
assert.equal(r.error,'NOT_FOUND');
console.log('PASS: shared server add, update, conflict detection, duplicate, validation, delete');
