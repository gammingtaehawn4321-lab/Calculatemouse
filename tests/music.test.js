'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class MockElement {
  constructor(id) { this.id=id; this.listeners={}; this.attrs={}; this.classList={toggle:()=>{}}; this.textContent=''; this.value='24'; }
  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
  dispatch(name, data) { for(const fn of this.listeners[name] || []) fn(data||{target:this}); }
  setAttribute(name,value) { this.attrs[name]=String(value); }
}
const ids=['siteBgm','musicToggle','musicIcon','musicText','musicVolume','musicLive'];
const elements=Object.fromEntries(ids.map(id=>[id,new MockElement(id)]));
const audio=elements.siteBgm;
audio.paused=true; audio.volume=0; audio.loop=false;
audio.play=()=>{ audio.paused=false; audio.dispatch('play');return Promise.resolve(); };
audio.pause=()=>{ audio.paused=true; audio.dispatch('pause'); };
const handlers={};
const local=new Map();
const sandbox={
  document:{getElementById:id=>elements[id], addEventListener:(name,fn)=>{handlers[name]=fn;}},
  localStorage:{getItem:key=>local.get(key)||null, setItem:(key,val)=>local.set(key,val)},
  Element:MockElement,
  console,
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../music.js'),'utf8'),sandbox);
assert.equal(audio.loop,true);
assert.equal(audio.volume,.24);
setImmediate(()=>{
  assert.equal(audio.paused,false);
  assert.equal(elements.musicToggle.attrs['aria-pressed'],'true');
  elements.musicToggle.dispatch('click');
  assert.equal(audio.paused,true);
  assert.match(local.get('calculatemouse-bgm-preferences-v1'),/"enabled":false/);
  // Gesture should not restart music after an explicit pause.
  handlers.pointerdown({target:elements.musicVolume});
  assert.equal(audio.paused,true);
  elements.musicVolume.value='65';
  elements.musicVolume.dispatch('input');
  assert.equal(audio.volume,.65);
  elements.musicToggle.dispatch('click');
  setImmediate(()=>{
    assert.equal(audio.paused,false);
    console.log('PASS: loop, playback, pause preference, volume controls');
  });
});
