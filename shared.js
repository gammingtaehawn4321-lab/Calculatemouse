'use strict';
/* Native Apps Script sync. No remote scripts, JSONP, cross-site redirects or insecure HTTP. */
(() => {
  const CONFIG_KEY='gyesanjungiji-shared-config-v1';
  const URL_RE=/^https:\/\/(?:script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec|[a-z0-9.-]+\.workers\.dev(?:\/[a-z0-9/_-]*)?)$/i;
  const $=id=>document.getElementById(id);
  let config={url:'',readKey:'',editKey:''};
  try { const saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}');
    config={url:saved.url||'',readKey:saved.readKey||'',editKey:saved.editKey||''}; }catch{}
  let linked=false,loading=false,writing=false,sequence=0,lastSynced='',lastRevision=0;
  const pending=new Map();
  let callbacks=null;
  const escapeHtml=x=>String(x).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const configured=()=>!!(URL_RE.test(config.url)&&config.readKey.length>=20);
  const sharedMode=()=>configured();
  const canEdit=()=>linked&&configured()&&config.editKey.length>=20;
  const isNative=()=>!!(window.Android&&typeof window.Android.cloudRequest==='function');
  function showStatus() {
    const text=!sharedMode()?'기기 내부 저장':!linked?'공용 연결 확인 필요':writing?'공용 서버 저장 중':loading?'공용 데이터 가져오는 중':`공용 연결됨 · v${lastRevision}${canEdit()?' · 수정 권한':' · 읽기 전용'}`;
    for(const id of ['cloudStatus','topCloudStatus'])if($(id))$(id).textContent=text;
    if($('cloudDetails'))$('cloudDetails').textContent=lastSynced?`마지막 동기화: ${lastSynced}`:'공용 연결 설정을 입력하고 연결하세요.';
    if($('refreshShared'))$('refreshShared').disabled=!configured()||loading||writing;
    if(callbacks) callbacks.updatePermissions();
  }
  function callNative(body) {
    if(!isNative())return fetch(config.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body),redirect:'follow'}).then(async r=>{if(!r.ok)throw new Error('서버 응답 '+r.status);return r.json();});
    const requestId='r'+(++sequence).toString(36)+'_'+Date.now().toString(36);
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('서버 응답 제한 시간을 초과했습니다.'));},45000);
      pending.set(requestId,{resolve,reject,timeout});
      try {window.Android.cloudRequest(requestId,config.url,JSON.stringify(body));}
      catch(err){clearTimeout(timeout);pending.delete(requestId);reject(err);}
    });
  }
  window.onSharedServerReply=(requestId,raw)=>{
    const p=pending.get(requestId);if(!p)return;
    pending.delete(requestId);clearTimeout(p.timeout);
    try {p.resolve(JSON.parse(raw));}catch{p.reject(new Error('서버 응답이 올바른 JSON이 아닙니다.'));}
  };
  function acceptSnapshot(data) {
    if(!data || !data.ok || data.schema!==1 || !Array.isArray(data.members) || data.members.length>200)
      throw new Error('공용 서버 데이터 형식이 올바르지 않습니다.');
    if(callbacks) callbacks.acceptRoster(data.members);
    lastRevision=Number(data.revision)||0;
    lastSynced=new Date().toLocaleString('ko-KR');linked=true;
    showStatus();
  }
  function serverError(result) {
    const known={UNAUTHORIZED:'인증 키가 틀렸습니다.',CONFLICT:'다른 사용자가 먼저 수정했습니다.',DUPLICATE:'동일한 닉네임이 이미 있습니다.',NOT_FOUND:'길드원이 이미 삭제되었습니다.',BUSY:'다른 사용자 저장 중입니다.',NETWORK:'인터넷 또는 서버 연결 오류입니다.'};
    return new Error((known[result.error]||'공용 서버 오류')+(result.message?' ('+String(result.message).slice(0,140)+')':''));
  }
  async function refresh(force=false) {
    if(!configured()||loading||writing)return false;
    if(!force && document.activeElement && document.activeElement.matches('[data-manage],[data-field]'))return false;
    loading=true;showStatus();
    try {
      const data=await callNative({action:'read',key:config.readKey});
      if(!data.ok)throw serverError(data);
      acceptSnapshot(data);
      return true;
    }catch(error){linked=false;showStatus();callbacks?.notify('공용 동기화 실패: '+error.message);return false;}
    finally{loading=false;showStatus();}
  }
  async function mutate(op) {
    if(!canEdit()){callbacks?.notify('공용 수정 권한이 없습니다. 관리자 수정 키를 설정하세요.');return false;}
    if(writing){callbacks?.notify('이전 변경 내용 저장이 진행 중입니다.');return false;}
    writing=true;showStatus();
    try {
      const result=await callNative({action:'mutate',key:config.editKey,operation:op});
      if(!result.ok)throw serverError(result);
      acceptSnapshot(result);
      callbacks?.notify('공용 데이터에 저장했습니다.');
      return true;
    }catch(err) {
      callbacks?.notify('저장 실패: '+err.message);
      if(err.message.includes('먼저 수정')||err.message.includes('삭제')) {
        // Refresh after the failed mutation, rather than overwriting the other person's edit.
        writing=false;await refresh(true);writing=true;
      } else { linked=false; }
      callbacks?.rerender();
      return false;
    }finally {writing=false;showStatus();}
  }
  function saveConfig() {
    const url=$('cloudUrl').value.trim();
    const readKey=$('cloudReadKey').value.trim();
    const editKey=$('cloudEditKey').value.trim();
    if(!URL_RE.test(url)){callbacks.notify('공용 연결은 Cloudflare Worker 주소(https://...workers.dev)를 입력하세요.');return;}
    if(readKey.length<20||readKey.length>256){callbacks.notify('읽기 키는 20~256자로 설정하세요.');return;}
    if(editKey && (editKey.length<20||editKey.length>256)){callbacks.notify('관리자 수정 키는 20~256자로 설정하세요.');return;}
    config={url,readKey,editKey};linked=false;lastSynced='';
    localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
    showStatus();refresh(true);
  }
  function clearConfig() {
    if(!confirm('이 기기의 공용 연결 정보만 삭제할까요? 서버 데이터는 삭제되지 않습니다.'))return;
    config={url:'',readKey:'',editKey:''};linked=false;lastRevision=0;lastSynced='';
    localStorage.removeItem(CONFIG_KEY);
    ['cloudUrl','cloudReadKey','cloudEditKey'].forEach(id=>$(id).value='');
    showStatus();callbacks?.notify('공용 연결을 해제했습니다. 이 기기의 마지막 데이터는 남아 있습니다.');
  }
  function init(hooks) {
    callbacks=hooks;
    $('cloudUrl').value=config.url;
    $('cloudReadKey').value=config.readKey;
    $('cloudEditKey').value=config.editKey;
    $('connectShared').addEventListener('click',saveConfig);
    $('disconnectShared').addEventListener('click',clearConfig);
    $('refreshShared').addEventListener('click',()=>refresh(true));
    showStatus();
    if(configured())refresh(true);
    setInterval(()=>{if(document.visibilityState==='visible' && configured()) refresh();},90000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&configured())refresh();});
  }
  window.CloudRoster={init,refresh,mutate,sharedMode,canEdit,showStatus};
})();
