const assert = require('node:assert/strict');
const C = require('../app/src/main/assets/calc.js');
function approx(a,b, tol=1e-7) { assert(Math.abs(a-b)<tol, `${a} vs ${b}`); }
approx(C.scorePerSecond(0,170,1), 654*100/60);
approx(C.scorePerSecond(0,170,2), 654*100/60*(1-0.0429));
approx(C.totalScore(10,100,1,0), 100*(654+(100-170)*.05)*110/60);
assert.equal(C.minimumSeconds(0,0,2),0);
assert.equal(C.minimumSeconds(900,0,2,1000),0);
for (const bonus of [0,20,75,200]) for(const speed of [1,2]) for (const target of [1,1234,30000,100000,500000,1000000,10000000]) {
  const sec=C.minimumSeconds(target,bonus,speed);
  assert(sec!==null,'unexpected unreachable target');
  assert(C.totalScore(bonus,sec,speed) + 1e-7 >= target,`under target at ${sec}`);
  if(sec>0)assert(C.totalScore(bonus,sec-1,speed) + 1e-7 < target,`not minimal at ${sec}`);
}
const m={bonus:10,minScore:100000,boss:{mode:'ratio',ratio:10},strike:{mode:'score',score:10000},region:{cat:20}};
const b=C.calculateBoss(m,500000,0,2);
assert.equal(b.seconds,0);
assert.equal(b.exceededByMinimum,true);
assert.equal(b.actualRatio,20);
const s=C.calculateStrike(m,'cat',0,2);
assert.equal(s.seconds,0);
assert.equal(s.actual,100000);
const team=[{bonus:0,minScore:0},{bonus:10,minScore:0}];
const t=C.commonBossTime(team,500000,0,2);
assert(C.totalScore(0,t,2)+C.totalScore(10,t,2)>=500000);
assert(C.totalScore(0,t-1,2)+C.totalScore(10,t-1,2)<500000);
console.log('PASS: score formula, inverse precision, minimum-score handling, common time');
