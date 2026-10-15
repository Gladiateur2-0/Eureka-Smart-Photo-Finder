/* Page invité (guest.html?e=ID) : charge l'index publié par l'organisateur,
   compare le selfie sur le téléphone (rien n'est envoyé) et télécharge la sélection. */
import { api } from './api.js';
import * as Face from './face.js';
import { $, $$, toast, setEngine, slug, frDate, esc, saveBlob } from './ui.js';

const state = {
  ev: null, photos: [], descs: [], me: [], friend: [], threshold: 0.52, filter: 'all',
  removed: new Set(), unpicked: new Set(), matches: [], maybes: [], indexReady: false, engineReady: false,
};
const fatal = html => { $('#gFatal').innerHTML = '<div class="msg err" style="margin-top:14px">' + html + '</div>'; $('#gMain').hidden = true; };

/* ---------- Chargement de l'événement et de l'index ---------- */
function eventId() {
  const m = location.pathname.match(/\/e\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : new URLSearchParams(location.search).get('e');
}
async function init() {
  const id = eventId();
  if (!id) { $('#gName').textContent = 'Lien incomplet'; return fatal('Ce lien ne mène à aucun événement. Scannez à nouveau le QR code.'); }
  try {
    const ev = state.ev = await api.getPublicEvent(id);
    if (!ev) { $('#gName').textContent = 'Événement introuvable'; return fatal('Cet événement n\'existe pas, ou il a été supprimé.'); }
    $('#gName').textContent = ev.name; $('#gDate').textContent = frDate(ev.date);
    document.title = ev.name + ' · Mes photos';
    $('#selfieFriend').hidden = ev.friendSearch === false;
    const exp = ev.expiresAt;
    if (ev.expired || (exp && exp <= new Date())) {
      $('#gCount').textContent = 'terminée';
      return fatal('Cette galerie n\'est plus en ligne' + (exp ? ' depuis le ' + exp.toLocaleDateString('fr-FR') : '') + '. Si vous aviez besoin d\'une photo, demandez-la à l\'organisateur.');
    }
    if (!ev.indexUrl) { $('#gCount').textContent = 'bientôt'; return fatal('Les photos ne sont pas encore en ligne. Revenez un peu plus tard avec le même QR code, il restera valable.'); }
    if (exp) $('#gExpiry').innerHTML = 'En ligne jusqu\'au <b>' + exp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + '</b>. Pensez à télécharger vos photos avant.';
    $('#gMain').hidden = false;
    $('#gCount').textContent = 'chargement…';
    const [j, b] = await Promise.all([
      fetch(ev.indexUrl, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); }),
      fetch(ev.indexBinUrl, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('empreintes ' + r.status); return r.arrayBuffer(); }),
    ]);
    const q = new Int8Array(b); let k = 0;
    state.photos = j.photos.map(p => ({ ...p, faceIdx: p.f.map(() => k++) }));
    for (let i = 0; i < k; i++) state.descs.push(Face.dequantize(q, i * 128));
    state.indexReady = true;
    const n = state.photos.length; $('#gCount').textContent = n + ' photo' + (n > 1 ? 's' : '');
    $('#allWrap').hidden = ev.privateMode !== false;
    gate();
  } catch (e) {
    console.error(e);
    fatal(e.message && /Failed to fetch|NetworkError|Load failed/.test(e.message)
      ? 'Impossible de récupérer la galerie. Vérifiez votre connexion et réessayez.'
      : 'Quelque chose a coincé : ' + esc(e.message));
  }
}

/* On attend la fin de l'animation d'ouverture avant de charger la reconnaissance (plus fluide). */
function afterIntro() {
  return new Promise(res => {
    const check = () => (window.eurekaIntroDone ? window.eurekaIntroDone.then(res) : setTimeout(check, 50));
    check(); setTimeout(res, 15000);
  });
}
afterIntro().then(() => Face.loadEngine(setEngine)).then(() => { state.engineReady = true; gate(); }).catch(e => toast(e.message));
$('#engine').addEventListener('click', () => { if ($('#engineDot').classList.contains('err')) Face.loadEngine(setEngine).then(() => { state.engineReady = true; gate(); }).catch(e => toast(e.message)); });
init();

/* ---------- Selfies ---------- */
function gate() {
  const ok = $('#consent').checked && state.engineReady && state.indexReady;
  $('#selfieMe').classList.toggle('disabled', !ok);
  $('#selfieFriend').classList.toggle('disabled', !ok || !state.me.length);
  if (state.me.length) return;
  let m = '';
  if (!state.indexReady) m = 'On charge la galerie…';
  else if (!state.engineReady) m = 'On prépare la reconnaissance (environ 12 Mo, seulement la première fois)…';
  else if (!$('#consent').checked) m = 'Cochez la case juste au-dessus, puis prenez votre selfie.';
  $('#gMsg').innerHTML = m ? '<div class="msg">' + m + '</div>' : '';
}
$('#consent').addEventListener('change', gate);
$('#inMe').addEventListener('change', e => { selfie(e.target.files[0], 'me'); e.target.value = ''; });
$('#inFriend').addEventListener('change', e => { selfie(e.target.files[0], 'friend'); e.target.value = ''; });
$('#addAngle').addEventListener('click', () => $('#inAngle').click());
$('#inAngle').addEventListener('change', e => { selfie(e.target.files[0], 'angle'); e.target.value = ''; });

async function selfie(file, who) {
  if (!file) return;
  $('#gMsg').innerHTML = '<div class="msg">On regarde votre selfie…</div>';
  try {
    const img = await Face.loadImage(file), c = Face.scaled(img, 900);
    const d = await Face.detectSelfie(c);
    if (!d) { $('#gMsg').innerHTML = '<div class="msg err">On ne voit pas bien votre visage. Réessayez de face, avec de la lumière, sans lunettes de soleil.</div>'; return; }
    const b = d.box, s = Math.max(b.width, b.height) * 1.5, av = document.createElement('canvas'); av.width = av.height = 160;
    av.getContext('2d').drawImage(c, b.x + b.width / 2 - s / 2, b.y + b.height / 2 - s / 2, s, s, 0, 0, 160, 160);
    if (who === 'angle') {
      // Une photo de plus de votre visage : la recherche devient plus fiable.
      state.me.push(d.desc); $('#gMsg').innerHTML = ''; toast('Merci, c\'est ajouté (' + state.me.length + ' photos de vous).');
      $('#meTxt').textContent = state.me.length + ' photos de vous'; search(); return;
    }
    const box = who === 'me' ? '#avMe' : '#avFriend', im = new Image();
    im.alt = who === 'me' ? 'Votre visage' : 'Visage du proche'; im.src = av.toDataURL('image/jpeg', .8);
    $(box).innerHTML = ''; $(box).appendChild(im);
    if (who === 'me') { state.me = [d.desc]; state.removed.clear(); $('#meTxt').textContent = 'Reprendre le selfie'; $('#addAngle').hidden = false; }
    else { state.friend = [d.desc]; $('#friendTxt').textContent = 'Changer de proche'; $('[data-f="together"]').disabled = false; }
    $('#gMsg').innerHTML = ''; gate(); search(true);
    $('#gResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error(e); $('#gMsg').innerHTML = '<div class="msg err">Impossible d\'ouvrir cette image. Essayez avec une autre.</div>'; }
}

/* ---------- Recherche ---------- */
function best(refs, p, skip = -1) {
  let m = { d: 9, i: -1 };
  p.faceIdx.forEach((gi, i) => { if (i === skip) return; refs.forEach(r => { const d = Face.distance(r, state.descs[gi]); if (d < m.d) m = { d, i }; }); });
  return m;
}
function search(fresh) {
  if (!state.me.length) return;
  const th = state.threshold; state.matches = []; state.maybes = [];
  state.photos.forEach(p => {
    if (!p.faceIdx.length || state.removed.has(p.id)) return;
    const m = best(state.me, p);
    const f = state.friend.length ? best(state.friend, p, m.i) : { d: 9, i: -1 };
    const rec = { p, d: m.d, i: m.i, together: f.d < th, fi: f.i };
    if (m.d < th) state.matches.push(rec); else if (m.d < th + 0.07) state.maybes.push(rec);
  });
  state.matches.sort((a, b) => a.d - b.d); state.maybes.sort((a, b) => a.d - b.d); state.maybes = state.maybes.slice(0, 6);
  if (fresh) state.unpicked.clear();
  resetShare(); render();
}
function fitRings(el, p) {
  const img = el.querySelector('img');
  const place = () => {
    const iw = img.naturalWidth, ih = img.naturalHeight, cw = el.clientWidth, ch = el.clientHeight; if (!iw || !cw) return;
    const s = Math.max(cw / iw, ch / ih), dw = iw * s, dh = ih * s, ox = (cw - dw) / 2, oy = (ch - dh) / 2;
    el.querySelectorAll('.ring').forEach(r => {
      const [x, y, w, h] = p.f[+r.dataset.i], pad = .12;
      r.style.left = (ox + (x - w * pad) * dw) + 'px'; r.style.top = (oy + (y - h * pad) * dh) + 'px';
      r.style.width = (w * (1 + 2 * pad) * dw) + 'px'; r.style.height = (h * (1 + 2 * pad) * dh) + 'px';
    });
  };
  if (img.complete) place(); else img.addEventListener('load', place);
}
function render() {
  if (!state.me.length) { $('#gResults').hidden = true; return; }
  $('#gResults').hidden = false;
  let list = state.matches;
  if (state.filter === 'solo') list = list.filter(m => m.p.f.length === 1);
  if (state.filter === 'group') list = list.filter(m => m.p.f.length > 1);
  if (state.filter === 'together') list = list.filter(m => m.together);
  const g = $('#resGrid'); g.innerHTML = '';
  if (!list.length) g.innerHTML = '<div class="msg" style="grid-column:1/-1">' + (state.matches.length ? 'Rien avec ce filtre.' : 'On n\'a rien trouvé. Essayez « Large », ou un selfie mieux éclairé.') + '</div>';
  list.forEach((m, i) => {
    const el = document.createElement('div'); el.className = 'res';
    const sel = !state.unpicked.has(m.p.id);
    el.innerHTML = '<img alt="" loading="lazy"><span class="ring" data-i="' + m.i + '"></span>' + (m.together && m.fi >= 0 ? '<span class="ring friend" data-i="' + m.fi + '"></span>' : '') +
      '<span class="score">' + Face.score(m.d) + ' %</span><button class="pick" aria-pressed="' + sel + '" aria-label="Sélectionner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M5 12l5 5 9-10"/></svg></button><button class="notme">Pas moi</button>' + eyeBtn(i, list.length);
    el.querySelector('img').src = m.p.thumb;
    el.querySelector('.view').addEventListener('click', e => openViewer(list, i, e.currentTarget, true));
    el.querySelector('.pick').addEventListener('click', e => {
      if (state.unpicked.has(m.p.id)) state.unpicked.delete(m.p.id); else state.unpicked.add(m.p.id);
      e.currentTarget.setAttribute('aria-pressed', !state.unpicked.has(m.p.id)); resetShare(); count();
    });
    el.querySelector('.notme').addEventListener('click', () => { state.removed.add(m.p.id); toast('D\'accord, on la retire.'); search(); });
    g.appendChild(el); fitRings(el, m.p);
  });
  const mg = $('#maybeGrid'); mg.innerHTML = ''; $('#maybeWrap').hidden = !state.maybes.length || state.filter !== 'all';
  state.maybes.forEach((m, i) => {
    const el = document.createElement('div'); el.className = 'res maybe';
    el.innerHTML = '<img alt="" loading="lazy"><span class="ring" data-i="' + m.i + '"></span><span class="score">' + Face.score(m.d) + ' %</span><button class="yes">C\'est moi</button>' + eyeBtn(i, state.maybes.length);
    el.querySelector('img').src = m.p.thumb;
    el.querySelector('.view').addEventListener('click', e => openViewer(state.maybes, i, e.currentTarget, false));
    el.querySelector('.yes').addEventListener('click', () => { state.me.push(state.descs[m.p.faceIdx[m.i]]); toast('Merci ! On affine la recherche.'); search(); });
    mg.appendChild(el); fitRings(el, m.p);
  });
  const rest = state.photos.length - state.matches.length;
  $('#others').innerHTML = state.ev.privateMode !== false && rest > 0 ? '<div class="blurstack"><div></div><div></div><div></div></div><span>' + rest + ' autre(s) photo(s), visibles seulement par les personnes concernées.</span>' : '';
  count();
}
const picked = () => state.matches.filter(m => !state.unpicked.has(m.p.id));

/* ---------- Visionneuse : l'œil de chaque photo l'ouvre en grand ---------- */
const EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeBtn = (i, n) => '<button class="view" type="button" aria-label="Voir la photo ' + (i + 1) + ' sur ' + n + ' en grand">' + EYE + '</button>';
let viewer = null;
function openViewer(list, start, opener, pickable) {
  if (viewer || !list.length) return;
  let i = start;
  const v = document.createElement('div');
  v.className = 'viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', 'Photo en grand');
  v.innerHTML =
    '<div class="viewer-bar"><span class="viewer-count" aria-live="polite"></span>' +
      '<button class="viewer-btn" data-a="close" aria-label="Fermer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<div class="viewer-stage"><img alt="">' +
      '<button class="viewer-btn viewer-nav viewer-prev" data-a="prev" aria-label="Photo précédente"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button class="viewer-btn viewer-nav viewer-next" data-a="next" aria-label="Photo suivante"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>' +
    '<div class="viewer-foot">' +
      (pickable ? '<button class="viewer-btn" data-a="pick"></button>' : '') +
      '<button class="viewer-btn" data-a="dl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M4 19h16"/></svg>Télécharger</button></div>';
  document.body.appendChild(v); document.documentElement.classList.add('intro-open');
  const img = v.querySelector('img'), q = a => v.querySelector('[data-a="' + a + '"]');
  const show = () => {
    const m = list[i];
    img.classList.add('is-loading'); img.src = m.p.thumb;                // la vignette s'affiche tout de suite…
    const big = new Image(); big.onload = () => { if (list[i] === m) { img.src = m.p.web; img.classList.remove('is-loading'); } }; big.src = m.p.web; // …puis la grande
    img.alt = 'Photo ' + (i + 1) + ' sur ' + list.length;
    v.querySelector('.viewer-count').textContent = (i + 1) + ' / ' + list.length;
    q('prev').disabled = i === 0; q('next').disabled = i === list.length - 1;
    if (pickable) { const on = !state.unpicked.has(m.p.id); q('pick').classList.toggle('on', on); q('pick').setAttribute('aria-pressed', on); q('pick').textContent = on ? '✓ Gardée' : 'Garder cette photo'; }
  };
  const go = d => { const n = i + d; if (n >= 0 && n < list.length) { i = n; show(); } };
  const close = () => { v.remove(); document.documentElement.classList.remove('intro-open'); document.removeEventListener('keydown', onKey, true); viewer = null; render();
    const back = document.querySelectorAll((pickable ? '#resGrid' : '#maybeGrid') + ' .view')[i] || opener; if (back && document.contains(back)) back.focus({ preventScroll: true }); };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Tab') { const f = [...v.querySelectorAll('button:not(:disabled)')]; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  };
  v.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b) { if (e.target === v || e.target.classList.contains('viewer-stage')) close(); return; }
    const a = b.dataset.a, m = list[i];
    if (a === 'close') close(); else if (a === 'prev') go(-1); else if (a === 'next') go(1);
    else if (a === 'pick') { if (state.unpicked.has(m.p.id)) state.unpicked.delete(m.p.id); else state.unpicked.add(m.p.id); resetShare(); count(); show(); }
    else if (a === 'dl') {
      b.disabled = true;
      try { const r = await fetch(m.p.web); if (!r.ok) throw new Error(r.status); saveBlob(await r.blob(), fileName(m.p, i + 1)); }
      catch (err) { toast('Téléchargement impossible, réessayez.'); }
      b.disabled = false;
    }
  });
  let x0 = null;   // glisser du doigt pour changer de photo
  v.querySelector('.viewer-stage').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  v.querySelector('.viewer-stage').addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
  document.addEventListener('keydown', onKey, true);
  viewer = v; show(); q('close').focus();
}
function count() { const n = picked().length; $('#selCount').textContent = n; $('#dlZip').disabled = !n; $('#dlZip').textContent = n === 1 ? 'Télécharger la photo' : 'Télécharger en ZIP'; }
$$('#prec button').forEach(b => b.addEventListener('click', () => { $$('#prec button').forEach(x => x.setAttribute('aria-pressed', x === b)); state.threshold = +b.dataset.t; search(true); }));
$$('#filters .chip').forEach(b => b.addEventListener('click', () => { if (b.disabled) return; $$('#filters .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); state.filter = b.dataset.f; render(); }));

/* ---------- Téléchargement et partage ---------- */
async function fetchPhotos(list, label) {
  const out = []; let i = 0;
  for (const m of list) {
    i++; $('#dlInfo').textContent = label + ' ' + i + ' / ' + list.length + '…';
    const r = await fetch(m.p.web); if (!r.ok) throw new Error('Photo indisponible (' + r.status + ')');
    out.push({ name: fileName(m.p, i), blob: await r.blob() });
  }
  return out;
}
const fileName = (p, i) => String(i).padStart(3, '0') + '-' + (p.n || p.id).replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40) + '.jpg';
$('#dlZip').addEventListener('click', async () => {
  const list = picked(); if (!list.length) return;
  const btn = $('#dlZip'); btn.disabled = true;
  try {
    const files = await fetchPhotos(list, 'Téléchargement');
    if (files.length === 1) saveBlob(files[0].blob, files[0].name);
    else {
      $('#dlInfo').textContent = 'On prépare le fichier ZIP…';
      const zip = new JSZip(); files.forEach(f => zip.file(f.name, f.blob));
      saveBlob(await zip.generateAsync({ type: 'blob' }), 'mes-photos-' + slug(state.ev.name) + '.zip');
    }
    $('#dlInfo').textContent = files.length + ' photo(s) téléchargée(s). Bon souvenir !';
  } catch (e) { console.error(e); $('#dlInfo').textContent = 'Ça n\'a pas marché : ' + e.message; }
  btn.disabled = false; count();
});

/* Partage natif (WhatsApp, AirDrop…) : en deux temps, car le navigateur exige un geste direct. */
let shareFiles = null;
const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] }));
$('#shareBtn').hidden = !canShareFiles;
function resetShare() { shareFiles = null; $('#shareBtn').textContent = 'Partager'; }
$('#shareBtn').addEventListener('click', async () => {
  const list = picked().slice(0, 10); if (!list.length) return;
  if (!shareFiles) {
    $('#shareBtn').disabled = true;
    try {
      shareFiles = (await fetchPhotos(list, 'Préparation')).map(f => new File([f.blob], f.name, { type: 'image/jpeg' }));
      $('#shareBtn').textContent = 'Partager maintenant';
      $('#dlInfo').textContent = picked().length > 10 ? 'Partage limité aux 10 premières photos ; utilisez le ZIP pour le reste.' : 'Prêt : touchez « Partager maintenant ».';
    } catch (e) { $('#dlInfo').textContent = 'Ça n\'a pas marché : ' + e.message; }
    $('#shareBtn').disabled = false; return;
  }
  try { await navigator.share({ files: shareFiles, title: state.ev.name }); } catch (e) { if (e.name !== 'AbortError') toast('Partage impossible sur cet appareil.'); }
});

/* ---------- Galerie complète (si le mode confidentiel est désactivé) ---------- */
$('#showAll').addEventListener('click', () => {
  const g = $('#allGrid'); g.innerHTML = '';
  state.photos.forEach(p => { const a = document.createElement('a'); a.href = p.web; a.target = '_blank'; a.rel = 'noopener'; a.innerHTML = '<img loading="lazy" alt="">'; a.firstChild.src = p.thumb; g.appendChild(a); });
  $('#showAll').hidden = true;
});
