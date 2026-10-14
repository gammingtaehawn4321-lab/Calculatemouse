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
