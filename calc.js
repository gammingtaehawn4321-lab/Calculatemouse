/* Kkoaengi mobile - source-compatible score formula, deterministic inverse. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KkoaengiCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCORE_UNIT = 654;
  const TIME_BASE = 170;
  const TIME_STEP = 0.05;
  const SPEED_2_LOSS = 0.0429;
  const MAX_TIME = 1e9;
  function nonnegative(x) { const v = Number(x); return Number.isFinite(v) ? Math.max(0, v) : 0; }
  function finite(x) { const v = Number(x); return Number.isFinite(v) ? v : 0; }
  function speedFactor(speed) { return Number(speed) === 2 ? 1 - SPEED_2_LOSS : 1; }
  function scorePerSecond(bonusPercent, seconds, speed) {
    const unit = Math.max(0, SCORE_UNIT + (nonnegative(seconds) - TIME_BASE) * TIME_STEP);
    return unit * Math.max(0, 100 + finite(bonusPercent)) / 60 * speedFactor(speed);
  }
  function totalScore(bonusPercent, seconds, speed, minimumScore = 0) {
    const t = nonnegative(seconds);
    return t * scorePerSecond(bonusPercent, t, speed) + nonnegative(minimumScore);
  }
  /* Guaranteed smallest integer second meeting the target, or null if impossible. */
  function minimumSeconds(targetScore, bonusPercent, speed, minimumScore = 0) {
    const target = nonnegative(targetScore);
    const base = nonnegative(minimumScore);
    if (base >= target) return 0;
    if (scorePerSecond(bonusPercent, 170, speed) <= 0) return null;
    let lo = 0, hi = 1;
    while (totalScore(bonusPercent, hi, speed, base) + 1e-7 < target && hi < MAX_TIME) {
      hi = Math.min(MAX_TIME, hi * 2);
    }
    if (totalScore(bonusPercent, hi, speed, base) + 1e-7 < target) return null;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (totalScore(bonusPercent, mid, speed, base) + 1e-7 >= target) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  function calculateBoss(member, hp, serverBonus, speed) {
    const bonus = nonnegative(member.bonus) + nonnegative(member.zone2Bonus) + nonnegative(serverBonus);
    const min = nonnegative(member.minScore);
    const mode = member.boss && member.boss.mode === 'time' ? 'time' : 'ratio';
    let seconds, target;
    if (mode === 'time') {
      seconds = Math.ceil(nonnegative(member.boss.time));
      target = totalScore(bonus, seconds, speed, min);
    } else {
      target = nonnegative(hp) * nonnegative(member.boss.ratio) / 100;
      seconds = minimumSeconds(target, bonus, speed, min);
    }
    const actual = seconds === null ? min : totalScore(bonus, seconds, speed, min);
    return { seconds, target, actual, actualRatio: nonnegative(hp) > 0 ? actual / hp * 100 : 0,
      requestedRatio: mode === 'ratio' ? nonnegative(member.boss.ratio) : null,
      exceededByMinimum: mode === 'ratio' && min > target, bonus };
  }
  function calculateStrike(member, region, serverBonus, speed) {
    const bonus = nonnegative(member.bonus) + nonnegative(member.region && member.region[region]) + nonnegative(serverBonus);
    const min = nonnegative(member.minScore);
    const mode = member.strike && member.strike.mode === 'score' ? 'score' : 'time';
    let seconds, target;
    if (mode === 'score') {
      target = nonnegative(member.strike.score);
      seconds = minimumSeconds(target, bonus, speed, min);
    } else {
      seconds = Math.ceil(nonnegative(member.strike.time));
      target = totalScore(bonus, seconds, speed, min);
    }
    const actual = seconds === null ? min : totalScore(bonus, seconds, speed, min);
    return { seconds, target, actual, bonus };
  }
  function commonBossTime(members, hp, serverBonus, speed) {
    if (members.length === 0) return null;
    const goal = nonnegative(hp);
    const totalAt = t => members.reduce((sum, m) => sum + totalScore(nonnegative(m.bonus) + nonnegative(m.zone2Bonus) + nonnegative(serverBonus), t, speed, m.minScore), 0);
    if (totalAt(0) >= goal) return 0;
    let lo = 0, hi = 1;
    while (totalAt(hi) + 1e-7 < goal && hi < MAX_TIME) hi = Math.min(MAX_TIME, hi * 2);
    if (totalAt(hi) + 1e-7 < goal) return null;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (totalAt(mid) + 1e-7 >= goal) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return { SCORE_UNIT, TIME_BASE, TIME_STEP, SPEED_2_LOSS, scorePerSecond, totalScore,
    minimumSeconds, calculateBoss, calculateStrike, commonBossTime };
});
