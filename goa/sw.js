/* GOA Business — service worker: la app funciona sin internet */
const VERSION = 'goa-v202611040838';
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/favicon-48.png', './icons/apple-touch-icon.png', './privacidad.html'];
const SDK = /^https:\/\/www\.gstatic\.com\/firebasejs\//;   // librería de la nube: se guarda para abrir sin internet

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ARCHIVOS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET') return;
  const url = new URL(req.url);
  if(SDK.test(req.url)){                               // nube (Firebase): copia guardada, se renueva en segundo plano
    e.respondWith(caches.open(VERSION).then(c=>c.match(req).then(r=>{ const f=fetch(req).then(res=>{ if(res && (res.ok||res.type==='opaque')) c.put(req,res.clone()); return res; }).catch(()=>r); return r || f; })));
    return;
  }
  if(url.origin!==location.origin) return;            // tasa BCV, WhatsApp, etc.: siempre por internet
  if(req.mode==='navigate'){                           // la página: primero internet (para recibir actualizaciones), si no hay, la copia guardada
    e.respondWith(fetch(req).then(r=>{ const cp = r.clone(); caches.open(VERSION).then(c=>c.put('./index.html', cp)); return r; })
      .catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r || fetch(req).then(res=>{ const cp = res.clone(); caches.open(VERSION).then(c=>c.put(req, cp)); return res; })));
});
