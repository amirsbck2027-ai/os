// Aura OS service worker: offline app shell. Bump VERSION to force an update.
const VERSION = 'aura-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin GET: network first (so updates arrive), fall back to cache offline.
// Cross-origin (weather, Supabase, speed test) is never touched.
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
