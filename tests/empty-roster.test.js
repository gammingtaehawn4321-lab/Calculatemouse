'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(__dirname + '/../app.js','utf8');
const injection = 'window.__test = { defaults, sanitize, isUntouchedLegacyRoster, getState: () => state };';
assert(src.includes('  initBackgroundParticles();\n  initControls();')); 
const script = src.replace('  initBackgroundParticles();\n  initControls();', injection);
function load(seed) {
  const store = { ...(seed || {}) };
  const window = { KkoaengiCalc:{}, CloudRoster:{} };
  const ctx = {
    window, navigator:{},
    localStorage:{ getItem:k=>store[k] || null, setItem:(k,v)=>{store[k]=v} },
    document:{ getElementById:()=>null },
    Date, Number, String, Array, Math, JSON, RegExp, Error,
    console,
  };
  vm.runInNewContext(script,ctx);
  return { t:window.__test,store };
}
const fresh = load();
assert.equal(fresh.t.defaults().members.length,0);
assert.equal(fresh.t.getState().members.length,0);
assert.equal(fresh.t.sanitize({members:[]}).members.length,0);
// Reproduce the exact starter roster as saved by the old application.
const starterNames=['쩰리','까꿍','제니','유교','타격','구슬요','끄르','달리는곰돌이','루시퍼','봉수','시티즌2','빙하','빙제','빙결','빙왕'];
function legacy(n,i) {return {id:'mtest'+i,name:n,active:i<3,bonus:0,minScore:0,profileRevision:0,
  region:{pirate:0,cat:0,wolf:0,food:0},
  boss:{mode:'ratio',ratio:i===0?33.34:i<3?33.33:0,time:500},strike:{mode:'time',time:500,score:0}};}
const pristine = starterNames.map(legacy);
const key='gyesanjungiji-mobile-v3';
const migrated=load({[key]:JSON.stringify({version:2,members:pristine,bossHp:500000,speed:2,serverBonus:0,region:'pirate'})});
assert.equal(migrated.t.getState().members.length,0);
assert.equal(JSON.parse(migrated.store[key]).members.length,0);
const edited = JSON.parse(JSON.stringify(pristine));
edited[0].bonus=3;
const preserved=load({[key]:JSON.stringify({version:2,members:edited,bossHp:500000,speed:2,serverBonus:0,region:'pirate'})});
assert.equal(preserved.t.getState().members.length,15);
console.log('PASS: first run empty, old untouched roster cleared, user-edited roster preserved');
