/* Reconnaissance des visages, partagée par l'espace client et la page invité.
   Utilise face-api.js (global `faceapi`, chargé par <script src="js/vendor/face-api.js">). */

const MODELS = [
  ['ssdMobilenetv1', 'ssd_mobilenetv1_model', 5645190],
  ['faceLandmark68Net', 'face_landmark_68_model', 365325],
  ['faceRecognitionNet', 'face_recognition_model', 6463647],
];

/* Les empreintes (128 nombres entre environ -0,4 et 0,4) sont stockées sur 1 octet chacune.
   Erreur maximale par valeur : 0,0017 — sans effet mesurable sur la reconnaissance. */
export const Q_SCALE = 300;

let enginePromise = null;

function withTimeout(p, ms, what) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Délai dépassé : ' + what)), ms))]);
}

async function readWithProgress(url, onBytes) {
  const r = await withTimeout(fetch(url), 30000, url);
  if (!r.ok) throw new Error('Fichier introuvable (' + r.status + ') : ' + url);
  if (!r.body || !r.body.getReader) { const b = new Uint8Array(await r.arrayBuffer()); onBytes(b.length); return b; }
  const reader = r.body.getReader(), chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await withTimeout(reader.read(), 60000, url);
    if (done) break;
    chunks.push(value); n += value.length; onBytes(value.length);
  }
  const out = new Uint8Array(n); let o = 0;
  chunks.forEach(c => { out.set(c, o); o += c.length; });
  return out;
}

async function fetchModel(file, onBytes) {
  const man = await (await withTimeout(fetch('models/' + file + '-weights_manifest.json'), 30000, file)).json();
  const specs = [], parts = [];
  for (const g of man) { specs.push(...g.weights); for (const p of g.paths) parts.push(await readWithProgress('models/' + p, onBytes)); }
  const total = parts.reduce((a, b) => a + b.length, 0), u = new Uint8Array(total); let o = 0;
  parts.forEach(b => { u.set(b, o); o += b.length; });
  return { specs, buffer: u.buffer };
}

async function pickBackend() {
  // WebGL si disponible (rapide), sinon CPU. Le backend WASM est évité (fichier .wasm supplémentaire).
  for (const b of ['webgl', 'cpu']) {
    try { if (await withTimeout(faceapi.tf.setBackend(b), 15000, 'backend ' + b)) { await faceapi.tf.ready(); return b; } }
    catch (e) { console.warn('[Eureka] Backend ' + b + ' indisponible', e); }
  }
  throw new Error('Aucun moteur de calcul disponible dans ce navigateur');
}

async function load(onStatus) {
  if (!window.faceapi) throw new Error('face-api.js n\'est pas chargé (fichier /js/vendor/face-api.js)');
  onStatus('loading', 'Préparation…');
  const backend = await pickBackend();
  const total = MODELS.reduce((a, m) => a + m[2], 0); let got = 0;
  const tick = n => { got += n; onStatus('loading', 'Préparation… ' + Math.min(99, Math.round(got / total * 100)) + ' %'); };
  const weights = await Promise.all(MODELS.map(m => fetchModel(m[1], tick)));
  onStatus('loading', 'Presque prêt…');
  weights.forEach((w, i) => faceapi.nets[MODELS[i][0]].loadFromWeightMap(faceapi.tf.io.decodeWeights(w.buffer, w.specs)));
  const warm = document.createElement('canvas'); warm.width = warm.height = 64;
  await faceapi.detectAllFaces(warm, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.9 }));
  onStatus('ok', backend === 'cpu' ? 'Prêt (mode lent)' : 'Prêt');
  return backend;
}

/** Charge l'IA une seule fois. onStatus(state, text) avec state = 'loading' | 'ok' | 'err'. */
export function loadEngine(onStatus = () => {}) {
  if (!enginePromise) {
    enginePromise = load(onStatus).catch(e => {
      enginePromise = null;
      onStatus('err', 'Souci de chargement, touchez pour réessayer');
      throw e;
    });
  }
  return enginePromise;
}

export const options = (min = 0.45) => new faceapi.SsdMobilenetv1Options({ minConfidence: min });

/** Fichier image → <img> décodé (l'orientation EXIF est appliquée par le navigateur). */
export function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible : ' + (file.name || ''))); };
    img.src = url;
  });
}

/** Redimensionne une image dans un canvas dont le plus grand côté vaut au plus `max`. */
export function scaled(img, max) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function toBlob(canvas, type = 'image/jpeg', q = 0.86) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Encodage impossible')), type, q));
}

/** Tous les visages d'une photo : boîte normalisée [x, y, l, h] (0..1) + empreinte. */
export async function detectFaces(canvas) {
  const dets = await faceapi.detectAllFaces(canvas, options(0.55)).withFaceLandmarks().withFaceDescriptors();
  const r = v => Math.round(v * 10000) / 10000;
  return dets.map(d => {
    const b = d.detection.box;
    return { box: [r(b.x / canvas.width), r(b.y / canvas.height), r(b.width / canvas.width), r(b.height / canvas.height)], desc: d.descriptor };
  });
}

/** Le visage principal d'un selfie, ou null. */
export async function detectSelfie(canvas) {
  const d = await faceapi.detectSingleFace(canvas, options(0.4)).withFaceLandmarks().withFaceDescriptor();
  return d ? { desc: d.descriptor, box: d.detection.box } : null;
}

export function quantize(desc) {
  const q = new Int8Array(desc.length);
  for (let i = 0; i < desc.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(desc[i] * Q_SCALE)));
  return q;
}
export function dequantize(q, offset = 0, len = 128) {
  const f = new Float32Array(len);
  for (let i = 0; i < len; i++) f[i] = q[offset + i] / Q_SCALE;
  return f;
}
export function int8ToBase64(q) {
  const u = new Uint8Array(q.buffer, q.byteOffset, q.byteLength); let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
export function base64ToInt8(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Int8Array(u.buffer);
}

export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/** Distance → pourcentage de ressemblance affiché à l'invité. */
export const score = d => Math.max(1, Math.min(99, Math.round(100 - (d - 0.2) * 130)));
