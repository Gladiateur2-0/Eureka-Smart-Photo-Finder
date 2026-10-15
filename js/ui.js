/* Petits utilitaires d'interface partagés */
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

let toastTimer;
export function toast(text) {
  const el = $('#toast'); if (!el) return;
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function setEngine(state, text) {
  const dot = $('#engineDot'), t = $('#engineText'); if (!dot) return;
  dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : '');
  t.textContent = text;
}

export const slug = s => (s || 'evenement').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'evenement';

export function frDate(iso) {
  if (!iso) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return iso; }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Déclenche le téléchargement d'un Blob dans le navigateur. */
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* Logo au centre du QR code (img/logo-icone.png) ; la carte est redessinée dès qu'il est chargé. */
const LOGO = typeof Image === 'function' ? new Image() : null;
if (LOGO) LOGO.src = new URL('../img/logo-icone.png', import.meta.url).href;

/** Carte QR imprimable, dessinée dans un canvas 600×760 (utilise le global `qrcode`). */
export function drawQrCard(c, { name, date, link }) {
  if (LOGO && !LOGO.complete) LOGO.addEventListener('load', () => drawQrCard(c, { name, date, link }), { once: true });
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#EAF3FD'; x.fillRect(0, 0, W, 150);
  const band = x.createLinearGradient(0, 0, W, 0);   // filet aux couleurs du logo
  [[0, '#0B3A8C'], [.3, '#0A5CBF'], [.65, '#05B8DC'], [1, '#2FD27A']].forEach(([o, c]) => band.addColorStop(o, c));
  x.fillStyle = band; x.fillRect(0, 146, W, 8);
  x.fillStyle = '#0E2A4F'; x.textAlign = 'center';
  x.font = '600 42px "Fraunces", Georgia, serif';
  let t = name || 'Mon événement';
  while (x.measureText(t).width > W - 60 && t.length > 4) t = t.slice(0, -2);
  if (t !== (name || 'Mon événement')) t = t.slice(0, -1) + '…';
  x.fillText(t, W / 2, 72);
  x.font = '500 22px "Instrument Sans", system-ui, sans-serif'; x.fillStyle = '#0A5CBF';
  x.fillText(frDate(date) || 'Vos photos de la soirée', W / 2, 112);
  const q = qrcode(0, 'Q'); q.addData(link); q.make();
  const n = q.getModuleCount(), size = 380, cell = size / n, ox = (W - size) / 2, oy = 190;
  x.fillStyle = '#0E2A4F';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) {
    const finder = (r < 7 && col < 7) || (r < 7 && col >= n - 7) || (r >= n - 7 && col < 7);
    if (finder) x.fillRect(ox + col * cell, oy + r * cell, cell + .5, cell + .5);
    else { x.beginPath(); x.arc(ox + col * cell + cell / 2, oy + r * cell + cell / 2, cell * .46, 0, Math.PI * 2); x.fill(); }
  }
  const lg = 76, rr = (X, Y, w, h, rad) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, rad); else x.rect(X, Y, w, h); x.fill(); };
  x.fillStyle = '#FFFFFF'; rr(W / 2 - lg / 2 - 8, oy + size / 2 - lg / 2 - 8, lg + 16, lg + 16, 18);
  if (LOGO && LOGO.complete && LOGO.naturalWidth) x.drawImage(LOGO, W / 2 - lg / 2, oy + size / 2 - lg / 2, lg, lg);
  else { x.fillStyle = '#0A5CBF'; rr(W / 2 - lg / 2, oy + size / 2 - lg / 2, lg, lg, 16); }
  x.fillStyle = '#0E2A4F'; x.font = '700 28px "Instrument Sans", system-ui, sans-serif';
  x.fillText('Scannez, faites un selfie,', W / 2, 640);
  x.fillText('et repartez avec vos photos', W / 2, 676);
  x.fillStyle = '#5B6B82'; x.font = '500 17px "Instrument Sans", system-ui, sans-serif';
  x.fillText('Eureka Smart Photo Finder · votre selfie reste sur votre téléphone', W / 2, 725);
}
