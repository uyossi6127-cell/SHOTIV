// © 2026 Yossi Ozan. All rights reserved. כל הזכויות שמורות.
// Service Worker: שומר את קבצי האפליקציה כדי שתעבוד גם בלי אינטרנט.
// בכל שינוי בקבצים מעלים את מספר הגרסה, כדי שהטלפון יוריד את החדשים.
const CACHE = 'shotiv-v35';
const FILES = [
  './',
  'index.html',
  'style.css?v=35',
  'app.js?v=35',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// קודם רשת, ואם אין חיבור – מהמטמון.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const sameOrigin = new URL(event.request.url).origin === self.location.origin;
  // תמיד בודקים מול השרת אם יש גרסה חדשה (בלי להסתמך על מטמון הדפדפן)
  event.respondWith(
    fetch(event.request, sameOrigin ? { cache: 'no-cache' } : undefined)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html')))
  );
});
