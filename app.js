/* 상층 1구역 계산 및 2단계 보상 추첨. 독립된 순수 함수. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZoneOneEngine=api;
})(typeof window!=='undefined'?window:undefined, function(){
  'use strict';
  const SHARES=Object.freeze({1:30,2:25,3:25,4:20});
  const MONSTERS=Object.freeze(['격전쥐','유령 꿀벌','유령 꽃게','유령 토끼']);
  const FINITE=(n,min=0,max=1e9)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):min;
  function calculate(entries, options={}){
    const speed=Number(options.speed)===1?1:2;
    const mode=options.inputMode==='final'?'final':'raw';
    const serverBonus=FINITE(options.serverBonus,0,1000000);
    const lossPerKnock=FINITE(options.lossPerKnock,0,100);
    const factor=speed===2?0.9571:1;
    const people=entries.map(m=>{
      const raw=FINITE(m.raw,0,100);
      const bonus=FINITE(m.bonus,0,1000000)+FINITE(m.zone1Bonus,0,1000000);
      const knocks=Math.floor(FINITE(m.knocks,0,100));
      const adjusted=mode==='final'?raw:raw*(1+(bonus+serverBonus)/100)*factor*Math.pow(1-lossPerKnock/100,knocks);
      return {id:String(m.id),name:String(m.name),group:Number(m.group)||0,raw,knocks,bonus,effective:adjusted};
    });
    const total=people.reduce((s,p)=>s+p.effective,0);
    return {people,total,remaining:Math.max(0,100-total),overCap:total>100.000001,speed,inputMode:mode};
  }
  function groupQuotas(count){
    if(!Number.isSafeInteger(count)||count<0)throw new Error('보상 수량이 잘못되었습니다.');
    const result={};let allocated=0;
    const leftovers=[];
    for(let g=1;g<=4;g++){
      const exact=count*SHARES[g]/100;
      const floored=Math.floor(exact);
      result[g]=floored;allocated+=floored;
      leftovers.push({group:g,frac:exact-floored});
    }
    leftovers.sort((a,b)=>b.frac-a.frac||a.group-b.group);
    for(let i=0;i<count-allocated;i++)result[leftovers[i].group]++;
    return result;
  }
  function pickWeighted(options, weight, random){
    let total=0;const scores=options.map(x=>{let w=Math.max(0,weight(x));total+=w;return w});
    if(total<=0)return null;
    const r=Math.min(.999999999999,Math.max(0,random()))*total;
    let acc=0;
    for(let i=0;i<options.length;i++){
      acc+=scores[i];if(r<acc)return options[i];
    }
    return options[options.length-1];
  }
  // 1차: 보상 *개수*를 30/25/25/20으로 최대 잔여 방식으로 확정.
  // 2차: 각 보상 단위가 군에 무작위 귀속되고, 해당 군 안에서 기여도/가치를 가중한 추첨.
  function draw({members,items},rng=Math.random){
    if(!Array.isArray(members)||!Array.isArray(items))throw new Error('추첨 입력이 올바르지 않습니다.');
    const safeItems=items.map((item,i)=>({
      id:String(item.id??i),name:String(item.name||'').trim(),
      quantity:Number(item.quantity),value:Number(item.value)
    }));
    if(safeItems.some(x=>!x.name||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>2000||!Number.isFinite(x.value)||x.value<=0||x.value>1e9))
      throw new Error('보상 이름·개수(1~2000)·가치(0 초과)를 확인하세요.');
    const totalCount=safeItems.reduce((s,x)=>s+x.quantity,0);
    if(totalCount>2000)throw new Error('한 번에 추첨할 보상은 총 2000개 이하로 입력하세요.');
    const people=members.filter(m=>Number(m.group)>=1&&Number(m.group)<=4).map(m=>({
      id:String(m.id),name:String(m.name),group:Number(m.group),effective:FINITE(m.effective,0,100),
      won:[],wonValue:0,wonCount:0
    }));
    const quota=groupQuotas(totalCount);
    const left={...quota};
    const groupStats={};for(let g=1;g<=4;g++)groupStats[g]={group:g,quota:quota[g],assigned:0,distributed:0,held:0,value:0};
    const rewards=[];const held=[];
    const maxValue=Math.max(1,...safeItems.map(x=>x.value));
    const units=[];
    for(const item of safeItems)for(let i=0;i<item.quantity;i++)units.push(item);
    // Value affects second-stage selection; randomized order prevents input ordering bias.
    for(let i=units.length-1;i>0;i--){const j=Math.floor(Math.max(0,Math.min(.999999999999,rng()))*(i+1));[units[i],units[j]]=[units[j],units[i]];}
    const totalValue=units.reduce((s,x)=>s+x.value,0);
    for(const item of units){
      const groups=[1,2,3,4].filter(g=>left[g]>0);
      const group=pickWeighted(groups,g=>left[g],rng);
      if(group===null)throw new Error('군별 할당 수량 계산 오류');
      left[group]--;groupStats[group].assigned++;groupStats[group].value+=item.value;
      const eligible=people.filter(m=>m.group===group&&m.effective>0);
      if(eligible.length===0){groupStats[group].held++;held.push({group,item:item.name,value:item.value});continue;}
      const rarity=item.value/maxValue;
      const power=0.7+1.1*rarity;
      const median=totalValue/Math.max(totalCount,1);
      const selected=pickWeighted(eligible,m=>Math.pow(m.effective,power)/(1+m.wonValue/Math.max(1,median*3)),rng);
      if(!selected){groupStats[group].held++;held.push({group,item:item.name,value:item.value});continue;}
      selected.won.push({name:item.name,value:item.value});selected.wonCount++;selected.wonValue+=item.value;
      groupStats[group].distributed++;
      rewards.push({group,memberId:selected.id,memberName:selected.name,item:item.name,value:item.value});
    }
    const actualValue=Object.values(groupStats).reduce((s,g)=>s+g.value,0);
    return {quota,groupStats,people,totalCount,totalValue,actualValue,rewards,held};
  }
  return {SHARES,MONSTERS,calculate,groupQuotas,draw};
});


/* Main application */
'use strict';
(() => {
  const C = window.KkoaengiCalc;
  const STORAGE_KEY = 'gyesanjungiji-mobile-v3';
  const OLD_STORAGE_KEY = 'kkoaengi-mobile-v2';
  // Legacy names are only used to recognize and clean up untouched starter data.
  const LEGACY_STARTER_NAMES = ['쩰리','까꿍','제니','유교','타격','구슬요','끄르','달리는곰돌이','루시퍼','봉수','시티즌2','빙하','빙제','빙결','빙왕'];
  const REGIONS = [{key:'pirate',name:'해적'},{key:'cat',name:'고양이'},{key:'wolf',name:'늑대'},{key:'food',name:'음식'}];
  const BOSSES = [{name:'바나냥',hp:500000,symbol:'✦',tag:'BOSS I'},{name:'루나',hp:450000,symbol:'☾',tag:'BOSS II'},{name:'루니',hp:400000,symbol:'✧',tag:'BOSS III'},{name:'루이',hp:350000,symbol:'◆',tag:'BOSS IV'}];
  const $ = id => document.getElementById(id);
  const fmt = v => Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '-';
  const pct = v => Number.isFinite(v) ? `${v.toFixed(2).replace(/\.?0+$/,'')}%` : '-';
  const tstr = t => t === null ? '계산 불가' : `${Math.floor(t/60).toLocaleString('ko-KR')}분 ${t%60}초`;
  const clamp = (raw, max = 1e9) => { const v = Number(raw); return Number.isFinite(v) ? Math.min(max, Math.max(0,v)) : 0; };
  const escapeHtml = raw => String(raw).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let idCounter = 0;
  const makeId = () => `m${Date.now().toString(36)}x${(++idCounter).toString(36)}`;
  function member(name, active = false) {
    return {id:makeId(),name,active,group:0,bonus:0,zone1Bonus:0,zone2Bonus:0,minScore:0,region:{pirate:0,cat:0,wolf:0,food:0},
      profileRevision:0,boss:{mode:'ratio',ratio:0,time:500},strike:{mode:'time',time:500,score:0}};
  }
  function defaults() {
    return {version:2,members:[],mode:'boss',bossHp:500000,speed:2,serverBonus:0,region:'pirate'};
  }
  // Preserve any user changes; only erase the exact, never-edited 15-member starter roster.
  function isUntouchedLegacyRoster(members) {
    if (!Array.isArray(members) || members.length !== LEGACY_STARTER_NAMES.length) return false;
    return members.every((m,i) => {
      if (m.name !== LEGACY_STARTER_NAMES[i] || m.bonus !== 0 || m.minScore !== 0 || m.profileRevision !== 0 || m.active !== (i<3)) return false;
      if (!REGIONS.every(r => m.region[r.key] === 0)) return false;
      const expectedRatio = i===0 ? 33.34 : i<3 ? 33.33 : 0;
      return m.boss.mode === 'ratio' && m.boss.ratio === expectedRatio && m.boss.time === 500 &&
        m.strike.mode === 'time' && m.strike.time === 500 && m.strike.score === 0;
    });
  }
  function sanitize(value) {
    if (!value || !Array.isArray(value.members) || value.members.length > 200) throw new Error('잘못된 백업 형식이거나 인원이 너무 많습니다.');
    const names = new Set(), ids = new Set();
    const members = value.members.map(m => {
      if (!m || typeof m.name !== 'string' || !m.name.trim() || m.name.trim().length > 30) throw new Error('길드원 이름이 잘못되었습니다.');
      const name = m.name.trim();
      if (names.has(name.toLowerCase())) throw new Error('중복된 길드원 이름이 있습니다.');
      names.add(name.toLowerCase());
      const safe = member(name, m.active === true);
      if (typeof m.id === 'string' && /^m[a-z0-9x]{1,40}$/.test(m.id) && !ids.has(m.id)) safe.id = m.id;
      ids.add(safe.id);
      safe.group = [1,2,3,4].includes(Number(m.group)) ? Number(m.group) : 0;
      safe.profileRevision = Number.isSafeInteger(m.profileRevision) ? Math.max(0,m.profileRevision) : 0;
      safe.bonus = clamp(m.bonus,1e6);
      safe.zone1Bonus = clamp(m.zone1Bonus,1e6);
      safe.zone2Bonus = clamp(m.zone2Bonus,1e6);
      safe.minScore = clamp(m.minScore);
      for (const r of REGIONS) safe.region[r.key] = clamp(m.region && m.region[r.key],1e6);
      const b = m.boss || {}, s = m.strike || {};
      safe.boss = {mode:b.mode === 'time' ? 'time':'ratio',ratio:clamp(b.ratio,1e6),time:clamp(b.time)};
      safe.strike = {mode:s.mode === 'score'?'score':'time',time:clamp(s.time),score:clamp(s.score)};
      return safe;
    });
    return {version:2,members,mode:value.mode === 'strike'?'strike':'boss',bossHp:Math.max(1,clamp(value.bossHp)),
      speed:Number(value.speed) === 1?1:2,serverBonus:clamp(value.serverBonus,1e6),
      region:REGIONS.some(r=>r.key === value.region)?value.region:'pirate'};
  }
  let state;
  try { state = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY))) } catch { state = defaults(); }
  if (isUntouchedLegacyRoster(state.members)) {
    state.members = [];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  let currentTab = 'home';
  let memberFilter = 'all';
  let calcZone = ['one','two','strike'].includes(localStorage.getItem('gyesanjungiji-calc-zone')) ? localStorage.getItem('gyesanjungiji-calc-zone') : 'one';
  const cloud = window.CloudRoster;
  function mergeSharedRoster(serverMembers) {
    // Do not synchronize local per-user calculations, active flags or fight presets.
    const oldById = new Map(state.members.map(m=>[m.id,m]));
    const oldByName = new Map(state.members.map(m=>[m.name.toLocaleLowerCase(),m]));
    const updated = serverMembers.map(remote=>{
      const previous=oldById.get(remote.id)||oldByName.get(String(remote.name).toLocaleLowerCase());
      const m=previous?{...previous,region:{...previous.region},boss:{...previous.boss},strike:{...previous.strike}}:member(String(remote.name),false);
      m.id=String(remote.id);m.name=String(remote.name);m.bonus=clamp(remote.bonus,1e6);
      m.zone1Bonus=clamp(remote.zone1Bonus,1e6);m.zone2Bonus=clamp(remote.zone2Bonus,1e6);
      m.minScore=clamp(remote.minScore);m.group=[1,2,3,4].includes(Number(remote.group))?Number(remote.group):0;m.profileRevision=Number(remote.profileRevision)||1;
      for(const r of REGIONS)m.region[r.key]=clamp(remote.region?.[r.key],1e6);
      return m;
    });
    state.members=sanitize({...state,members:updated}).members;
    save();
    if(currentTab==='calc')renderCalc();
    if(currentTab==='members')renderManagement();
    if(window.ZoneOneUI)window.ZoneOneUI.render();
  }
  function updatePermissions() {
    const readOnly=cloud.sharedMode()&&!cloud.canEdit();
    const add=$('addMember');if(add)add.disabled=readOnly;
    document.querySelectorAll('[data-delete-id],[data-manage="name"],[data-manage="bonus"],[data-manage="zone1Bonus"],[data-manage="zone2Bonus"],[data-manage="minScore"],'+
      '[data-manage="pirate"],[data-manage="cat"],[data-manage="wolf"],[data-manage="food"],[data-manage="group"],'+
      '[data-field="bonus"],[data-field="zone2Bonus"],[data-field="region"]').forEach(el=>el.disabled=readOnly);
  }
  function refreshVisible() {if(currentTab==='calc')renderCalc();if(currentTab==='members')renderManagement();}

  function initBackgroundParticles() {
    if (document.getElementById('particleLayer')) return;
    const layer = document.createElement('div');
    layer.id = 'particleLayer';
    layer.setAttribute('aria-hidden','true');
    document.body.prepend(layer);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    const count = reduce ? 6 : (mobile ? 12 : 18);
    for (let i = 0; i < count; i++) {
      const node = document.createElement('span');
      node.className = 'hamster-particle';
      const size = Math.round(34 + Math.random()*54);
      const left = Math.random()*100;
      const opacity = (0.12 + Math.random()*0.18).toFixed(2);
      const drift = `${Math.round((Math.random()*2-1)*90)}px`;
      const rotate = `${Math.round((Math.random()*2-1)*220)}deg`;
      const duration = `${Math.round(18 + Math.random()*22)}s`;
      const delay = `${Math.round(Math.random()*-36)}s`;
      const blur = `${(Math.random()*1.4).toFixed(2)}px`;
      node.style.left = `${left}%`;
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.style.animationDuration = duration;
      node.style.animationDelay = delay;
      node.style.setProperty('--particle-opacity', opacity);
      node.style.setProperty('--particle-drift', drift);
      node.style.setProperty('--particle-rotate', rotate);
      node.style.filter = `blur(${blur}) drop-shadow(0 4px 10px rgba(255,211,242,.12))`;
      layer.appendChild(node);
    }
  }

  let toastTimer;
  function notify(message) {
    const el = $('toast'); el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; },3100);
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
    catch { notify('자동 저장에 실패했습니다. 저장 공간을 확인해 주세요.'); }
    document.dispatchEvent(new Event('guild:updated'));
  }
  const activeMembers = () => state.members.filter(m => m.active);
  let z2MemberFilter = 'all';
  let z2MemberSearch = '';
  function changeTab(tab) {
    currentTab = tab;
    for (const name of ['home','calc','members','data']) {
      $(name+'Tab').hidden = name!==tab;
      document.querySelector(`[data-tab="${name}"]`).setAttribute('aria-selected',name===tab?'true':'false');
    }
    if(tab==='calc') {renderCalc();selectCalcZone(calcZone);}
    if(tab==='members') renderManagement();
    if(tab==='data') renderRemaining();
    updatePermissions();
    window.scrollTo(0,0);
  }
  function selectCalcZone(zone) {
    calcZone=['one','two','strike'].includes(zone)?zone:'one';
    localStorage.setItem('gyesanjungiji-calc-zone',calcZone);
    $('zoneOnePanel').hidden=calcZone!=='one';
    $('zoneTwoPanel').hidden=calcZone==='one';
    document.querySelectorAll('[data-calc-zone]').forEach(b=>{
      const on=b.dataset.calcZone===calcZone;
      b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));
    });
    if(calcZone!=='one'){
      state.mode=calcZone==='strike'?'strike':'boss';
      save();renderCalc();
    }else if(window.ZoneOneUI)window.ZoneOneUI.render();
  }
  function initControls() {
    $('bossPresets').innerHTML = BOSSES.map(b=>`<button class="z2-boss-choice" type="button" data-boss-hp="${b.hp}" aria-pressed="false"><span class="z2-boss-symbol" aria-hidden="true">${b.symbol}</span><span class="z2-boss-name">${b.name}</span><span class="z2-boss-caption">${b.tag}</span></button>`).join('');
    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click',()=>changeTab(btn.dataset.tab)));
    document.querySelectorAll('[data-open-tab]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.openZone)calcZone=btn.dataset.openZone;changeTab(btn.dataset.openTab)}));
    document.querySelectorAll('[data-calc-zone]').forEach(btn=>btn.addEventListener('click',()=>selectCalcZone(btn.dataset.calcZone)));
    document.querySelectorAll('[data-filter-group]').forEach(btn=>btn.addEventListener('click',()=>{memberFilter=btn.dataset.filterGroup;renderManagement()}));
    $('bossMode').addEventListener('click',()=>{state.mode='boss';save();renderCalc()});
    $('strikeMode').addEventListener('click',()=>{state.mode='strike';save();renderCalc()});
    $('bossHp').addEventListener('input',e=>{state.bossHp = Math.max(1,clamp(e.target.value));save();updateOutputs()});
    $('speed').addEventListener('change',e=>{state.speed = Number(e.target.value)===1?1:2;save();updateOutputs()});
    $('serverBonus').addEventListener('input',e=>{state.serverBonus=clamp(e.target.value,1e6);save();updateOutputs()});
    document.querySelectorAll('[data-z2-speed]').forEach(btn=>btn.addEventListener('click',()=>{
      state.speed=Number(btn.dataset.z2Speed)===1?1:2;
      $('speed').value=String(state.speed);
      save();renderZ2Speed();updateOutputs();
    }));
    document.querySelectorAll('[data-z2-filter]').forEach(btn=>btn.addEventListener('click',()=>{
      z2MemberFilter=btn.dataset.z2Filter;
      renderZ2Roster();
    }));
    $('z2MemberSearch').addEventListener('input',e=>{z2MemberSearch=e.target.value.trim().toLocaleLowerCase();renderZ2Roster();});
    $('z2SelectShown').addEventListener('click',()=>{
      const shown=state.members.filter(z2MemberVisible);
      if(!shown.length){notify('선택할 길드원이 없습니다.');return;}
      shown.forEach(m=>{m.active=true});save();renderCalc();
      notify(`${shown.length}명을 참여 인원으로 선택했어요.`);
    });
    $('z2ClearActive').addEventListener('click',()=>{
      state.members.forEach(m=>{m.active=false});save();renderCalc();notify('참여 인원을 모두 해제했어요.');
    });
    $('region').addEventListener('change',e=>{state.region=e.target.value;save();renderCalc()});
    $('bossPresets').addEventListener('click',e=>{const b=e.target.closest('[data-boss-hp]');if(!b)return;state.bossHp=Number(b.dataset.bossHp);save();renderCalc()});
    $('manageJump').addEventListener('click',()=>changeTab('members'));
    $('memberToggles').addEventListener('click',e=>{
      const btn=e.target.closest('[data-toggle-id]');if(!btn)return;
      const m=state.members.find(m=>m.id===btn.dataset.toggleId);if(!m)return;
      m.active=!m.active;save();renderCalc();
    });
    $('equalRatio').addEventListener('click',()=>distribute('equal'));
    $('bonusRatio').addEventListener('click',()=>distribute('bonus'));
    $('equalTime').addEventListener('click',()=>distribute('time'));
    $('calcMemberCards').addEventListener('input',onCalcInput);
    $('calcMemberCards').addEventListener('change',onCalcInput);
    $('addMember').addEventListener('click',addMember);
    $('newName').addEventListener('keydown',e=>{if(e.key==='Enter')addMember()});
    $('manageMembers').addEventListener('input',onManageInput);
    $('manageMembers').addEventListener('change',onManageInput);
    $('manageMembers').addEventListener('click',onManageClick);
    ['remainingMin','remainingSec','targetMin','targetSec'].forEach(id=>$(id).addEventListener('input',renderRemaining));
    $('copySummary').addEventListener('click',copySummary);
    $('exportButton').addEventListener('click',exportJson);
    $('showBackup').addEventListener('click',()=>{const area=$('backupArea');area.hidden=!area.hidden;if(!area.hidden){$('backupText').value=JSON.stringify({...state,zoneOne:JSON.parse(localStorage.getItem('gyesanjungiji-zone1-v1')||'null')},null,2);$('backupText').select()}});
    $('importFile').addEventListener('change',importJson);
    $('resetButton').addEventListener('click',()=>{
      if(cloud.sharedMode()){
        if(!confirm('이 기기의 계산 설정만 초기화할까요? 공용 길드원과 격추값은 유지됩니다.'))return;
        state.members.forEach((m,i)=>{m.active=i<3;m.boss={mode:'ratio',ratio:i<3?(i===0?33.34:33.33):0,time:500};m.strike={mode:'time',time:500,score:0};});
        state.mode='boss';state.bossHp=500000;state.speed=2;state.serverBonus=0;state.region='pirate';
      }else {
        if(!confirm('모든 길드원과 격추 데이터를 삭제하고 빈 목록으로 초기화할까요?'))return;state=defaults();
      }
      save();notify('이 기기의 설정을 초기화했습니다.');changeTab('calc');
    });
    cloud.init({acceptRoster:mergeSharedRoster,notify,rerender:refreshVisible,updatePermissions});
    renderCalc();
    changeTab('home');
  }
  function renderZ2Speed() {
    document.querySelectorAll('[data-z2-speed]').forEach(btn=>{
      const active=Number(btn.dataset.z2Speed)===state.speed;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',String(active));
    });
  }
  function z2MemberVisible(m) {
    const correctGroup=z2MemberFilter==='all'||String(Number(m.group)||0)===z2MemberFilter;
    const correctName=!z2MemberSearch||m.name.toLocaleLowerCase().includes(z2MemberSearch);
    return correctGroup&&correctName;
  }
  function renderZ2Roster() {
    document.querySelectorAll('[data-z2-filter]').forEach(btn=>{
      const active=btn.dataset.z2Filter===z2MemberFilter;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',String(active));
    });
    const visible=state.members.filter(z2MemberVisible);
    $('memberToggles').innerHTML=visible.map(m=>{
      const group=Number(m.group)||0;
      return `<button class="z2-member-toggle ${m.active?'active':''}" data-toggle-id="${m.id}" type="button" aria-pressed="${m.active}"><span class="z2-member-avatar" aria-hidden="true">${escapeHtml(m.name.slice(0,1))}</span><span class="z2-member-info"><strong>${escapeHtml(m.name)}</strong><small>${group?group+'군':'미지정'} · 기본+2구역 ${pct(m.bonus+m.zone2Bonus)}</small></span><span class="z2-member-check" aria-hidden="true">${m.active?'✓':'+'}</span></button>`;
    }).join('');
    $('z2RosterEmpty').hidden=visible.length>0;
    $('activeCount').textContent=`(${activeMembers().length}/${state.members.length})`;
  }
  function renderCalc() {
    const boss=state.mode==='boss';
    $('bossMode').classList.toggle('active',boss);
    $('strikeMode').classList.toggle('active',!boss);
    $('z2BossPanel').hidden=!boss;
    $('bossControls').hidden=!boss;
    $('regionControls').hidden=boss;
    $('autoActions').hidden=!boss;
    $('z2HeroTitle').textContent=boss?'상층 2구역':'일격 점수';
    $('z2HeroDesc').textContent=boss?'격추값과 소요 시간을 맞춰 길드원의 공략을 배분하세요.':'지역별 격추값과 전투 시간으로 예상 점수를 계산하세요.';
    $('z2PlayersHeading').textContent=boss?'개인별 공략 배분':'개인별 일격 점수';
    $('bossHp').value=state.bossHp;
    $('speed').value=String(state.speed);
    $('serverBonus').value=state.serverBonus;
    $('region').value=state.region;
    renderZ2Speed();
    $('bossPresets').querySelectorAll('[data-boss-hp]').forEach(btn=>{
      const active=Number(btn.dataset.bossHp)===state.bossHp;
      btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
    });
    renderZ2Roster();
    $('emptyCalc').hidden=activeMembers().length!==0;
    $('calcMemberCards').innerHTML=activeMembers().map((m,i)=>{
      const obj=boss?m.boss:m.strike;
      const mode=boss?(obj.mode==='time'?'time':'ratio'):(obj.mode==='score'?'score':'time');
      const inputField=mode==='ratio'?'ratio':mode==='score'?'score':'time';
      const label={ratio:'담당 비율 (%)',time:'사용 시간 (초)',score:'목표 점수'}[inputField];
      const group=Number(m.group)||0;
      const regionBonus=!boss?`<div class="field"><label for="z2-region-${i}">지역 격추값 (%)</label><input id="z2-region-${i}" type="number" inputmode="decimal" min="0" step="0.01" data-field="region" data-id="${m.id}" value="${m.region[state.region]}"></div>`:'';
      return `<article class="card z2-player-card" data-member-id="${m.id}">
        <div class="z2-player-top"><div class="z2-player-identity"><span class="z2-player-avatar" aria-hidden="true">${escapeHtml(m.name.slice(0,1))}</span><div><h3>${escapeHtml(m.name)}</h3><span class="z2-player-badge">${group?group+'군':'미지정'}</span></div></div><span class="z2-player-number">#${String(i+1).padStart(2,'0')}</span></div>
        <div class="z2-player-fields">
          <div class="field"><label for="z2-bonus-${i}">기본 격추값 (%)</label><div class="z2-input-suffix"><input id="z2-bonus-${i}" type="number" inputmode="decimal" min="0" step="0.01" data-id="${m.id}" data-field="bonus" value="${m.bonus}"><span>%</span></div></div>
          ${boss?`<div class="field"><label for="z2-additional-${i}">상층 2구역 추가 격추 (%)</label><div class="z2-input-suffix"><input id="z2-additional-${i}" type="number" inputmode="decimal" min="0" step="0.01" data-id="${m.id}" data-field="zone2Bonus" value="${m.zone2Bonus}"><span>%</span></div></div>`:''}
          ${regionBonus}
          <div class="field"><label for="z2-mode-${i}">계산 방식</label><select id="z2-mode-${i}" data-field="mode" data-id="${m.id}">${(boss?['ratio','time']:['time','score']).map(v=>`<option value="${v}" ${mode===v?'selected':''}>${{ratio:'담당 비율',time:'사용 시간',score:'목표 점수'}[v]}</option>`).join('')}</select></div>
          <div class="field"><label for="z2-target-${i}">${label}</label><input id="z2-target-${i}" type="number" inputmode="decimal" min="0" step="0.01" data-field="${inputField}" data-id="${m.id}" value="${obj[inputField]}"></div>
        </div>
        <div class="z2-player-result" id="out-${m.id}" aria-live="polite"></div>
        ${m.minScore>0?`<p class="z2-player-minscore">최소 점수 +${fmt(m.minScore)}</p>`:''}
      </article>`;
    }).join('');
    updateOutputs();
    updatePermissions();
  }
  function onCalcInput(e) {
    const input=e.target.closest('[data-field]');if(!input)return;
    const m=state.members.find(m=>m.id===input.dataset.id);if(!m)return;
    const field=input.dataset.field;
    if(cloud.sharedMode() && (field==='bonus'||field==='zone2Bonus'||field==='region')){
      if(e.type==='input')return;
      const value=clamp(input.value,1e6);
      cloud.mutate({type:'update',id:m.id,expectedRevision:m.profileRevision,
        field:field==='region'?state.region:field,value});
      return;
    }
    if(field==='mode') {
      // Convert the currently displayed outcome before switching the input basis.
      if(state.mode==='boss') {
        const previous=C.calculateBoss(m,state.bossHp,state.serverBonus,state.speed);
        if(input.value==='time')m.boss.time=previous.seconds??0;
        else m.boss.ratio=previous.actualRatio;
        m.boss.mode=input.value;
      } else {
        const previous=C.calculateStrike(m,state.region,state.serverBonus,state.speed);
        if(input.value==='time')m.strike.time=previous.seconds??0;
        else m.strike.score=Math.ceil(previous.actual);
        m.strike.mode=input.value;
      }
      save();renderCalc();return;
    }
    const n=clamp(input.value,field==='bonus'||field==='zone2Bonus'||field==='region'?1e6:1e9);
    if(field==='bonus')m.bonus=n;
    else if(field==='zone2Bonus')m.zone2Bonus=n;
    else if(field==='region')m.region[state.region]=n;
    else if(state.mode==='boss')m.boss[field]=n;
    else m.strike[field]=n;
    save();updateOutputs();
  }
  function distribute(mode) {
    const active=activeMembers();if(!active.length){notify('참여 길드원을 선택하세요.');return;}
    if(mode==='time'){
      const t=C.commonBossTime(active,state.bossHp,state.serverBonus,state.speed);
      if(t===null){notify('현재 격추값으로 목표 HP에 도달할 수 없습니다.');return;}
      active.forEach(m=>{m.boss.mode='time';m.boss.time=t});
    } else {
      const weights=active.map(m=>mode==='bonus'?C.scorePerSecond(m.bonus+m.zone2Bonus+state.serverBonus,170,state.speed):1);
      let total=weights.reduce((a,b)=>a+b,0);
      if(total<=0){notify('격추값을 확인하세요.');return;}
      let remainder=100;
      active.forEach((m,i)=>{const ratio=i===active.length-1?Math.round(remainder*100)/100:Math.floor(weights[i]/total*10000)/100;
        m.boss.mode='ratio';m.boss.ratio=ratio;remainder-=ratio;});
    }
    save();renderCalc();notify(mode==='time'?'공통 시간을 계산했습니다.':'담당 비율을 배분했습니다.');
  }
  function updateOutputs() {
    const active=activeMembers(),boss=state.mode==='boss';let sum=0,sumRatio=0,sumTime=0,requested=0,impossible=0,minOverride=0;
    const lines=[];
    active.forEach(m=>{
      const r=boss?C.calculateBoss(m,state.bossHp,state.serverBonus,state.speed):C.calculateStrike(m,state.region,state.serverBonus,state.speed);
      sum+=r.actual;sumTime+=r.seconds??0;if(r.seconds===null)impossible++;
      sumRatio+=boss?r.actualRatio:0;
      if(boss && m.boss.mode==='ratio'){requested+=m.boss.ratio;if(r.exceededByMinimum)minOverride++;}
      if(boss && m.boss.mode==='time')requested+=r.actualRatio;
      const detail=boss
        ? `<div class="z2-result-numbers"><div><small>예상 공략 HP</small><strong>${fmt(r.actual)}</strong></div><div><small>담당 비율</small><strong>${pct(r.actualRatio)}</strong></div><div><small>소요 시간</small><strong>${tstr(r.seconds)}</strong></div></div><p class="z2-bonus-breakdown">적용 격추 ${pct(r.bonus)} · 기본 ${pct(m.bonus)} + 2구역 ${pct(m.zone2Bonus)} + 서버 ${pct(state.serverBonus)}</p><div class="z2-member-progress"><span style="width:${Math.min(100,Math.max(0,r.actualRatio))}%"></span></div>${m.boss.mode==='ratio'?`<div class="z2-result-foot">목표 HP ${fmt(r.target)}</div>`:''}`
        : `<div class="z2-result-numbers"><div><small>예상 점수</small><strong>${fmt(r.actual)}</strong></div><div><small>소요 시간</small><strong>${tstr(r.seconds)}</strong></div><div><small>총 격추</small><strong>${pct(r.bonus)}</strong></div></div>`;
      const element=$('out-'+m.id);if(element)element.innerHTML=detail;
      lines.push(`${m.name}: ${boss?`HP ${fmt(r.actual)} (${pct(r.actualRatio)})`:`점수 ${fmt(r.actual)}`}, ${tstr(r.seconds)}`);
    });
    $('sumName').textContent=boss?'총 예상 HP':'총 예상 점수';
    $('sumValue').textContent=fmt(sum);
    $('ratioName').textContent=boss?'실제 HP 비율':'총 격추 점수';
    $('ratioValue').textContent=boss?pct(sumRatio):fmt(sum);
    $('averageTime').textContent=active.length?tstr(Math.round(sumTime/active.length)):'0초';
    $('sumMembers').textContent=`${active.length}명`;
    const progress=boss?(state.bossHp>0?sum/state.bossHp*100:0):0;
    const progressSafe=Number.isFinite(progress)?Math.max(0,progress):0;
    $('z2ProgressLabel').textContent=boss?'목표 HP 달성률':'총 예상 점수';
    $('z2ProgressText').textContent=boss?pct(progressSafe):fmt(sum);
    $('z2ProgressFill').style.width=`${Math.min(100,progressSafe)}%`;
    $('z2ProgressBar').setAttribute('aria-valuenow',String(Math.round(Math.min(100,progressSafe))));
    $('z2ProgressBar').setAttribute('aria-label',boss?'예상 목표 달성률':'예상 점수 표시');
    $('z2ProgressDetail').textContent=!active.length?'참여할 길드원을 선택해 주세요.':boss?
      (sum>=state.bossHp?`목표를 ${fmt(sum-state.bossHp)} HP 초과했어요.`:`목표까지 ${fmt(state.bossHp-sum)} HP 남았어요.`):`선택 인원 ${active.length}명의 합산 점수예요.`;
    const selectedBoss=BOSSES.find(b=>b.hp===state.bossHp);
    $('z2HeroBoss').textContent=boss?(selectedBoss?selectedBoss.name:`사용자 지정 ${fmt(state.bossHp)} HP`):`${REGIONS.find(x=>x.key===state.region)?.name||'선택 지역'}`;
    $('z2HeroSpeed').textContent=`${state.speed}배속`;
    $('bossPresets').querySelectorAll('[data-boss-hp]').forEach(btn=>{
      const selected=Number(btn.dataset.bossHp)===state.bossHp;
      btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));
    });
    const warnings=[];
    if(boss&&active.length){
      if(Math.abs(requested-100)>.01)warnings.push(`목표 담당 비율의 합이 ${pct(requested)}입니다. 100%인지 확인하세요.`);
      if(Math.abs(sum-state.bossHp)>state.bossHp*.005)warnings.push(`실제 예상 HP와 보스 HP가 ${fmt(Math.abs(sum-state.bossHp))} 차이 납니다. 최소 점수 및 초 단위 올림을 확인하세요.`);
    }
    if(minOverride)warnings.push(`${minOverride}명의 최소 점수가 배정 HP를 초과합니다. 실제 담당 비율로 다시 표시했습니다.`);
    if(impossible)warnings.push(`${impossible}명은 현재 조건에서 목표 점수에 도달할 수 없습니다.`);
    $('calcWarnings').innerHTML=warnings.map(w=>`<div class="msg">${escapeHtml(w)}</div>`).join('');
    window.kkoaengiSummary=`${boss?'상층 2구역':'일격 점수'} 계산\n${boss?`보스 HP: ${fmt(state.bossHp)}\n`:''}배속 ${state.speed} · 서버 격추 ${state.serverBonus}%\n${lines.join('\n')}\n총 점수/HP: ${fmt(sum)}\n평균 시간: ${active.length?tstr(Math.round(sumTime/active.length)):'0초'}`;
  }
  function renderManagement() {
    $('totalMembers').textContent=`전체 ${state.members.length}명`;
    document.querySelectorAll('[data-filter-group]').forEach(btn=>btn.classList.toggle('active',btn.dataset.filterGroup===memberFilter));
    const visibleMembers=state.members.filter(m=>memberFilter==='all'||String(m.group||0)===memberFilter);
    $('manageMembers').innerHTML=visibleMembers.length ? `<div class="manage-grid">${visibleMembers.map(m=>`
    <div class="manage-member" data-manage-id="${m.id}"><div class="manage-name"><strong>${escapeHtml(m.name)}</strong><button class="danger" data-delete-id="${m.id}" aria-label="${escapeHtml(m.name)} 삭제">삭제</button></div>
    <div class="member-selector"><input type="checkbox" id="active-${m.id}" data-id="${m.id}" data-manage="active" ${m.active?'checked':''}><label for="active-${m.id}">계산에 참여</label></div>
    <div class="grid"><div class="field"><label>길드원 이름</label><input data-id="${m.id}" data-manage="name" maxlength="30" type="text" value="${escapeHtml(m.name)}"></div>
    <div class="field"><label>소속 군</label><select data-id="${m.id}" data-manage="group">${[0,1,2,3,4].map(g=>`<option value="${g}" ${Number(m.group)===g?'selected':''}>${g?g+'군':'미지정'}</option>`).join('')}</select></div></div>
    <div class="grid" style="margin-top:9px"><div class="field"><label>기본 격추 (%)</label><input data-id="${m.id}" data-manage="bonus" type="number" min="0" step="0.01" value="${m.bonus}"></div>
    <div class="field"><label>최소 점수 증가</label><input data-id="${m.id}" data-manage="minScore" type="number" min="0" step="1" value="${m.minScore}"></div></div>
    <div class="grid zone-bonus-grid" style="margin-top:9px"><div class="field"><label>상층 1구역 추가 격추 (%)</label><input data-id="${m.id}" data-manage="zone1Bonus" type="number" min="0" step="0.01" value="${m.zone1Bonus}"></div>
    <div class="field"><label>상층 2구역 추가 격추 (%)</label><input data-id="${m.id}" data-manage="zone2Bonus" type="number" min="0" step="0.01" value="${m.zone2Bonus}"></div></div>
    <p class="hint">해당 구역에서 기본 격추에 추가됩니다. 두 구역의 추가 격추는 서로 합산되지 않습니다.</p>
    <div class="grid" style="margin-top:9px">${REGIONS.map(r=>`<div class="field"><label>${r.name} 지역 격추 (%)</label><input data-id="${m.id}" data-manage="${r.key}" type="number" min="0" step="0.01" value="${m.region[r.key]}"></div>`).join('')}</div>
    </div>`).join('')}</div>` : '<p class="note">이 군에 길드원이 없습니다. 위에서 새 길드원을 추가하거나 군을 변경하세요.</p>';
    updatePermissions();
  }
  function addMember() {
    const name=$('newName').value.trim();
    if(!name||name.length>30){notify('닉네임은 1~30자로 입력해 주세요.');return;}
    if(state.members.some(m=>m.name.toLowerCase()===name.toLowerCase())){notify('이미 등록된 닉네임입니다.');return;}
    if(state.members.length>=200){notify('최대 200명까지 등록할 수 있습니다.');return;}
    if(cloud.sharedMode()){
      cloud.mutate({type:'add',name,bonus:clamp($('newBonus').value,1e6),zone1Bonus:clamp($('newZone1Bonus').value,1e6),zone2Bonus:clamp($('newZone2Bonus').value,1e6),group:Number($('newGroup').value)||0}).then(ok=>{
        if(ok){$('newName').value='';$('newBonus').value=0;$('newZone1Bonus').value=0;$('newZone2Bonus').value=0;$('newGroup').value='0';renderManagement();}
      });return;
    }
    const m=member(name,false);m.bonus=clamp($('newBonus').value,1e6);m.zone1Bonus=clamp($('newZone1Bonus').value,1e6);m.zone2Bonus=clamp($('newZone2Bonus').value,1e6);m.group=Number($('newGroup').value)||0;
    state.members.push(m);$('newName').value='';$('newBonus').value=0;$('newZone1Bonus').value=0;$('newZone2Bonus').value=0;$('newGroup').value='0';save();renderManagement();notify(`${name} 추가 완료 · 계산 탭에서 참여를 선택하세요.`);
  }
  function onManageInput(e) {
    const input=e.target.closest('[data-manage]');if(!input)return;
    const m=state.members.find(m=>m.id===input.dataset.id);if(!m)return;
    const field=input.dataset.manage;
    if(cloud.sharedMode()&&field!=='active'){
      if(e.type!=='change')return;
      let value;
      if(field==='name'){
        value=input.value.trim();
        if(!value||value.length>30||state.members.some(x=>x.id!==m.id&&x.name.toLocaleLowerCase()===value.toLocaleLowerCase())){
          notify('빈 이름 또는 중복된 이름은 사용할 수 없습니다.');input.value=m.name;return;
        }
      }else value=field==='group'?Number(input.value):clamp(input.value,field==='minScore'?1e9:1e6);
      cloud.mutate({type:'update',id:m.id,expectedRevision:m.profileRevision,field,value});return;
    }
    if(field==='name') {
      if(e.type!=='change')return;
      const name=input.value.trim();
      if(!name || name.length>30 || state.members.some(x=>x.id!==m.id&&x.name.toLowerCase()===name.toLowerCase())) {
        notify('빈 이름 또는 중복된 이름은 사용할 수 없습니다.'); input.value=m.name;return;
      }
      m.name=name;save();renderManagement();return;
    }
    if(field==='active')m.active=input.checked;
    else if(field==='group'){m.group=[0,1,2,3,4].includes(Number(input.value))?Number(input.value):0;save();renderManagement();return;}
    else if(['bonus','zone1Bonus','zone2Bonus','minScore'].includes(field))m[field]=clamp(input.value,field==='minScore'?1e9:1e6);
    else if(REGIONS.some(r=>r.key===field))m.region[field]=clamp(input.value,1e6);
    save();
  }
  function onManageClick(e) {
    const btn=e.target.closest('[data-delete-id]');if(!btn)return;
    const m=state.members.find(m=>m.id===btn.dataset.deleteId);if(!m)return;
    if(!confirm(`'${m.name}' 길드원을 삭제할까요? 개인별 격추 데이터도 삭제됩니다.`))return;
    if(cloud.sharedMode()){
      cloud.mutate({type:'delete',id:m.id,expectedRevision:m.profileRevision});return;
    }
    state.members=state.members.filter(x=>x.id!==m.id);save();renderManagement();notify('길드원을 삭제했습니다.');
  }
  function renderRemaining() {
    const a=clamp($('remainingMin').value)*60+clamp($('remainingSec').value);
    const b=clamp($('targetMin').value)*60+clamp($('targetSec').value);
    $('remainingOutput').innerHTML=a>=b?`남은 시간 <strong>${tstr(Math.floor(a-b))}</strong>`:`부족 시간 <strong>${tstr(Math.floor(b-a))}</strong>`;
  }
  async function copySummary() {
    try {
      if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(window.kkoaengiSummary||'');notify('계산 결과를 복사했습니다.');return;}
    } catch {}
    const ta=document.createElement('textarea');ta.value=window.kkoaengiSummary||'';document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');notify('계산 결과를 복사했습니다.')}catch{notify('이 기기에서는 복사가 지원되지 않습니다.')};ta.remove();
  }
  function exportJson() {
    const withZoneOne={...state,zoneOne:JSON.parse(localStorage.getItem('gyesanjungiji-zone1-v1')||'null')};
    const payload=JSON.stringify(withZoneOne,null,2);
    if(window.Android && typeof window.Android.saveJson==='function') {window.Android.saveJson(payload);return;}
    const blob=new Blob([payload],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gyesanjungiji-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    notify('브라우저에서 파일 저장을 요청했습니다.');
  }
  async function importJson(e) {
    const file=e.target.files&&e.target.files[0];if(!file)return;
    try{
      if(file.size>4*1024*1024) throw new Error('백업 파일이 너무 큽니다.');
      const content=await file.text();const raw=JSON.parse(content);const imported=sanitize(raw);
      if(cloud.sharedMode())throw new Error('공용 연결 중에는 데이터 복원을 사용할 수 없습니다. 공용 연결을 해제한 뒤 복원하세요.');
      if(!confirm(`${imported.members.length}명의 백업으로 현재 데이터를 교체할까요?`))return;
      state=imported;save();
      if(raw.zoneOne&&typeof raw.zoneOne==='object'&&Array.isArray(raw.zoneOne.rewards)&&raw.zoneOne.monsters&&typeof raw.zoneOne.monsters==='object'){
        localStorage.setItem('gyesanjungiji-zone1-v1',JSON.stringify(raw.zoneOne));
      }
      notify('백업을 복원했습니다. 화면을 새로고침합니다.');window.location.reload();
    } catch(error){notify('복원 실패: '+(error.message||'백업을 확인하세요.'))}
    finally{e.target.value=''}
  }
  window.guildRosterSnapshot=()=>state.members.map(m=>({id:m.id,name:m.name,group:m.group||0,bonus:m.bonus,zone1Bonus:m.zone1Bonus}));
  window.appExportDone=success=>notify(success?'백업 파일을 저장했습니다.':'백업 저장이 취소되었거나 실패했습니다.');
  initBackgroundParticles();
  initControls();
  // External JS avoids the CSP inline-script restriction and enables offline PWA caching.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();


/* Zone 1 UI */
'use strict';
(()=>{
  const Engine=window.ZoneOneEngine;
  const $=id=>document.getElementById(id);
  const STORE='gyesanjungiji-zone1-v1';
  const fmt=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:2});
  const pct=n=>`${Number(n).toFixed(2)}%`;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asNumber=(v,max=1e9)=>Number.isFinite(Number(v))?Math.max(0,Math.min(max,Number(v))):0;
  const makeStore=()=>({monster:Engine.MONSTERS[0],monsters:{},options:{inputMode:'final',speed:1,serverBonus:0,lossPerKnock:0},rewards:[],lastDraw:null});
  let data;
  try {
    data=JSON.parse(localStorage.getItem(STORE));
    if(!data||typeof data!=='object'||!data.monsters||!Array.isArray(data.rewards))throw Error('bad');
  }catch {data=makeStore();}
  if(!Engine.MONSTERS.includes(data.monster))data.monster=Engine.MONSTERS[0];
  data.options=data.options||makeStore().options;
  if(!['raw','final'].includes(data.options.inputMode))data.options.inputMode='final';
  data.rewards=data.rewards.filter(x=>x&&typeof x.name==='string'&&Number.isSafeInteger(x.quantity)&&x.quantity>=1&&Number(x.value)>0);
  const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(data));}catch{message('저장 공간이 부족해 기여도를 보존하지 못했습니다.');}};
  let cooldown;
  function message(text){
    const toast=$('toast');if(!toast)return;
    toast.textContent=text;toast.hidden=false;clearTimeout(cooldown);cooldown=setTimeout(()=>toast.hidden=true,3500);
  }
  function current(){
    if(!data.monsters[data.monster])data.monsters[data.monster]={hp:0,entries:{}};
    return data.monsters[data.monster];
  }
  function roster(){return typeof window.guildRosterSnapshot==='function'?window.guildRosterSnapshot():[];}
  function calculation(){
    const boss=current();
    const people=roster().map(m=>{
      const stored=boss.entries[m.id]||{};
      return {...m,raw:asNumber(stored.raw,100),knocks:Math.floor(asNumber(stored.knocks,100))};
    });
    return Engine.calculate(people,data.options);
  }
  function clearDraw(){data.lastDraw=null;$('zoneOneResults').innerHTML='';}
  function renderMonsters(){
    $('monsterChoices').innerHTML=Engine.MONSTERS.map((m,i)=>`<button class="pill monster-chip ${m===data.monster?'active':''}" data-monster="${esc(m)}" aria-pressed="${m===data.monster}">${['🐭','🐝','🦀','🐇'][i]}<span>${esc(m)}</span></button>`).join('');
  }
  function renderMembers(){
    const people=roster();
    if(!people.length){
      $('zoneOneMembers').innerHTML='<div class="empty-zone"><img src="assets/note-hamster.png" alt="" loading="lazy"><p>길드원이 아직 없어요.<br>길드원 관리에서 이름과 군을 등록해 주세요.</p></div>';
      updateTotals();return;
    }
    const entries=current().entries;
    $('zoneOneMembers').innerHTML=`<div class="zone-member-list">${people.map(m=>{
      const stored=entries[m.id]||{};
      const group=m.group?`${m.group}군`:'미지정';
      return `<div class="zone-member" data-zone-member="${esc(m.id)}"><div class="zone-member-info"><strong>${esc(m.name)}</strong><span class="group-badge group-${m.group||0}">${group}</span><span class="zone-bonus-note">1구역 격추 ${pct((m.bonus||0)+(m.zone1Bonus||0))}</span></div>
      <div class="zone-member-fields"><label>기여도 (%)<input type="number" min="0" max="100" step="0.01" inputmode="decimal" data-zone-field="raw" data-member-id="${esc(m.id)}" value="${asNumber(stored.raw,100)}"></label>
      <label>격추 횟수<input type="number" min="0" max="100" step="1" inputmode="numeric" data-zone-field="knocks" data-member-id="${esc(m.id)}" value="${Math.floor(asNumber(stored.knocks,100))}"></label></div></div>`;
    }).join('')}</div>`;
    updateTotals();
  }
  function updateTotals(){
    const c=calculation(),hp=asNumber(current().hp),hasRoster=roster().length>0;
    const sumText=c.overCap?'<div class="msg">보정된 길드원 기여도 합계가 100%를 초과했습니다. 추첨 전 수치를 확인해 주세요.</div>':'';
    const remaining=c.overCap?'100% 초과':pct(c.remaining);
    $('zoneOneTotals').innerHTML=`<div class="zone-summary-grid"><div><small>길드 기여도 합계</small><strong>${pct(c.total)}</strong></div><div><small>외부·미입력 기여도</small><strong>${remaining}</strong></div><div><small>길드 기여 HP</small><strong>${hp>0?fmt(hp*c.total/100):'최대 HP 미입력'}</strong></div></div>${sumText}${hasRoster?'<p class="hint">길드원 합계가 100% 미만인 것은 정상입니다. 미지정 군은 기여율에는 포함되지만 보상 추첨 대상에서는 제외됩니다.</p>':''}`;
  }
  function renderRewardList(){
    if(!data.rewards.length){$('rewardList').innerHTML='<p class="note">획득한 보상이 아직 없습니다. 이름과 수량·가치를 등록하세요.</p>';return;}
    $('rewardList').innerHTML=`<div class="reward-list">${data.rewards.map((r,i)=>`<div class="reward-entry"><span><strong>${esc(r.name)}</strong><small> ${fmt(r.quantity)}개 · 개당 가치 ${fmt(r.value)}</small></span><button class="danger small" data-delete-reward="${i}" aria-label="${esc(r.name)} 제거">삭제</button></div>`).join('')}</div>`;
  }
  function renderResult(){
    const r=data.lastDraw;
    if(!r){$('zoneOneResults').innerHTML='';return;}
    const groupRows=[1,2,3,4].map(g=>{
      const s=r.groupStats[g];
      return `<tr><td>${g}군</td><td>${Engine.SHARES[g]}%</td><td>${s.assigned}개</td><td>${s.distributed}개</td><td>${s.held}개</td><td>${fmt(s.value)}</td></tr>`;
    }).join('');
    const peopleRows=r.people.filter(m=>m.wonCount>0).sort((a,b)=>a.group-b.group||b.wonValue-a.wonValue).map(m=>{
      const summary=m.won.map(x=>`${x.name} (${fmt(x.value)})`).join(', ');
      return `<tr><td>${m.group}군</td><td>${esc(m.name)}</td><td>${pct(m.effective)}</td><td>${m.wonCount}</td><td>${fmt(m.wonValue)}</td><td class="item-list">${esc(summary)}</td></tr>`;
    }).join('');
    $('zoneOneResults').innerHTML=`<div class="draw-result"><h3>추첨 결과</h3><p class="note">총 ${r.totalCount}개 · 총 가치 ${fmt(r.totalValue)} · 실제 지급 ${r.rewards.length}개 · 보류 ${r.held.length}개</p>
    <h3>1차 군별 할당</h3><div class="table-scroll"><table class="reward-table"><thead><tr><th>군</th><th>목표 비율</th><th>할당</th><th>지급</th><th>보류</th><th>할당 가치</th></tr></thead><tbody>${groupRows}</tbody></table></div>
    <h3>2차 개인별 추첨</h3><div class="table-scroll"><table class="reward-table"><thead><tr><th>군</th><th>길드원</th><th>유효 기여율</th><th>개수</th><th>합계 가치</th><th>보상 내역</th></tr></thead><tbody>${peopleRows||'<tr><td colspan="6">지급된 보상이 없습니다.</td></tr>'}</tbody></table></div>
    ${r.held.length?`<div class="msg">참여 기여도가 있는 길드원이 없는 군에 배정된 보상 ${r.held.length}개는 보류했어요. 다른 군으로 임의 재배분하지 않습니다.</div>`:''}
    <p class="hint">무작위 추첨 특성상 다시 추첨하면 결과가 바뀝니다. 지급 확정 전 결과를 복사해 두세요.</p><button class="secondary full-width" id="copyZoneOneResult">추첨 결과 복사</button></div>`;
  }
  function render(){
    if(!$('zoneOnePanel'))return;
    renderMonsters();
    const boss=current();
    $('zoneOneHp').value=boss.hp||'';
    $('zoneOneInputMode').value=data.options.inputMode;
    $('zoneOneSpeed').value=String(data.options.speed===2?2:1);
    $('zoneOneServerBonus').value=asNumber(data.options.serverBonus,1e6);
    $('zoneOneKnockLoss').value=asNumber(data.options.lossPerKnock,100);
    renderMembers();renderRewardList();renderResult();
  }
  function addReward(){
    const name=$('newRewardName').value.trim();
    const quantity=Number($('newRewardQuantity').value),value=Number($('newRewardValue').value);
    if(!name||name.length>40||!Number.isSafeInteger(quantity)||quantity<1||quantity>2000||!Number.isFinite(value)||value<=0||value>1e9){message('보상 이름·수량(1~2000)·가치(0 초과)를 확인하세요.');return;}
    if(data.rewards.reduce((sum,x)=>sum+x.quantity,0)+quantity>2000){message('전체 보상 수량은 한 번에 2000개까지 가능해요.');return;}
    data.rewards.push({id:`r${Date.now().toString(36)}${data.rewards.length}`,name,quantity,value});
    $('newRewardName').value='';$('newRewardQuantity').value='1';$('newRewardValue').value='1';
    clearDraw();save();renderRewardList();
  }
  async function copyResult(){
    const r=data.lastDraw;if(!r)return;
    const lines=[`상층 1구역 ${data.monster} 보상 추첨`, `총 ${r.totalCount}개 · 총 가치 ${fmt(r.totalValue)}`];
    for(let g=1;g<=4;g++){lines.push(`${g}군 (${Engine.SHARES[g]}%): 할당 ${r.groupStats[g].assigned} / 지급 ${r.groupStats[g].distributed} / 보류 ${r.groupStats[g].held}`);}
    for(const m of r.people.filter(m=>m.wonCount>0))lines.push(`${m.group}군 ${m.name}: ${m.won.map(x=>x.name).join(', ')} / 가치 ${fmt(m.wonValue)}`);
    if(r.held.length)lines.push(`보류 ${r.held.length}개`);
    try{await navigator.clipboard.writeText(lines.join('\n'));message('추첨 결과를 복사했어요.');}
    catch {message('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');}
  }
  function init(){
    if(!$('zoneOnePanel'))return;
    $('monsterChoices').addEventListener('click',e=>{
      const target=e.target.closest('[data-monster]');if(!target)return;
      if(!Engine.MONSTERS.includes(target.dataset.monster))return;
      data.monster=target.dataset.monster;save();render();
    });
    $('zoneOneHp').addEventListener('input',e=>{current().hp=asNumber(e.target.value,1e15);clearDraw();save();updateTotals();});
    for(const [id,field,max] of [['zoneOneInputMode','inputMode',0],['zoneOneSpeed','speed',2],['zoneOneServerBonus','serverBonus',1e6],['zoneOneKnockLoss','lossPerKnock',100]]){
      $(id).addEventListener('change',e=>{
        data.options[field]=field==='inputMode'?(e.target.value==='raw'?'raw':'final'):(field==='speed'?(Number(e.target.value)===2?2:1):asNumber(e.target.value,max));
        clearDraw();save();updateTotals();
      });
    }
    $('zoneOneMembers').addEventListener('input',e=>{
      const input=e.target.closest('[data-zone-field]');if(!input)return;
      const id=input.dataset.memberId;
      if(!roster().some(m=>m.id===id))return;
      const entry=current().entries[id]||(current().entries[id]={raw:0,knocks:0});
      entry[input.dataset.zoneField]=input.dataset.zoneField==='knocks'?Math.floor(asNumber(input.value,100)):asNumber(input.value,100);
      clearDraw();save();updateTotals();
    });
    $('addReward').addEventListener('click',addReward);
    $('rewardList').addEventListener('click',e=>{
      const button=e.target.closest('[data-delete-reward]');if(!button)return;
      const idx=Number(button.dataset.deleteReward);
      if(!Number.isSafeInteger(idx)||idx<0||idx>=data.rewards.length)return;
      data.rewards.splice(idx,1);clearDraw();save();renderRewardList();
    });
    $('drawZoneOne').addEventListener('click',()=>{
      const calc=calculation();
      if(calc.overCap){message('총 기여율이 100%를 넘어 추첨을 중단했어요.');return;}
      if(!calc.people.some(x=>x.effective>0&&x.group>=1&&x.group<=4)){message('기여도가 있고 1~4군에 소속된 길드원이 필요해요.');return;}
      if(!data.rewards.length){message('획득한 보상을 먼저 등록해 주세요.');return;}
      try{
        const raw=Engine.draw({members:calc.people,items:data.rewards},()=>{
          if(window.crypto&&window.crypto.getRandomValues){const arr=new Uint32Array(1);window.crypto.getRandomValues(arr);return arr[0]/4294967296;}
          return Math.random();
        });
        data.lastDraw={...raw,monster:data.monster,createdAt:new Date().toISOString()};save();renderResult();message('2단계 보상 추첨을 완료했어요.');
      }catch(error){message(error.message||'추첨 실패');}
    });
    $('zoneOneResults').addEventListener('click',e=>{if(e.target.closest('#copyZoneOneResult'))copyResult();});
    document.addEventListener('guild:updated',()=>{
      // Re-render only when roster changes, not on contribution keystrokes.
      if(data.lastDraw){data.lastDraw=null;save();}
      renderMembers();renderResult();
    });
    render();
  }
  window.ZoneOneUI={render,init};
  init();
})();
