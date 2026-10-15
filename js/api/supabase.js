/* Données Eureka sur Supabase (Auth + Postgres + Storage + Edge Functions).
   Voir supabase/schema.sql pour les tables et les règles de sécurité. */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../supabase-config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const BUCKET = 'events';
const POLL_MS = 5000;

/* ---------------------------------------------------------------- erreurs */
function fail(e, fallback) {
  const msg = String(e?.message || e || fallback || 'Erreur');
  const err = new Error(msg);
  if (/invalid login credentials|invalid_credentials/i.test(msg)) err.code = 'bad-credentials';
  else if (/banned/i.test(msg)) err.code = 'disabled';
  else if (/password should be|weak/i.test(msg)) err.code = 'weak-password';
  else if (/row-level security|violates|unauthorized|403/i.test(msg) || e?.statusCode === '403') err.code = 'quota';
  else if (/permission denied|réservé/i.test(msg)) err.code = 'denied';
  else if (/failed to fetch|network/i.test(msg)) err.code = 'network';
  else if (/rate limit|too many/i.test(msg)) err.code = 'rate-limit';
  return err;
}
const must = ({ data, error }, fallback) => { if (error) throw fail(error, fallback); return data; };

/* ---------------------------------------------------------------- conversions base → page */
const d = v => (v ? new Date(v) : null);
const profileOf = r => r && ({
  id: r.id, email: r.email, name: r.name, phone: r.phone, plan: r.plan,
  quotaBytes: Number(r.quota_bytes), galleryDays: r.gallery_days, usedBytes: Number(r.used_bytes),
  disabled: r.disabled, mustChangePassword: r.must_change_password, isAdmin: r.is_admin, createdAt: d(r.created_at),
});
const eventOf = r => r && ({
  id: r.id, ownerId: r.owner, name: r.name, date: r.date || '', privateMode: r.private_mode, friendSearch: r.friend_search,
  photoCount: r.photo_count, faceCount: r.face_count, noFaceCount: r.no_face_count, dirty: r.dirty,
  bytes: Number(r.bytes), published: !!r.index_path, publishedAt: d(r.published_at), expiresAt: d(r.expires_at),
  galleryDays: r.gallery_days, expired: r.expired, createdAt: d(r.created_at),
});
const photoOf = r => ({
  id: r.id, name: r.name, w: r.w, h: r.h, webPath: r.web_path, thumbPath: r.thumb_path, faces: r.faces || [],
  web: publicUrl(r.web_path), thumb: publicUrl(r.thumb_path), createdAt: d(r.created_at),
});
const EVENT_COLS = { name: 'name', date: 'date', privateMode: 'private_mode', friendSearch: 'friend_search',
  photoCount: 'photo_count', faceCount: 'face_count', noFaceCount: 'no_face_count', dirty: 'dirty' };

function publicUrl(path) { return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }

/* Surveillance par interrogation régulière (simple et fiable, sans configuration « Realtime »). */
const watchers = new Set();
function poll(load, cb) {
  let stop = false, last = '';
  const tick = async () => {
    if (stop) return;
    try { const v = await load(); const k = JSON.stringify(v); if (k !== last) { last = k; cb(v); } } catch (e) { console.warn('[eureka]', e); }
  };
  tick(); const iv = setInterval(tick, POLL_MS); watchers.add(tick);
  return () => { stop = true; clearInterval(iv); watchers.delete(tick); };
}

async function adminCall(action, body = {}) {
  const { data, error } = await sb.functions.invoke('admin', { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (_) { /* réponse non JSON */ }
    throw fail({ message: msg });
  }
  return data;
}

async function removePaths(paths) {
  for (let i = 0; i < paths.length; i += 500) must(await sb.storage.from(BUCKET).remove(paths.slice(i, i + 500)));
}

export default {
  demo: false,

  /* ---------- connexion ---------- */
  onAuth(cb) {
    let lastId;
    const emit = s => { const u = s?.user ? { id: s.user.id, email: s.user.email } : null; if ((u && u.id) !== lastId) { lastId = u && u.id; cb(u); } };
    sb.auth.getSession().then(({ data }) => emit(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setTimeout(() => emit(s), 0));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
  async signOut() { await sb.auth.signOut(); },
  async updatePassword(password) { must(await sb.auth.updateUser({ password })); },

  /* ---------- profil ---------- */
  async getProfile(uid) { return profileOf(must(await sb.from('profiles').select('*').eq('id', uid).maybeSingle())); },
  watchProfile(uid, cb) { return poll(() => this.getProfile(uid), cb); },
  async clearMustChange(uid) { must(await sb.from('profiles').update({ must_change_password: false }).eq('id', uid)); },

  /* ---------- événements ---------- */
  async listEvents(uid) {
    return must(await sb.from('events').select('*').eq('owner', uid).order('created_at', { ascending: false })).map(eventOf);
  },
  watchEvents(uid, cb) { return poll(() => this.listEvents(uid), cb); },
  async createEvent({ ownerId, name, date }) {
    const r = must(await sb.from('events').insert({ owner: ownerId, name, date: date || null }).select('id').single());
    this.refresh(); return r.id;
  },
  async updateEvent(id, patch) {
    const row = {};
    for (const k in patch) if (EVENT_COLS[k]) row[EVENT_COLS[k]] = patch[k];
    must(await sb.from('events').update(row).eq('id', id));
    this.refresh();
  },
  async deleteEvent(ev, photos) {
    const paths = photos.flatMap(p => [p.webPath, p.thumbPath]).concat([`${ev.id}/index.json`, `${ev.id}/index.bin`]);
    await removePaths(paths);
    must(await sb.from('events').delete().eq('id', ev.id));
    this.refresh();
  },

  /* ---------- photos ---------- */
  newId: () => crypto.randomUUID(),
  publicUrl,
  async upload(path, blob, { contentType, cacheControl = '31536000', upsert = false } = {}) {
    must(await sb.storage.from(BUCKET).upload(path, blob, { contentType, cacheControl, upsert }));
  },
  async listPhotos(eid) {
    return must(await sb.from('photos').select('*').eq('event_id', eid).order('created_at')).map(photoOf);
  },
  async addPhoto(eid, p) {
    must(await sb.from('photos').insert({ id: p.id, event_id: eid, name: p.name, w: p.w, h: p.h,
      web_path: p.webPath, thumb_path: p.thumbPath, faces: p.faces }));
    return photoOf({ id: p.id, name: p.name, w: p.w, h: p.h, web_path: p.webPath, thumb_path: p.thumbPath, faces: p.faces, created_at: new Date().toISOString() });
  },
  async deletePhoto(eid, p) {
    await removePaths([p.webPath, p.thumbPath]);
    must(await sb.from('photos').delete().eq('id', p.id));
    this.refresh();
  },
  async publish(eid) {
    const at = must(await sb.rpc('publish_event', { eid, idx: `${eid}/index.json`, idx_bin: `${eid}/index.bin` }));
    this.refresh(); return new Date(at);
  },

  /* ---------- page invité ---------- */
  async getPublicEvent(eid) {
    const rows = must(await sb.rpc('get_public_event', { eid }));
    const r = rows && rows[0]; if (!r) return null;
    const v = r.published_at ? '?v=' + new Date(r.published_at).getTime() : '';
    return {
      id: r.id, name: r.name, date: r.date || '', privateMode: r.private_mode, friendSearch: r.friend_search,
      expired: r.expired, expiresAt: d(r.expires_at),
      indexUrl: r.index_path ? publicUrl(r.index_path) + v : null,
      indexBinUrl: r.index_bin_path ? publicUrl(r.index_bin_path) + v : null,
    };
  },

  /* ---------- super admin ---------- */
  admin: {
    async listProfiles() { return must(await sb.from('profiles').select('*').eq('is_admin', false).order('created_at', { ascending: false })).map(profileOf); },
    async listEvents() { return must(await sb.from('events').select('*')).map(eventOf); },
    createClient: d => adminCall('createClient', d),
    updateClient: d => adminCall('updateClient', d),
    resetPassword: uid => adminCall('resetPassword', { uid }),
    deleteClient: uid => adminCall('deleteClient', { uid }),
    recomputeUsage: uid => adminCall('recomputeUsage', { uid }),
  },

  /** Relance tout de suite les surveillances (après un envoi, une suppression…). */
  refresh() { setTimeout(() => watchers.forEach(t => t()), 300); },
};
