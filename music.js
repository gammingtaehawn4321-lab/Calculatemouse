/* Calculatemouse — one persistent BGM player for all app tabs. */
(() => {
  'use strict';
  const audio = document.getElementById('siteBgm');
  const toggle = document.getElementById('musicToggle');
  const icon = document.getElementById('musicIcon');
  const text = document.getElementById('musicText');
  const volume = document.getElementById('musicVolume');
  const live = document.getElementById('musicLive');
  if (!audio || !toggle || !volume) return;
  const STORAGE = 'calculatemouse-bgm-preferences-v1';
  let enabled = true;
  let level = 24;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (stored && typeof stored === 'object') {
      enabled = stored.enabled !== false;
      if (Number.isFinite(stored.level)) level = Math.max(0, Math.min(100, stored.level));
    }
  } catch (_) { /* Private browsing may block localStorage. */ }
  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ enabled, level })); }
    catch (_) { /* Playback still works without storage. */ }
  }
  function reflect() {
    const playing = !audio.paused;
    icon.textContent = playing ? '♫' : '♪';
    text.textContent = playing ? '음악 끄기' : '음악 켜기';
    toggle.setAttribute('aria-label', playing ? '배경음악 끄기' : '배경음악 켜기');
    toggle.setAttribute('title', playing ? '배경음악 끄기' : '배경음악 켜기');
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.classList.toggle('playing', playing);
  }
  function tryPlay() {
    if (!enabled || !audio.paused) return;
    try {
      const promise = audio.play();
      if (promise && typeof promise.then === 'function') {
        promise.then(reflect).catch(() => {
          /* Browser requires a user gesture; the button remains available. */
          reflect();
        });
      }
    } catch (_) { reflect(); }
  }
  // User gesture starts autoplay-restricted audio on mobile browsers.
  function onFirstGesture(event) {
    if (!enabled || (event.target instanceof Element && event.target.closest('#musicControls'))) return;
    tryPlay();
  }
  audio.loop = true;
  audio.volume = level / 100;
  volume.value = String(level);
  volume.addEventListener('input', () => {
    level = Math.min(100, Math.max(0, Number(volume.value) || 0));
    audio.volume = level / 100;
    volume.setAttribute('aria-valuetext', `${level}%`);
    persist();
    live.textContent = `배경음악 볼륨 ${level}%`;
  });
  toggle.addEventListener('click', () => {
    if (!audio.paused) {
      enabled = false;
      audio.pause();
      live.textContent = '배경음악을 껐습니다.';
    } else {
      enabled = true;
      // Direct click gesture is required by Safari/Chrome autoplay policy.
      tryPlay();
      live.textContent = '배경음악 재생을 요청했습니다.';
    }
    persist();
    reflect();
  });
  audio.addEventListener('play', reflect);
  audio.addEventListener('pause', reflect);
  audio.addEventListener('error', () => {
    live.textContent = '음악 파일을 불러오지 못했습니다.';
    reflect();
  });
  document.addEventListener('pointerdown', onFirstGesture, { capture: true });
  document.addEventListener('keydown', onFirstGesture, { capture: true });
  reflect();
  // Works on desktops permitting autoplay; harmlessly rejects on iOS/Android.
  tryPlay();
})();
