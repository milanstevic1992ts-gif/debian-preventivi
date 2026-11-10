/* Service worker senza caching API: dati sensibili restano in IndexedDB. */
const CACHE='ge360-pwa-shell-v1.0.0';
const ASSETS=['/','/index.html','/style.css','/app.js','/storage.js','/logic.js','/default_checklist.json','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate', event=>{
  event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ge360-pwa-shell-') && k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));
});
self.addEventListener('message',event=>{
  if (event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith('/api/')) return;
  if(req.mode==='navigate') {
    event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
