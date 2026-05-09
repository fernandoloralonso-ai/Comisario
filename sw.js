// ══════════════════════════════════════════════════════════════
// COMISARIO TÉCNICO PRO — Service Worker
// Versión del caché — cambiar para forzar actualización
// ══════════════════════════════════════════════════════════════
const CACHE_NAME = 'comisario-pro-v2026-4';

// Ficheros que se cachean al instalar (disponibles siempre offline)
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=JetBrains+Mono:wght@400;600&family=Barlow:wght@400;500;600&display=swap'
];

// ── INSTALL ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear ficheros locales siempre; fuentes de Google solo si hay red
      return cache.addAll(['/index.html', '/manifest.json']).then(() => {
        return fetch('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=JetBrains+Mono:wght@400;600&family=Barlow:wght@400;500;600&display=swap')
          .then(r => cache.put('fonts', r))
          .catch(() => {}); // Si no hay red, sin fuentes (usa fallback)
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Llamadas a la API de Anthropic → NUNCA cachear, siempre red
  if(url.hostname === 'api.anthropic.com'){
    event.respondWith(fetch(event.request));
    return;
  }

  // Fuentes de Google → cache first
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(
      caches.match(event.request).then(cached => {
        if(cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => new Response('', {status: 503}));
      })
    );
    return;
  }

  // Ficheros propios (index.html, manifest.json) → cache first, red como fallback
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(event.request).then(cached => {
        // En paralelo intentar actualizar el caché (stale-while-revalidate)
        const networkFetch = fetch(event.request).then(response => {
          if(response && response.status === 200){
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => null);

        return cached || networkFetch;
      })
    );
    return;
  }

  // Resto → red directa
  event.respondWith(fetch(event.request).catch(() =>
    new Response('Sin conexión', {status: 503, statusText: 'Offline'})
  ));
});

// ── MENSAJE DESDE LA APP (para forzar actualización) ──────────
self.addEventListener('message', event => {
  if(event.data === 'skipWaiting'){
    self.skipWaiting();
  }
});
