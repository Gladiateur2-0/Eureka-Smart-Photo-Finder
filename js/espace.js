/* Espace client : connexion, stockage, événements, envoi des photos, publication, QR code. */
import { api, DEMO, errorText } from './api.js';
import * as Face from './face.js';
import { planOf, formatBytes, whatsappLink, loginToEmail } from './config.js';
import { $, toast, setEngine, slug, frDate, esc, saveBlob, drawQrCard } from './ui.js';

const WEB_MAX = 2560, THUMB_MAX = 480, DETECT_MAX = 1280, PARALLEL_UPLOADS = 3;
const DAY = 864e5;
const state = { user: null, profile: null, events: [], currentId: null, photos: [], busy: false, unsub: [] };
const current = () => state.events.find(e => e.id === state.currentId) || null;

/* ---------- Reconnaissance des visages ---------- */
function afterIntro() {
  return new Promise(res => {
    const check = () => (window.eurekaIntroDone ? window.eurekaIntroDone.then(res) : setTimeout(check, 50));
    check(); setTimeout(res, 15000);
  });
}
const engine = () => afterIntro().then(() => Face.loadEngine(setEngine));
$('#engine').addEventListener('click', () => { if ($('#engineDot').classList.contains('err')) engine().catch(e => toast(e.message)); });

/* ---------- WhatsApp ---------- */
$('#waLogin').href = whatsappLink('Bonjour, j\'aimerais un accès Eureka Smart Photo Finder pour mes événements (ou j\'ai oublié mon mot de passe).');

/* Envoi refusé par le serveur : galerie terminée ou compte suspendu (l'espace, lui, est illimité). */
function showBlocked(extra) {
  const p = state.profile || {};
  $('#fullTxt').textContent = (extra ? extra + ' ' : '') + (p.disabled
    ? 'Votre compte est suspendu. Écrivez-nous sur WhatsApp pour le réactiver.'
    : 'Cette galerie est peut-être arrivée à échéance. Créez un nouvel événement, ou écrivez-nous sur WhatsApp.');
  $('#fullWa').href = whatsappLink('Bonjour, c\'est ' + (p.name || p.email || '') + '. Je n\'arrive plus à envoyer de photos sur Eureka Smart Photo Finder.');
  $('#fullModal').hidden = false; $('#fullWa').focus();
}
$('#fullClose').addEventListener('click', () => { $('#fullModal').hidden = true; });
$('#fullModal').addEventListener('click', e => { if (e.target.id === 'fullModal') $('#fullModal').hidden = true; });

/* ---------- Connexion ---------- */
const login = window.Eureka.setupDoorLogin({
  scene: $('#doorScene'), form: $('#loginForm'), idInput: $('#email'), pwInput: $('#password'),
  msg: $('#loginMsg'), toggle: $('#pwToggle'), submit: $('#loginBtn'), errorText,
  signIn: (id, pw) => api.signIn(loginToEmail(id), pw),
});
$('#logout').addEventListener('click', () => api.signOut());

api.onAuth(async user => {
  state.unsub.forEach(u => u()); state.unsub = [];
  if (user) await login.waitGate();          // on laisse le personnage entrer avant d'ouvrir l'espace
  state.user = user; state.profile = null; state.events = []; state.currentId = null; state.photos = [];
  $('#login').hidden = !!user; $('#dash').hidden = !user; $('#userBox').hidden = !user;
  $('#evDetail').hidden = true; $('#evEmpty').hidden = false;
  if (!user) { login.reset(); return; }
  document.documentElement.classList.add('page-enter');
  setTimeout(() => document.documentElement.classList.remove('page-enter'), 900);
  state.unsub.push(api.watchProfile(user.id, onProfile));
  state.unsub.push(api.watchEvents(user.id, onEvents));
  engine().catch(e => toast(e.message));
});

function onProfile(p) {
  if (!p) {
    $('#evList').innerHTML = '<div class="msg err">Aucun espace n\'est rattaché à ce compte. Écrivez-nous sur WhatsApp, on regarde ça.</div>';
    return;
  }
  if (p.isAdmin) {
    $('#evList').innerHTML = '<div class="msg">Ce compte sert à la gestion. <a href="superadmin.html">Ouvrir la page de gestion</a></div>';
  }
  const first = !state.profile;
  state.profile = p;
  if (p.disabled && first) toast('Ce compte est suspendu. Écrivez-nous sur WhatsApp.');
  if (p.mustChangePassword) $('#pwModal').hidden = false;
  renderMeter(); renderDetail();
}

function onEvents(list) {
  const known = new Set(state.events.map(e => e.id));
  state.events = list;
  renderEvents(); renderMeter();
  const cur = current();
  if (cur && !known.has(cur.id) || (cur && $('#evDetail').hidden)) selectEvent(cur.id);
  else if (!cur && state.events[0]) selectEvent(state.events[0].id);
  else if (!cur) { $('#evDetail').hidden = true; $('#evEmpty').hidden = false; }
  else renderDetail();
}

/* ---------- Mot de passe provisoire ---------- */
$('#pwForm').addEventListener('submit', async e => {
  e.preventDefault();
  const a = $('#pw1').value, b = $('#pw2').value;
  if (a.length < 8) { $('#pwMsg').innerHTML = '<div class="msg err">Il faut au moins 8 caractères.</div>'; return; }
  if (a !== b) { $('#pwMsg').innerHTML = '<div class="msg err">Les deux saisies ne correspondent pas.</div>'; return; }
  try {
    await api.updatePassword(a);
    await api.clearMustChange(state.user.id);
    $('#pwModal').hidden = true; toast('C\'est noté, votre mot de passe est enregistré.');
  } catch (err) { $('#pwMsg').innerHTML = '<div class="msg err">' + esc(errorText(err)) + '</div>'; }
});

/* ---------- Stockage (illimité : on affiche simplement ce qui est utilisé) ---------- */
function renderMeter() {
  const p = state.profile; if (!p) return;
  const plan = planOf(p.plan), used = Math.max(0, p.usedBytes || 0);
  $('#helloName').textContent = (p.name || '').trim().split(/\s+/)[0] || '';
  const n = state.events.length;
  $('#welcomeTxt').textContent = n
    ? (n === 1 ? 'Un événement' : n + ' événements') + ' en cours, ' + formatBytes(used) + ' de photos.'
    : 'On commence par créer un événement ? Son QR code sera prêt tout de suite.';
  $('#userEmail').textContent = p.name || state.user.email || '';
  $('#usedTxt').textContent = formatBytes(used);
  $('#planInfo').textContent = 'Photos illimitées. Chaque galerie reste en ligne ' + (p.galleryDays || plan.galleryDays) +
    ' jours après sa première publication, puis elle est supprimée.';

  const evs = state.events.filter(e => (e.bytes || 0) > 0).sort((a, b) => b.bytes - a.bytes);
  const max = Math.max(1, ...evs.map(e => e.bytes));
  $('#evBytes').innerHTML = evs.length
    ? evs.map(e => '<div><span>' + esc(e.name) + '</span><span>' + formatBytes(e.bytes) + '</span><i style="width:' + Math.max(2, e.bytes / max * 100).toFixed(1) + '%"></i></div>').join('')
    : '';
}

/* ---------- Événements ---------- */
function statusOf(ev) {
  if (ev.expired) return ['Terminé', 'off'];
  if (ev.published && !ev.dirty) return ['En ligne', 'ok'];
  if (ev.published) return ['À republier', 'todo'];
  return ['Brouillon', 'todo'];
}
function renderEvents() {
  const box = $('#evList');
  if (!state.events.length) { box.innerHTML = '<p class="sub">Rien pour l\'instant.</p>'; return; }
  box.innerHTML = '';
  state.events.forEach(ev => {
    const b = document.createElement('button');
    b.className = 'evitem'; b.setAttribute('aria-current', state.currentId === ev.id);
    const [st, cls] = statusOf(ev);
    b.innerHTML = '<strong>' + esc(ev.name) + '</strong><span>' + esc(frDate(ev.date) || 'Sans date') + ' · ' +
      (ev.photoCount || 0) + ' photo' + ((ev.photoCount || 0) > 1 ? 's' : '') + '</span><em class="tag ' + cls + '">' + st + '</em>';
    b.addEventListener('click', () => selectEvent(ev.id));
    box.appendChild(b);
  });
}
$('#newEv').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#nName').value.trim(); if (!name) return;
  const btn = e.submitter || $('#newEv button'); btn.disabled = true;
  try {
    const id = await api.createEvent({ ownerId: state.user.id, name, date: $('#nDate').value || '' });
    $('#newEv').reset(); toast('Événement créé. Le QR code est prêt.');
    state.currentId = id; $('#evDetail').hidden = true;
    if (current()) selectEvent(id);
  } catch (err) { console.error(err); toast(errorText(err)); }
  btn.disabled = false;
});

/* Lien invité : guest.html?e=… fonctionne sur tous les hébergeurs (GitHub Pages compris). */
const guestLink = id => new URL('guest.html?e=' + id, location.href).href;

async function selectEvent(id) {
  state.currentId = id; renderEvents();
  const ev = current(); if (!ev) return;
  $('#evEmpty').hidden = true; $('#evDetail').hidden = false;
  const link = guestLink(id);
  $('#qrUrl').textContent = link; $('#openGuest').href = link;
  drawQrCard($('#qrCard'), { name: ev.name, date: ev.date, link });
  state.photos = [];
  renderDetail();
  $('#thumbs').innerHTML = '<p class="sub">Un instant…</p>';
  try {
    const photos = await api.listPhotos(id);
    if (state.currentId !== id) return;
    state.photos = photos;
    renderPhotos(); renderDetail();
  } catch (e) { console.error(e); $('#thumbs').innerHTML = '<div class="msg err">' + esc(errorText(e)) + '</div>'; }
}
if (document.fonts?.ready) document.fonts.ready.then(() => { const ev = current(); if (ev) drawQrCard($('#qrCard'), { name: ev.name, date: ev.date, link: guestLink(ev.id) }); });

const fmtDay = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const fmtTime = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function renderDetail() {
  const ev = current(); if (!ev || $('#evDetail').hidden) return;
  $('#dName').textContent = ev.name; $('#dDate').textContent = frDate(ev.date) || 'Pas de date';
  $('#optPrivate').checked = ev.privateMode !== false; $('#optFriend').checked = ev.friendSearch !== false;
  $('#optPrivate').disabled = $('#optFriend').disabled = !!ev.expired;
  const p = state.photos;
  $('#kPhotos').textContent = ev.expired ? 0 : p.length;
  $('#kFaces').textContent = ev.expired ? 0 : p.reduce((a, x) => a + (x.faces?.length || 0), 0);
  $('#kBytes').textContent = formatBytes(ev.bytes);
  $('#kPub').textContent = ev.publishedAt ? fmtTime(ev.publishedAt) : '–';

  const days = state.profile?.galleryDays || planOf(state.profile?.plan).galleryDays;
  const exp = ev.expiresAt;
  const [st, cls] = statusOf(ev);
  $('#pubStatus').className = 'tag ' + cls; $('#pubStatus').textContent = st;
  $('#expiryTxt').innerHTML = ev.expired
    ? 'Cette galerie est terminée' + (exp ? ' depuis le <b>' + exp.toLocaleDateString('fr-FR') + '</b>' : '') + '. Les photos ont été supprimées et le QR code l\'indique aux invités.'
    : exp ? 'En ligne jusqu\'au <b>' + fmtDay(exp) + ' à ' + fmtTime(exp) + '</b>, encore ' + Math.max(0, Math.ceil((exp - Date.now()) / DAY)) + ' jour(s).'
    : 'Une fois publiée, la galerie reste en ligne <b>' + days + ' jours</b>.';
  $('#photosCard').hidden = !!ev.expired;
  $('#gridInfo').textContent = p.length ? p.length + ' photo' + (p.length > 1 ? 's' : '') : '';
}

function thumbEl(p) {
  const d = document.createElement('div'); d.className = 'thumb';
  const n = p.faces?.length || 0;
  d.innerHTML = '<img loading="lazy" alt=""><span class="badge' + (n ? '' : ' zero') + '" title="Visages repérés">' + n + '</span><button class="del" title="Retirer cette photo" aria-label="Retirer cette photo">✕</button>';
  d.querySelector('img').src = p.thumb; d.querySelector('img').alt = p.name || '';
  d.querySelector('.del').addEventListener('click', () => deletePhoto(p, d));
  return d;
}
function renderPhotos() {
  const g = $('#thumbs'); g.innerHTML = '';
  if (!state.photos.length) { g.innerHTML = '<div class="empty" style="grid-column:1/-1">Pas encore de photos. Le petit chiffre sur chaque vignette indiquera combien de visages on y a trouvé.</div>'; return; }
  const frag = document.createDocumentFragment(); state.photos.forEach(p => frag.appendChild(thumbEl(p))); g.appendChild(frag);
}

['#optPrivate', '#optFriend'].forEach(sel => $(sel).addEventListener('change', async () => {
  const ev = current(); if (!ev) return;
  try { await api.updateEvent(ev.id, { privateMode: $('#optPrivate').checked, friendSearch: $('#optFriend').checked }); toast('Réglage enregistré'); }
  catch (e) { toast(errorText(e)); }
}));

/* ---------- Envoi des photos ---------- */
const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('hover'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('hover'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
$('#photoInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
window.addEventListener('beforeunload', e => { if (state.busy) { e.preventDefault(); e.returnValue = ''; } });

async function addFiles(list) {
  const files = [...list].filter(f => f.type.startsWith('image/'));
  const ev = current();
  if (!files.length || !ev || ev.expired) return;
  if (state.busy) { toast('Un envoi est déjà en cours, patientez un peu.'); return; }
  if (state.profile?.disabled) { toast('Compte suspendu. Écrivez-nous sur WhatsApp.'); return; }

  state.busy = true; $('#progWrap').hidden = false; setProg(0, 'On prépare la reconnaissance des visages…');
  try { await engine(); } catch (e) { state.busy = false; setProg(0, 'La reconnaissance n\'a pas pu démarrer : ' + e.message); return; }
  if (!state.photos.length) $('#thumbs').innerHTML = '';
  let done = 0, failed = 0, stoppedFull = false; const inflight = new Set();
  for (const file of files) {
    if (state.currentId !== ev.id) break;
    try {
      const img = await Face.loadImage(file);
      const web = Face.scaled(img, WEB_MAX), thumb = Face.scaled(img, THUMB_MAX);
      const faces = await Face.detectFaces(Face.scaled(img, DETECT_MAX));
      const [webBlob, thumbBlob] = await Promise.all([Face.toBlob(web, 'image/jpeg', 0.86), Face.toBlob(thumb, 'image/jpeg', 0.75)]);
      const job = uploadPhoto(ev, file.name, web.width, web.height, faces, webBlob, thumbBlob)
        .then(p => { if (state.currentId === ev.id) { state.photos.push(p); $('#thumbs').appendChild(thumbEl(p)); } })
        .catch(e => { failed++; console.error(e); if (e.code === 'quota') stoppedFull = true; else toast('« ' + file.name + ' » n\'est pas passée.'); })
        .finally(() => { inflight.delete(job); done++; setProg(done / files.length, done + ' sur ' + files.length + (failed ? ' (' + failed + ' en échec)' : '')); });
      inflight.add(job);
      if (inflight.size >= PARALLEL_UPLOADS) await Promise.race(inflight);
      if (stoppedFull) break;
    } catch (e) { failed++; done++; console.error(e); toast(e.message); }
  }
  await Promise.all(inflight);
  const faceCount = state.photos.reduce((a, x) => a + (x.faces?.length || 0), 0);
  const noFace = state.photos.filter(x => !x.faces?.length).length;
  try { await api.updateEvent(ev.id, { photoCount: state.photos.length, faceCount, noFaceCount: noFace, dirty: true }); } catch (e) { console.error(e); }
  renderDetail();
  if (state.photos.length) { setProg(1, 'Envoi terminé, on met la galerie en ligne…'); await publish(); }
  state.busy = false;
  if (stoppedFull) {
    const left = files.length - done;
    setProg(done / files.length, 'Envoi interrompu : ' + left + ' photo(s) non envoyée(s).');
    showBlocked(left > 0 ? left + ' photo(s) n\'ont pas pu partir.' : '');
  }
}
function setProg(r, text) { $('#progBar').style.width = Math.round(r * 100) + '%'; $('#progText').textContent = text; }

async function uploadPhoto(ev, name, w, h, faces, webBlob, thumbBlob) {
  const id = api.newId();
  const webPath = ev.id + '/photos/' + id + '.jpg', thumbPath = ev.id + '/thumbs/' + id + '.jpg';
  await Promise.all([
    api.upload(webPath, webBlob, { contentType: 'image/jpeg' }),
    api.upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' }),
  ]);
  return api.addPhoto(ev.id, { id, name, w, h, webPath, thumbPath,
    faces: faces.map(f => ({ b: f.box, q: Face.int8ToBase64(Face.quantize(f.desc)) })) });
}

async function deletePhoto(p, el) {
  const ev = current(); if (!ev || state.busy || ev.expired) return;
  el.style.opacity = .4;
  try {
    await api.deletePhoto(ev.id, p);
    state.photos = state.photos.filter(x => x.id !== p.id); el.remove();
    await api.updateEvent(ev.id, { photoCount: state.photos.length,
      faceCount: state.photos.reduce((a, x) => a + (x.faces?.length || 0), 0),
      noFaceCount: state.photos.filter(x => !x.faces?.length).length, dirty: true });
    renderDetail(); toast('Photo retirée. Republiez la galerie pour que ce soit pris en compte.');
  } catch (e) { el.style.opacity = 1; toast(errorText(e)); }
}

/* ---------- Publication : un index (json + empreintes binaires) lu par la page invité ---------- */
$('#publishBtn').addEventListener('click', () => publish());
async function publish() {
  const ev = current(); if (!ev || ev.expired) return;
  if (!state.photos.length) { toast('Ajoutez d\'abord quelques photos.'); return; }
  const btn = $('#publishBtn'); btn.disabled = true; btn.textContent = 'Publication…';
  try {
    const photos = [], chunks = [];
    for (const p of state.photos) {
      const f = p.faces || [];
      photos.push({ id: p.id, n: p.name, w: p.w, h: p.h, web: p.web, thumb: p.thumb, f: f.map(x => x.b) });
      f.forEach(x => chunks.push(Face.base64ToInt8(x.q)));
    }
    const bin = new Int8Array(chunks.length * 128); chunks.forEach((c, i) => bin.set(c, i * 128));
    const json = JSON.stringify({ v: 1, eventId: ev.id, updatedAt: Date.now(), faces: chunks.length, photos });
    const opts = { upsert: true, cacheControl: '0' };
    await api.upload(ev.id + '/index.json', new Blob([json], { type: 'application/json' }), { ...opts, contentType: 'application/json' });
    await api.upload(ev.id + '/index.bin', new Blob([bin.buffer], { type: 'application/octet-stream' }), { ...opts, contentType: 'application/octet-stream' });
    const expiresAt = await api.publish(ev.id);
    setProg(1, 'C\'est en ligne : ' + photos.length + ' photos, ' + chunks.length + ' visages. Jusqu\'au ' + fmtDay(expiresAt) + '.');
    toast('Galerie en ligne');
  } catch (e) {
    console.error(e);
    if (e.code === 'quota') showBlocked('La galerie n\'a pas pu être publiée.');
    else toast('Publication impossible : ' + errorText(e));
  }
  btn.disabled = false; btn.textContent = 'Publier la galerie';
}

/* ---------- QR code et suppression ---------- */
$('#dlQr').addEventListener('click', () => $('#qrCard').toBlob(b => b && saveBlob(b, 'qr-' + slug(current()?.name) + '.png'), 'image/png'));
$('#copyLink').addEventListener('click', () => {
  const t = $('#qrUrl').textContent;
  navigator.clipboard?.writeText(t).then(() => toast('Lien copié'), () => toast(t));
});
let delArmed = null;
$('#delEvent').addEventListener('click', async () => {
  const ev = current(); if (!ev || state.busy) return;
  const btn = $('#delEvent');
  if (delArmed !== ev.id) {
    delArmed = ev.id; btn.textContent = 'Sûr ? Ça supprime aussi ' + state.photos.length + ' photo(s)';
    setTimeout(() => { if (delArmed === ev.id) { delArmed = null; btn.textContent = 'Supprimer l\'événement'; } }, 6000);
    return;
  }
  delArmed = null; btn.disabled = true; btn.textContent = 'Suppression…';
  try {
    await api.deleteEvent(ev, state.photos);
    state.currentId = null; state.photos = []; $('#evDetail').hidden = true; $('#evEmpty').hidden = false;
    toast('Événement supprimé, la place est libérée.');
  } catch (e) { toast(errorText(e)); }
  btn.disabled = false; btn.textContent = 'Supprimer l\'événement';
});

if (DEMO) document.documentElement.classList.add('is-demo');
