/* 离线缓存：让「添加到主屏」后断网也能打开、查看已存案例 */
const CACHE = 'ipcase-v3';
const ASSETS = [
  './', './index.html', './app.js', './cases.js', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API 与第三方库不缓存
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  // 案例包永远取网络，取不到就用内置的，不写进缓存
  if (url.pathname.includes('/live/')) { e.respondWith(fetch(e.request)); return; }
  // 代码与页面走 network-first，保证改完刷新就能拿到新版；离线时回退缓存
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
