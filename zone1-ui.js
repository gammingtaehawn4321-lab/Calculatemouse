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
      return `<div class="zone-member" data-zone-member="${esc(m.id)}"><div class="zone-member-info"><strong>${esc(m.name)}</strong><span class="group-badge group-${m.group||0}">${group}</span></div>
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
