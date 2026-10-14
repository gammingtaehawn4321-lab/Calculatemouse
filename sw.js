/* GitHub Pages service worker, including offline MP3 range support. */
const CACHE = 'gyesanjungiji-pwa-v10-zone1-normal-steps';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './calc.js',
  './shared.js', './music.js', './manifest.webmanifest',
  './assets/main-emblem.svg', './icon-192.png', './icon-512.png',
  './assets/bg-logo.png', './assets/hamster-particle.png',
  './assets/glass-hamster.png', './assets/note-hamster.png',
  './assets/snack-hamster.png', './assets/wheel-hamster.png',
  './assets/oops-hamster.png', './assets/depart-hamster.png',
  './assets/rat-beat.mp3'
];
const AUDIO_URL = new URL('./assets/rat-beat.mp3', self.registration.scope);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function audioRange(request) {
  const cached = await caches.match(AUDIO_URL.href);
  if (!cached) return fetch(request);

  const buffer = await cached.arrayBuffer();
  const length = buffer.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!match || (!match[1] && !match[2])) return cached;

  let start;
  let end;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    start = Math.max(0, length - suffixLength);
    end = length - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? length - 1 : Math.min(Number(match[2]), length - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= length) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
  }
  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Content-Range': `bytes ${start}-${end}/${length}`,
    'Content-Length': String(end - start + 1)
  });
  return new Response(buffer.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname === AUDIO_URL.pathname && event.request.headers.has('range')) {
    event.respondWith(audioRange(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
