'use strict';
const assert=require('node:assert/strict');
const C=require('../calc.js');
const Z=require('../zone1.js');
const member={id:'m1',name:'가',group:1,bonus:10,zone1Bonus:5,zone2Bonus:8,minScore:0,region:{cat:4},boss:{mode:'time',time:170},strike:{mode:'time',time:170}};
const memberOther={...member,zone1Bonus:100,zone2Bonus:300};
function close(a,b){assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);}
// Upper stage 1: baseline+own stage only; no contamination from stage 2.
const stageOne=Z.calculate([{...member,raw:10,knocks:0}],{inputMode:'raw',speed:1,serverBonus:2});
close(stageOne.people[0].effective,10*1.17);
const stageOneNoStageTwo=Z.calculate([{...member,zone2Bonus:999,raw:10,knocks:0}],{inputMode:'raw',speed:1,serverBonus:2});
close(stageOneNoStageTwo.people[0].effective,stageOne.people[0].effective);
const alreadyFinal=Z.calculate([{...member,raw:15,knocks:3}],{inputMode:'final',speed:2,serverBonus:30,lossPerKnock:15});
close(alreadyFinal.people[0].effective,15);
// Upper stage 2: baseline+own stage only, including common time and inversion.
const expected=C.totalScore(20,170,1,0);
close(C.calculateBoss(member,500000,2,1).actual,expected);
close(C.calculateBoss({...member,zone1Bonus:999},500000,2,1).actual,expected);
assert(C.calculateBoss(memberOther,500000,0,1).actual>C.calculateBoss(member,500000,0,1).actual);
const common=C.commonBossTime([member],expected,2,1);
assert.equal(common,170);
// Strike mode keeps its existing region model.
close(C.calculateStrike(member,'cat',2,1).actual,C.totalScore(16,170,1,0));
close(C.calculateStrike(memberOther,'cat',2,1).actual,C.totalScore(16,170,1,0));
// Missing fields should behave as 0: backwards compatible with prior saved member objects.
const old={...member};delete old.zone1Bonus;delete old.zone2Bonus;
close(C.calculateBoss(old,500000,2,1).actual,C.totalScore(12,170,1,0));
close(Z.calculate([{...old,raw:10,knocks:0}],{inputMode:'raw',speed:1}).people[0].effective,11);
console.log('PASS: distinct zone bonuses, old data fallback, strike isolation, final percent isolation');
