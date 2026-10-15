/* MODE DÉMO — mêmes fonctions que api/supabase.js, mais tout reste dans ce navigateur :
 * données et photos dans IndexedDB (« eureka-demo2 »), photos servies par le service worker demo-sw.js.
 * Les règles appliquées sont celles de supabase/schema.sql (propriétaire, quota, expiration, super admin).
 * Compte de gestion de démonstration : eureka.admin / demo.eureka (différent de votre vrai mot de passe). */
import { PLANS, TB, GB } from '../config.js';

const DBNAME = 'eureka-demo2';
const ADMIN_UID = 'demo-admin', ADMIN_EMAIL = 'eureka.admin@eureka-smart-finder.app', ADMIN_PW = 'demo.eureka';
const DAY = 864e5;

/* ---------------------------------------------------------------- IndexedDB */
const STORES = ['docs', 'files', 'accounts'];
let idbP = null;
const idb = () => idbP || (idbP = new Promise((res, rej) => {
  const r = indexedDB.open(DBNAME, 1);
  r.onupgradeneeded = () => STORES.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const done = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (n, m = 'readonly') => (await idb()).transaction(n, m).objectStore(n);
const get = async (s, k) => done((await store(s)).get(k));
const put = async (s, k, v) => done((await store(s, 'readwrite')).put(v, k));
const del = async (s, k) => done((await store(s, 'readwrite')).delete(k));
async function all(s, prefix = '') {
  const st = await store(s);
  const [keys, vals] = await Promise.all([done(st.getAllKeys()), done(st.getAll())]);
  return keys.map((k, i) => [k, vals[i]]).filter(([k]) => String(k).startsWith(prefix));
}

let lock = Promise.resolve();
const serial = fn => { const p = lock.then(fn, fn); lock = p.catch(() => {}); return p; };

/* ---------------------------------------------------------------- notifications entre onglets */
const chan = 'BroadcastChannel' in self ? new BroadcastChannel(DBNAME) : null;
const listeners = new Set();
const changed = () => { listeners.forEach(f => f()); chan && chan.postMessage(1); };
if (chan) chan.onmessage = () => listeners.forEach(f => f());
function poll(load, cb) {
  let stop = false, last = '', busy = false;
  const tick = async () => {
    if (stop || busy) return; busy = true;
    try { const v = await load(); const k = JSON.stringify(v); if (k !== last) { last = k; cb(v); } } catch (e) { console.warn('[démo]', e); }
    busy = false;
  };
  listeners.add(tick); tick(); const iv = setInterval(tick, 2000);
  return () => { stop = true; listeners.delete(tick); clearInterval(iv); };
}

const err = (code, message) => Object.assign(new Error(message || code), { code });
const rid = () => crypto.randomUUID();

/* ---------------------------------------------------------------- photos servies par le service worker */
let FILES_BASE = '';
async function startServiceWorker() {
  if (!('serviceWorker' in navigator) || !isSecureContext) {
    throw err('network', 'Version de démonstration : ouvrez le site par http://localhost (commande « npx serve public »), pas par un double-clic.');
  }
  const root = new URL('./', document.baseURI);
  const reg = await navigator.serviceWorker.register(new URL('demo-sw.js', root).href, { scope: root.pathname });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise(r => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 3000); });
  }
  FILES_BASE = new URL('demo-files/', reg.scope).href;
}

/* ---------------------------------------------------------------- session (par onglet) */
const authCbs = new Set();
let user = null;
try { user = JSON.parse(sessionStorage.getItem('eurekaDemoUser') || 'null'); } catch (e) { user = null; }
function setUser(u) {
  user = u;
  try { sessionStorage.setItem('eurekaDemoUser', JSON.stringify(u)); } catch (e) {}
  authCbs.forEach(cb => cb(u));
}
const me = () => (user ? get('docs', 'profiles/' + user.id) : null);
async function requireAdmin() { const p = await me(); if (!p || !p.isAdmin) throw err('denied', 'Réservé au super administrateur.'); }
async function ownEvent(eid) {
  const ev = await get('docs', 'events/' + eid);
  if (!ev || !user || ev.ownerId !== user.id) throw err('quota', 'Cet événement ne vous appartient pas.');
  return ev;
}

/* ---------------------------------------------------------------- conversions */
const asDates = (o, keys) => { const r = { ...o }; keys.forEach(k => { r[k] = o[k] ? new Date(o[k]) : null; }); return r; };
const profileOut = p => p && asDates(p, ['createdAt']);
const eventOut = e => e && { ...asDates(e, ['createdAt', 'publishedAt', 'expiresAt']), published: !!e.indexed };
const publicUrl = path => FILES_BASE + encodeURIComponent(path);
const photoOut = p => ({ ...p, web: publicUrl(p.webPath), thumb: publicUrl(p.thumbPath), createdAt: new Date(p.createdAt) });

async function account(path, delta) {
  const eid = path.split('/')[0];
  const ev = await get('docs', 'events/' + eid); if (!ev) return;
  ev.bytes = Math.max(0, (ev.bytes || 0) + delta); await put('docs', 'events/' + eid, ev);
  const p = await get('docs', 'profiles/' + ev.ownerId);
  if (p) { p.usedBytes = Math.max(0, (p.usedBytes || 0) + delta); await put('docs', 'profiles/' + ev.ownerId, p); }
}
async function wipeEvent(eid) {
  for (const [k, f] of await all('files', eid + '/')) { await del('files', k); await account(k, -f.blob.size); }
  for (const [k] of await all('docs', 'photos/' + eid + '/')) await del('docs', k);
}
function tempPassword() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const s = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => A[b % A.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

async function expireGalleries() {
  await serial(async () => {
    let any = false;
    for (const [k, e] of await all('docs', 'events/')) {
      if (e.expired || !e.expiresAt || e.expiresAt > Date.now()) continue;
      await wipeEvent(e.id);
      await put('docs', k, { ...e, expired: true, indexed: false, photoCount: 0, faceCount: 0, noFaceCount: 0 });
      any = true;
    }
    if (any) changed();
  });
}

const api = {
  demo: true,

  onAuth(cb) { authCbs.add(cb); setTimeout(() => cb(user), 0); return () => authCbs.delete(cb); },
  async signIn(email, pw) {
    email = String(email || '').trim().toLowerCase();
    const acc = await get('accounts', email);
    if (!acc || acc.pw !== pw) throw err('bad-credentials');
    const p = await get('docs', 'profiles/' + acc.uid);
    if (p && p.disabled) throw err('disabled');
    setUser({ id: acc.uid, email });
  },
  async signOut() { setUser(null); },
  async updatePassword(pw) {
    if (!user) throw err('denied');
    if (String(pw).length < 8) throw err('weak-password');
    const acc = await get('accounts', user.email); await put('accounts', user.email, { ...acc, pw });
  },

  async getProfile(uid) { return profileOut(await get('docs', 'profiles/' + uid)); },
  watchProfile(uid, cb) { return poll(() => this.getProfile(uid), cb); },
  clearMustChange(uid) {
    return serial(async () => { const p = await get('docs', 'profiles/' + uid); if (p && user && uid === user.id) { await put('docs', 'profiles/' + uid, { ...p, mustChangePassword: false }); changed(); } });
  },

  async listEvents(uid) {
    return (await all('docs', 'events/')).map(([, e]) => e).filter(e => e.ownerId === uid)
      .sort((a, b) => b.createdAt - a.createdAt).map(eventOut);
  },
  watchEvents(uid, cb) { return poll(() => this.listEvents(uid), cb); },
  createEvent({ ownerId, name, date }) {
    return serial(async () => {
      const p = await me();
      if (!p || ownerId !== user.id || p.disabled) throw err('denied', 'Compte suspendu.');
      const id = rid();
      await put('docs', 'events/' + id, { id, ownerId, name: String(name).slice(0, 80), date: date || '', privateMode: true, friendSearch: true,
        photoCount: 0, faceCount: 0, noFaceCount: 0, dirty: false, bytes: 0, indexed: false, publishedAt: null, expiresAt: null,
        galleryDays: null, expired: false, createdAt: Date.now() });
      changed(); return id;
    });
  },
  updateEvent(id, patch) {
    return serial(async () => {
      const ev = await ownEvent(id);
      if (ev.expired) throw err('quota', 'Cette galerie a expiré.');
      const ok = ['name', 'date', 'privateMode', 'friendSearch', 'photoCount', 'faceCount', 'noFaceCount', 'dirty'];
      const n = { ...ev }; ok.forEach(k => { if (k in patch) n[k] = patch[k]; });
      await put('docs', 'events/' + id, n); changed();
    });
  },
  deleteEvent(ev) {
    return serial(async () => { await ownEvent(ev.id); await wipeEvent(ev.id); await del('docs', 'events/' + ev.id); changed(); });
  },

  newId: rid,
  publicUrl,
  upload(path, blob, { contentType, upsert = false } = {}) {
    return serial(async () => {
      const eid = path.split('/')[0];
      const ev = await get('docs', 'events/' + eid), p = await me();
      const old = await get('files', path);
      const ok = ev && user && ev.ownerId === user.id && !ev.expired && p && !p.disabled
        && (p.quotaBytes == null || (p.usedBytes || 0) < p.quotaBytes) && blob.size <= 15 * 1024 * 1024 && (!old || upsert);
      if (!ok) throw err('quota');
      if (old) await account(path, -old.blob.size);
      await put('files', path, { blob, ct: contentType || blob.type || 'application/octet-stream' });
      await account(path, blob.size);
      changed();
    });
  },
  async listPhotos(eid) {
    return (await all('docs', 'photos/' + eid + '/')).map(([, p]) => p).sort((a, b) => a.createdAt - b.createdAt).map(photoOut);
  },
  addPhoto(eid, p) {
    return serial(async () => {
      await ownEvent(eid);
      const row = { id: p.id, name: p.name, w: p.w, h: p.h, webPath: p.webPath, thumbPath: p.thumbPath, faces: p.faces, createdAt: Date.now() };
      await put('docs', 'photos/' + eid + '/' + p.id, row);
      return photoOut(row);
    });
  },
  deletePhoto(eid, p) {
    return serial(async () => {
      await ownEvent(eid);
      for (const path of [p.webPath, p.thumbPath]) { const f = await get('files', path); if (f) { await del('files', path); await account(path, -f.blob.size); } }
      await del('docs', 'photos/' + eid + '/' + p.id); changed();
    });
  },
  publish(eid) {
    return serial(async () => {
      const ev = await ownEvent(eid);
      if (ev.expired) throw err('quota', 'Cette galerie a expiré.');
      const p = await me(); if (!p || p.disabled) throw err('disabled');
      const now = Date.now();
      const n = { ...ev, indexed: true, dirty: false, publishedAt: now };
      if (!ev.expiresAt) { n.expiresAt = now + p.galleryDays * DAY; n.galleryDays = p.galleryDays; }
      await put('docs', 'events/' + eid, n); changed();
      return new Date(n.expiresAt);
    });
  },

  async getPublicEvent(eid) {
    const e = await get('docs', 'events/' + eid);
    if (!e) return null;
    const expired = e.expired || (e.expiresAt && e.expiresAt <= Date.now());
    const v = e.publishedAt ? '?v=' + e.publishedAt : '';
    return { id: e.id, name: e.name, date: e.date, privateMode: e.privateMode, friendSearch: e.friendSearch, expired: !!expired,
      expiresAt: e.expiresAt ? new Date(e.expiresAt) : null,
      indexUrl: e.indexed && !expired ? publicUrl(eid + '/index.json') + v : null,
      indexBinUrl: e.indexed && !expired ? publicUrl(eid + '/index.bin') + v : null };
  },

  admin: {
    async listProfiles() { await requireAdmin(); return (await all('docs', 'profiles/')).map(([, p]) => p).filter(p => !p.isAdmin).sort((a, b) => b.createdAt - a.createdAt).map(profileOut); },
    async listEvents() { await requireAdmin(); return (await all('docs', 'events/')).map(([, e]) => eventOut(e)); },
    createClient(d) {
      return serial(async () => {
        await requireAdmin();
        d = { ...d, plan: 'premium' };   // offre unique, photos illimitées
        const email = String(d.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('denied', 'Identifiant invalide : utilisez un e-mail ou un nom sans espace (ex. studio.lumiere).');
        if (await get('accounts', email)) throw err('denied', 'Un compte existe déjà avec cet identifiant.');
        const uid = rid(), password = tempPassword(), quotaBytes = null;
        const name = String(d.name || '').trim().slice(0, 80) || email, phone = String(d.phone || '').replace(/[^\d+]/g, '');
        await put('accounts', email, { uid, pw: password });
        await put('docs', 'profiles/' + uid, { id: uid, email, name, phone, plan: d.plan, quotaBytes, galleryDays: PLANS[d.plan].galleryDays,
          usedBytes: 0, disabled: false, mustChangePassword: true, isAdmin: false, createdAt: Date.now() });
        changed();
        return { uid, email, password, plan: d.plan, quotaBytes, galleryDays: PLANS[d.plan].galleryDays, name, phone };
      });
    },
    updateClient(d) {
      return serial(async () => {
        await requireAdmin();
        const p = await get('docs', 'profiles/' + d.uid); if (!p || p.isAdmin) throw err('denied', 'Client introuvable.');
        if (d.disabled !== undefined) p.disabled = !!d.disabled;
        await put('docs', 'profiles/' + d.uid, p); changed();
        return { ok: true, plan: p.plan, quotaBytes: p.quotaBytes, galleryDays: p.galleryDays, disabled: p.disabled };
      });
    },
    resetPassword(uid) {
      return serial(async () => {
        await requireAdmin();
        const acc = (await all('accounts')).find(([, a]) => a.uid === uid); if (!acc) throw err('denied', 'Compte introuvable.');
        const password = tempPassword(); await put('accounts', acc[0], { ...acc[1], pw: password });
        const p = await get('docs', 'profiles/' + uid); await put('docs', 'profiles/' + uid, { ...p, mustChangePassword: true });
        changed(); return { password };
      });
    },
    deleteClient(uid) {
      return serial(async () => {
        await requireAdmin();
        const evs = (await all('docs', 'events/')).filter(([, e]) => e.ownerId === uid);
        for (const [k, e] of evs) { await wipeEvent(e.id); await del('docs', k); }
        await del('docs', 'profiles/' + uid);
        for (const [email, a] of await all('accounts')) if (a.uid === uid) await del('accounts', email);
        changed(); return { ok: true, events: evs.length };
      });
    },
    recomputeUsage(uid) {
      return serial(async () => {
        await requireAdmin();
        let total = 0;
        for (const [k, e] of (await all('docs', 'events/')).filter(([, e]) => e.ownerId === uid)) {
          const bytes = (await all('files', e.id + '/')).reduce((a, [, f]) => a + f.blob.size, 0);
          total += bytes; await put('docs', k, { ...e, bytes });
        }
        const p = await get('docs', 'profiles/' + uid); await put('docs', 'profiles/' + uid, { ...p, usedBytes: total });
        changed(); return { usedBytes: total };
      });
    },
  },

  refresh() { setTimeout(() => listeners.forEach(f => f()), 50); },
  async resetDemo() {
    for (const s of STORES) await done((await store(s, 'readwrite')).clear());
    try { sessionStorage.removeItem('eurekaDemoUser'); } catch (e) {}
    changed();
  },
};

/* ---------------------------------------------------------------- démarrage */
await startServiceWorker();
if (!(await get('accounts', ADMIN_EMAIL))) {
  await put('accounts', ADMIN_EMAIL, { uid: ADMIN_UID, pw: ADMIN_PW });
  await put('docs', 'profiles/' + ADMIN_UID, { id: ADMIN_UID, email: ADMIN_EMAIL, name: 'Gestion', plan: 'premium', quotaBytes: 0, galleryDays: 7,
    usedBytes: 0, disabled: false, mustChangePassword: false, isAdmin: true, createdAt: Date.now() });
}
for (const [k, p] of await all('docs', 'profiles/')) if (!p.isAdmin && p.quotaBytes != null) await put('docs', k, { ...p, quotaBytes: null });
await expireGalleries();
setInterval(expireGalleries, 60000);

export default api;
