/* Mode démo : sert les photos et les index enregistrés dans le navigateur (IndexedDB « eureka-demo »)
   aux adresses « …/demo-files/<chemin> », comme le ferait Cloud Storage. Inutilisé en ligne. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

function readFile(path) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('eureka-demo2', 1);
    r.onupgradeneeded = () => ['docs', 'files', 'accounts'].forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const g = r.result.transaction('files').objectStore('files').get(path);
      g.onsuccess = () => res(g.result);
      g.onerror = () => rej(g.error);
    };
  });
}

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const i = u.pathname.indexOf('/demo-files/');
  if (u.origin !== self.location.origin || i < 0) return;
  const path = decodeURIComponent(u.pathname.slice(i + '/demo-files/'.length));
  e.respondWith(readFile(path).then(
    f => f ? new Response(f.blob, { headers: { 'Content-Type': f.ct || 'application/octet-stream', 'Cache-Control': 'no-store' } })
           : new Response('Fichier introuvable (mode démo)', { status: 404 }),
    () => new Response('Erreur de lecture (mode démo)', { status: 500 })
  ));
});
