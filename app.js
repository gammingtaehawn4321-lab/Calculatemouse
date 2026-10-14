'use strict';
(() => {
  const C = window.KkoaengiCalc;
  const STORAGE_KEY = 'gyesanjungiji-mobile-v3';
  const OLD_STORAGE_KEY = 'kkoaengi-mobile-v2';
  const DEFAULT_NAMES = ['쩰리','까꿍','제니','유교','타격','구슬요','끄르','달리는곰돌이','루시퍼','봉수','시티즌2','빙하','빙제','빙결','빙왕'];
  const REGIONS = [{key:'pirate',name:'해적'},{key:'cat',name:'고양이'},{key:'wolf',name:'늑대'},{key:'food',name:'음식'}];
  const BOSSES = [{name:'바나냥',hp:500000},{name:'루나',hp:450000},{name:'루니',hp:400000},{name:'루이',hp:350000}];
  const $ = id => document.getElementById(id);
  const fmt = v => Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '-';
  const pct = v => Number.isFinite(v) ? `${v.toFixed(2).replace(/\.?0+$/,'')}%` : '-';
  const tstr = t => t === null ? '계산 불가' : `${Math.floor(t/60).toLocaleString('ko-KR')}분 ${t%60}초`;
  const clamp = (raw, max = 1e9) => { const v = Number(raw); return Number.isFinite(v) ? Math.min(max, Math.max(0,v)) : 0; };
  const escapeHtml = raw => String(raw).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let idCounter = 0;
  const makeId = () => `m${Date.now().toString(36)}x${(++idCounter).toString(36)}`;
  function member(name, active = false) {
    return {id:makeId(),name,active,bonus:0,minScore:0,region:{pirate:0,cat:0,wolf:0,food:0},
      profileRevision:0,boss:{mode:'ratio',ratio:0,time:500},strike:{mode:'time',time:500,score:0}};
  }
  function defaults() {
    const members = DEFAULT_NAMES.map((name,i) => member(name,i<3));
    members[0].boss.ratio = 33.34;
    members[1].boss.ratio = 33.33;
    members[2].boss.ratio = 33.33;
    return {version:2,members,mode:'boss',bossHp:500000,speed:2,serverBonus:0,region:'pirate'};
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
      safe.profileRevision = Number.isSafeInteger(m.profileRevision) ? Math.max(0,m.profileRevision) : 0;
      safe.bonus = clamp(m.bonus,1e6);
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
  let currentTab = 'calc';
  const cloud = window.CloudRoster;
  function mergeSharedRoster(serverMembers) {
    // Do not synchronize local per-user calculations, active flags or fight presets.
    const oldById = new Map(state.members.map(m=>[m.id,m]));
    const oldByName = new Map(state.members.map(m=>[m.name.toLocaleLowerCase(),m]));
    const updated = serverMembers.map(remote=>{
      const previous=oldById.get(remote.id)||oldByName.get(String(remote.name).toLocaleLowerCase());
      const m=previous?{...previous,region:{...previous.region},boss:{...previous.boss},strike:{...previous.strike}}:member(String(remote.name),false);
      m.id=String(remote.id);m.name=String(remote.name);m.bonus=clamp(remote.bonus,1e6);
      m.minScore=clamp(remote.minScore);m.profileRevision=Number(remote.profileRevision)||1;
      for(const r of REGIONS)m.region[r.key]=clamp(remote.region?.[r.key],1e6);
      return m;
    });
    state.members=sanitize({...state,members:updated}).members;
    save();
    if(currentTab==='calc')renderCalc();
    if(currentTab==='members')renderManagement();
  }
  function updatePermissions() {
    const readOnly=cloud.sharedMode()&&!cloud.canEdit();
    const add=$('addMember');if(add)add.disabled=readOnly;
    document.querySelectorAll('[data-delete-id],[data-manage="name"],[data-manage="bonus"],[data-manage="minScore"],'+
      '[data-manage="pirate"],[data-manage="cat"],[data-manage="wolf"],[data-manage="food"],'+
      '[data-field="bonus"],[data-field="region"]').forEach(el=>el.disabled=readOnly);
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
  }
  const activeMembers = () => state.members.filter(m => m.active);
  function changeTab(tab) {
    currentTab = tab;
    for (const name of ['calc','members','data']) {
      $(name+'Tab').hidden = name!==tab;
      document.querySelector(`[data-tab="${name}"]`).setAttribute('aria-selected',name===tab?'true':'false');
    }
    if(tab==='calc') renderCalc();
    if(tab==='members') renderManagement();
    if(tab==='data') renderRemaining();
    updatePermissions();
    window.scrollTo(0,0);
  }
  function initControls() {
    $('bossPresets').innerHTML = BOSSES.map(b=>`<button class="pill" data-boss-hp="${b.hp}">${b.name}</button>`).join('');
    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click',()=>changeTab(btn.dataset.tab)));
    $('bossMode').addEventListener('click',()=>{state.mode='boss';save();renderCalc()});
    $('strikeMode').addEventListener('click',()=>{state.mode='strike';save();renderCalc()});
    $('bossHp').addEventListener('input',e=>{state.bossHp = Math.max(1,clamp(e.target.value));save();updateOutputs()});
    $('speed').addEventListener('change',e=>{state.speed = Number(e.target.value)===1?1:2;save();updateOutputs()});
    $('serverBonus').addEventListener('input',e=>{state.serverBonus=clamp(e.target.value,1e6);save();updateOutputs()});
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
    $('showBackup').addEventListener('click',()=>{const area=$('backupArea');area.hidden=!area.hidden;if(!area.hidden){$('backupText').value=JSON.stringify(state,null,2);$('backupText').select()}});
    $('importFile').addEventListener('change',importJson);
    $('resetButton').addEventListener('click',()=>{
      if(cloud.sharedMode()){
        if(!confirm('이 기기의 계산 설정만 초기화할까요? 공용 길드원과 격추값은 유지됩니다.'))return;
        state.members.forEach((m,i)=>{m.active=i<3;m.boss={mode:'ratio',ratio:i<3?(i===0?33.34:33.33):0,time:500};m.strike={mode:'time',time:500,score:0};});
        state.mode='boss';state.bossHp=500000;state.speed=2;state.serverBonus=0;state.region='pirate';
      }else {
        if(!confirm('길드원과 격추 데이터를 모두 초기화할까요?'))return;state=defaults();
      }
      save();notify('이 기기의 설정을 초기화했습니다.');changeTab('calc');
    });
    cloud.init({acceptRoster:mergeSharedRoster,notify,rerender:refreshVisible,updatePermissions});
    renderCalc();
  }
  function renderCalc() {
    const boss=state.mode==='boss';
    $('bossMode').classList.toggle('active',boss);
    $('strikeMode').classList.toggle('active',!boss);
    $('bossControls').hidden = !boss;
    $('regionControls').hidden = boss;
    $('autoActions').hidden = !boss;
    $('bossHp').value=state.bossHp;
    $('speed').value=String(state.speed);
    $('serverBonus').value=state.serverBonus;
    $('region').value=state.region;
    $('bossPresets').querySelectorAll('[data-boss-hp]').forEach(btn=>btn.classList.toggle('active', Number(btn.dataset.bossHp)===state.bossHp));
    $('memberToggles').innerHTML=state.members.map(m=>`<button class="pill ${m.active?'active':''}" data-toggle-id="${m.id}" aria-pressed="${m.active}">${escapeHtml(m.name)}</button>`).join('');
    $('activeCount').textContent=`(${activeMembers().length}/${state.members.length})`;
    $('emptyCalc').hidden=activeMembers().length!==0;
    $('calcMemberCards').innerHTML=activeMembers().map(m=>{
      const obj=boss?m.boss:m.strike;
      const mode=boss?(obj.mode==='time'?'time':'ratio'):(obj.mode==='score'?'score':'time');
      const inputField=mode==='ratio'?'ratio':mode==='score'?'score':'time';
      const label={ratio:'담당 비율 (%)',time:'사용 시간 (초)',score:'목표 점수'}[inputField];
      const regionBonus=!boss?`<div class="field"><label>지역 격추값 (%)</label><input type="number" inputmode="decimal" min="0" step="0.01" data-field="region" data-id="${m.id}" value="${m.region[state.region]}"></div>`:'';
      return `<div class="card" data-member-id="${m.id}"><div class="section-heading"><h2>${escapeHtml(m.name)}</h2><span class="member-meta">최소 점수 +${fmt(m.minScore)}</span></div>
        <div class="grid ${boss?'cols3':''}">
        <div class="field"><label>기본 격추값 (%)</label><input type="number" inputmode="decimal" min="0" step="0.01" data-id="${m.id}" data-field="bonus" value="${m.bonus}"></div>
        ${regionBonus}
        <div class="field"><label>입력 기준</label><select data-field="mode" data-id="${m.id}">${(boss?['ratio','time']:['time','score']).map(v=>`<option value="${v}" ${mode===v?'selected':''}>${{ratio:'담당 비율',time:'사용 시간',score:'목표 점수'}[v]}</option>`).join('')}</select></div>
        <div class="field"><label>${label}</label><input type="number" inputmode="decimal" min="0" step="0.01" data-field="${inputField}" data-id="${m.id}" value="${obj[inputField]}"></div></div>
        <div class="result-block" id="out-${m.id}" aria-live="polite"></div></div>`;
    }).join('');
    updateOutputs();
    updatePermissions();
  }
  function onCalcInput(e) {
    const input=e.target.closest('[data-field]');if(!input)return;
    const m=state.members.find(m=>m.id===input.dataset.id);if(!m)return;
    const field=input.dataset.field;
    if(cloud.sharedMode() && (field==='bonus'||field==='region')){
      if(e.type==='input')return;
      const value=clamp(input.value,1e6);
      cloud.mutate({type:'update',id:m.id,expectedRevision:m.profileRevision,
        field:field==='region'?state.region:'bonus',value});
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
    const n=clamp(input.value,field==='bonus'||field==='region'?1e6:1e9);
    if(field==='bonus')m.bonus=n;
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
      const weights=active.map(m=>mode==='bonus'?C.scorePerSecond(m.bonus+state.serverBonus,170,state.speed):1);
      let total=weights.reduce((a,b)=>a+b,0);
      if(total<=0){notify('격추값을 확인하세요.');return;}
      let remainder=100;
      active.forEach((m,i)=>{const ratio=i===active.length-1?Math.round(remainder*100)/100:Math.floor(weights[i]/total*10000)/100;
        m.boss.mode='ratio';m.boss.ratio=ratio;remainder-=ratio;});
    }
    save();renderCalc();notify(mode==='time'?'공통 시간을 계산했습니다.':'담당 비율을 배분했습니다.');
  }
  function updateOutputs() {
    const active=activeMembers(),boss=state.mode==='boss';let sum=0,sumRatio=0,sumTime=0,requested=0, impossible=0, minOverride=0;
    let lines=[];
    active.forEach(m=>{
      const r=boss?C.calculateBoss(m,state.bossHp,state.serverBonus,state.speed):C.calculateStrike(m,state.region,state.serverBonus,state.speed);
      sum+=r.actual;sumTime+=r.seconds??0;if(r.seconds===null)impossible++;
      sumRatio+=boss?r.actualRatio:0;
      if(boss && m.boss.mode==='ratio'){requested+=m.boss.ratio;if(r.exceededByMinimum)minOverride++;}
      if(boss && m.boss.mode==='time')requested+=r.actualRatio;
      let text=boss
        ? `<strong>예상 HP ${fmt(r.actual)}</strong> · 실제 비율 ${pct(r.actualRatio)}<div class="muted">소요 ${tstr(r.seconds)}${m.boss.mode==='ratio'?` · 목표 HP ${fmt(r.target)}`:''}</div>`
        : `<strong>예상 점수 ${fmt(r.actual)}</strong><div class="muted">소요 ${tstr(r.seconds)} · 총 격추 ${pct(r.bonus)}</div>`;
      const element=$('out-'+m.id);if(element)element.innerHTML=text;
      lines.push(`${m.name}: ${boss?`HP ${fmt(r.actual)} (${pct(r.actualRatio)})`:`점수 ${fmt(r.actual)}`}, ${tstr(r.seconds)}`);
    });
    $('sumName').textContent=boss?'총 예상 HP':'총 예상 점수';
    $('sumValue').textContent=fmt(sum);
    $('ratioName').textContent=boss?'실제 HP 비율':'총 격추 점수';
    $('ratioValue').textContent=boss?pct(sumRatio):fmt(sum);
    $('averageTime').textContent=active.length?tstr(Math.round(sumTime/active.length)):'0초';
    $('sumMembers').textContent=`${active.length}명`;
    let warnings=[];
    if(boss && active.length){
      if(Math.abs(requested-100)>.01)warnings.push(`목표 담당 비율의 합이 ${pct(requested)}입니다. 100%인지 확인하세요.`);
      if(Math.abs(sum-state.bossHp)>state.bossHp*.005)warnings.push(`실제 예상 HP와 보스 HP가 ${fmt(Math.abs(sum-state.bossHp))} 차이 납니다. 최소 점수 및 초 단위 올림을 확인하세요.`);
    }
    if(minOverride)warnings.push(`${minOverride}명의 최소 점수가 배정 HP를 초과합니다. 실제 담당 비율로 다시 표시했습니다.`);
    if(impossible)warnings.push(`${impossible}명은 현재 조건에서 목표 점수에 도달할 수 없습니다.`);
    $('calcWarnings').innerHTML=warnings.map(w=>`<div class="msg">${escapeHtml(w)}</div>`).join('');
    window.kkoaengiSummary=`${boss?'상층 보스':'일격 점수'} 계산\n${boss?`보스 HP: ${fmt(state.bossHp)}\n`:''}배속 ${state.speed} · 서버 격추 ${state.serverBonus}%\n${lines.join('\n')}\n총 점수/HP: ${fmt(sum)}\n평균 시간: ${active.length?tstr(Math.round(sumTime/active.length)):'0초'}`;
  }
  function renderManagement() {
    $('totalMembers').textContent=`전체 ${state.members.length}명`;
    $('manageMembers').innerHTML=`<div class="manage-grid">${state.members.map(m=>`
    <div class="manage-member" data-manage-id="${m.id}"><div class="manage-name"><strong>${escapeHtml(m.name)}</strong><button class="danger" data-delete-id="${m.id}" aria-label="${escapeHtml(m.name)} 삭제">삭제</button></div>
    <div class="member-selector"><input type="checkbox" id="active-${m.id}" data-id="${m.id}" data-manage="active" ${m.active?'checked':''}><label for="active-${m.id}">계산에 참여</label></div>
    <div class="field"><label>길드원 이름</label><input data-id="${m.id}" data-manage="name" maxlength="30" type="text" value="${escapeHtml(m.name)}"></div>
    <div class="grid" style="margin-top:9px"><div class="field"><label>기본 격추 (%)</label><input data-id="${m.id}" data-manage="bonus" type="number" min="0" step="0.01" value="${m.bonus}"></div>
    <div class="field"><label>최소 점수 증가</label><input data-id="${m.id}" data-manage="minScore" type="number" min="0" step="1" value="${m.minScore}"></div></div>
    <div class="grid" style="margin-top:9px">${REGIONS.map(r=>`<div class="field"><label>${r.name} 지역 격추 (%)</label><input data-id="${m.id}" data-manage="${r.key}" type="number" min="0" step="0.01" value="${m.region[r.key]}"></div>`).join('')}</div>
    </div>`).join('')}</div>`;
    updatePermissions();
  }
  function addMember() {
    const name=$('newName').value.trim();
    if(!name||name.length>30){notify('닉네임은 1~30자로 입력해 주세요.');return;}
    if(state.members.some(m=>m.name.toLowerCase()===name.toLowerCase())){notify('이미 등록된 닉네임입니다.');return;}
    if(state.members.length>=200){notify('최대 200명까지 등록할 수 있습니다.');return;}
    if(cloud.sharedMode()){
      cloud.mutate({type:'add',name,bonus:clamp($('newBonus').value,1e6)}).then(ok=>{
        if(ok){$('newName').value='';$('newBonus').value=0;renderManagement();}
      });return;
    }
    const m=member(name,false);m.bonus=clamp($('newBonus').value,1e6);
    state.members.push(m);$('newName').value='';$('newBonus').value=0;save();renderManagement();notify(`${name} 추가 완료 · 계산 탭에서 참여를 선택하세요.`);
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
      }else value=clamp(input.value,field==='minScore'?1e9:1e6);
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
    else if(field==='bonus'||field==='minScore')m[field]=clamp(input.value,field==='bonus'?1e6:1e9);
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
    const payload=JSON.stringify(state,null,2);
    if(window.Android && typeof window.Android.saveJson==='function') {window.Android.saveJson(payload);return;}
    const blob=new Blob([payload],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gyesanjungiji-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    notify('브라우저에서 파일 저장을 요청했습니다.');
  }
  async function importJson(e) {
    const file=e.target.files&&e.target.files[0];if(!file)return;
    try{
      if(file.size>4*1024*1024) throw new Error('백업 파일이 너무 큽니다.');
      const content=await file.text(); const imported=sanitize(JSON.parse(content));
      if(cloud.sharedMode())throw new Error('공용 연결 중에는 데이터 복원을 사용할 수 없습니다. 공용 연결을 해제한 뒤 복원하세요.');
      if(!confirm(`${imported.members.length}명의 백업으로 현재 데이터를 교체할까요?`))return;
      state=imported;save();notify('백업을 복원했습니다.');changeTab('calc');
    } catch(error){notify('복원 실패: '+(error.message||'백업을 확인하세요.'))}
    finally{e.target.value=''}
  }
  window.appExportDone=success=>notify(success?'백업 파일을 저장했습니다.':'백업 저장이 취소되었거나 실패했습니다.');
  initBackgroundParticles();
  initControls();
})();
