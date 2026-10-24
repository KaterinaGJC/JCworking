/* Service Worker：预缓存 + 运行时缓存，保证飞行模式下也能打开 */
const CACHE = 'jc-cache-v1';

const CORE = [
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/pages.css',
  './js/main.js',
  './js/router.js',
  './js/util.js',
  './js/ui.js',
  './js/theme.js',
  './js/db.js',
  './js/store.js',
  './js/backup.js',
  './js/core/dates.js',
  './js/core/repeat.js',
  './js/core/summary.js',
  './js/core/backup.js',
  './js/pages/home.js',
  './js/pages/plan.js',
  './js/pages/schedule.js',
  './js/pages/lesson.js',
  './js/pages/students.js',
  './js/pages/student.js',
  './js/pages/fun.js',
  './js/pages/memo.js',
  './js/pages/settings.js',
  './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐个缓存：个别文件缺失不应该让整次安装失败
    await Promise.allSettled(CORE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
      fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const index = await cache.match('./index.html') || await cache.match('index.html');
        if (index) return index;
      }
      throw err;
    }
  })());
});
