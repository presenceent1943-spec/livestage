// LIVE STAGE 서비스 워커 — 네트워크 우선, 실패 시 캐시. 새 배포는 다음 로드에서 자동 교체 + 앱이 '새 버전' 안내.
const VERSION = 'ls-v2-1';
const SHELL = ['./', './index.html', './overlay.html', './app/tokens.css', './app/core.js', './app/engine.js', './app/data.js', './app/demo-data.js', './app/main.js', './app/tour.js', './app/excel-board.js', './app/views/home.js', './app/views/live.js', './app/views/studio.js', './app/views/settle.js', './app/views/admin.js', './app/views/profile.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;   // 영상·API·CDN 은 캐시하지 않음
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html'))));
});
