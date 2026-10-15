/* Page de gestion : création des comptes clients, suivi du stockage, offres. */
import { api, errorText } from './api.js';
import { planOf, formatBytes, whatsappLink, loginToEmail, LOGIN_DOMAIN, TB } from './config.js';
import { $, toast, esc } from './ui.js';

const state = { users: [], events: [], lastCreds: null };

/* ---------- Connexion ---------- */
const login = window.Eureka.setupDoorLogin({
  scene: $('#doorScene'), form: $('#loginForm'), idInput: $('#email'), pwInput: $('#password'),
  msg: $('#loginMsg'), toggle: $('#pwToggle'), submit: $('#loginBtn'), errorText,
  signIn: (id, pw) => api.signIn(loginToEmail(id), pw),
});
$('#logout').addEventListener('click', () => api.signOut());
$('#otherAccount').addEventListener('click', () => api.signOut());

api.onAuth(async user => {
  if (user) await login.waitGate();
  $('#userBox').hidden = !user;
  $('#login').hidden = !!user;
  $('#dash').hidden = true; $('#denied').hidden = true;
  if (!user) { login.reset(); return; }
  $('#userEmail').textContent = (user.email || '').replace('@' + LOGIN_DOMAIN, '');
  try {
    const me = await api.getProfile(user.id);
    if (!me || !me.isAdmin) { $('#deniedUid').textContent = user.id; $('#denied').hidden = false; return; }
    await load(); $('#dash').hidden = false;
  } catch (e) { console.error(e); toast(errorText(e)); }
});

/* ---------- Données ---------- */
async function load() {
  const [u, ev] = await Promise.all([api.admin.listProfiles(), api.admin.listEvents()]);
  state.users = u.map(p => ({ ...p, uid: p.id }));
  state.events = ev;
  render();
}
$('#refresh').addEventListener('click', () => load().then(() => toast('À jour')).catch(e => toast(errorText(e))));
$('#search').addEventListener('input', render);

function render() {
  $('#saDate').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#kPremium').textContent = state.users.length;
  $('#kPlus').textContent = state.users.filter(u => u.disabled).length;
  $('#kFree').textContent = state.users.filter(u => !u.disabled).length;
  $('#kEvents').textContent = state.events.filter(e => e.published && !e.expired).length;
  $('#kStorage').textContent = formatBytes(state.users.reduce((a, u) => a + Math.max(0, u.usedBytes || 0), 0));

  const q = $('#search').value.trim().toLowerCase();
  const list = state.users
    .filter(u => !q || [u.name, u.email, u.phone, u.uid].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const tb = $('#rows');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="6" class="sub">' + (state.users.length ? 'Personne ne correspond.' : 'Pas encore de client. Le premier se crée juste au-dessus.') + '</td></tr>'; return; }
  tb.innerHTML = '';
  list.forEach(u => tb.appendChild(row(u)));
}

function row(u) {
  const used = Math.max(0, u.usedBytes || 0);
  const evs = state.events.filter(e => e.ownerId === u.uid), live = evs.filter(e => e.published && !e.expired).length;
  const created = u.createdAt ? u.createdAt.toLocaleDateString('fr-FR') : '–';
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><strong>' + esc(u.name || u.email) + '</strong><small>' + esc(shownId(u.email)) + (u.phone ? ' · ' + esc(u.phone) : '') + '</small></td>' +
    '<td>' + (u.disabled ? '<span class="tag off">Suspendu</span>' : '<span class="tag ok">Actif</span>') + '</td>' +
    '<td><span style="font-variant-numeric:tabular-nums">' + formatBytes(used) + '</span><small>illimité</small></td>' +
    '<td>' + evs.length + (live ? ' <small>dont ' + live + ' en ligne</small>' : '') + '</td>' +
    '<td>' + created + '</td>' +
    '<td><div class="acts"></div></td>';

  const acts = tr.querySelector('.acts');
  const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn sm ' + cls; b.textContent = label; b.addEventListener('click', () => fn(b)); acts.appendChild(b); return b; };

  btn('Nouveau mot de passe', b => run(b, async () => {
    const r = await api.admin.resetPassword(u.uid);
    showCreds({ name: u.name, email: u.email, phone: u.phone, password: r.password, plan: u.plan, galleryDays: u.galleryDays, reset: true });
    toast('Nouveau mot de passe prêt à envoyer');
  }));
  btn(u.disabled ? 'Réactiver' : 'Suspendre', b => run(b, async () => {
    await api.admin.updateClient({ uid: u.uid, disabled: !u.disabled });
    u.disabled = !u.disabled; render(); toast(u.disabled ? 'Compte suspendu' : 'Compte réactivé');
  }));
  btn('Recompter', b => run(b, async () => {
    const r = await api.admin.recomputeUsage(u.uid);
    u.usedBytes = r.usedBytes; render(); toast('Espace recompté : ' + formatBytes(r.usedBytes));
  }));
  btn('Supprimer', b => {
    if (b.dataset.armed) return run(b, async () => {
      const r = await api.admin.deleteClient(u.uid);
      state.users = state.users.filter(x => x.uid !== u.uid); state.events = state.events.filter(e => e.ownerId !== u.uid);
      render(); toast('Client supprimé, avec ' + (r.events || 0) + ' événement(s)');
    });
    b.dataset.armed = '1'; b.textContent = 'Vraiment ?';
    setTimeout(() => { delete b.dataset.armed; b.textContent = 'Supprimer'; }, 5000);
  }, 'danger');

  return tr;
}

/** Exécute une action en désactivant le contrôle pendant l'appel. */
async function run(el, fn, onError) {
  el.disabled = true;
  try { await fn(); } catch (e) { console.error(e); toast(errorText(e)); onError && onError(); }
  el.disabled = false;
}

/* ---------- Création d'un compte ---------- */
$('#createForm').addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    name: $('#cName').value.trim(), email: loginToEmail($('#cEmail').value), phone: $('#cPhone').value.trim(),
    plan: 'premium',
  };
  $('#createMsg').innerHTML = '';
  run($('#createBtn'), async () => {
    const r = await api.admin.createClient(data);
    showCreds(r);
    $('#createForm').reset();
    toast('Compte créé. Pensez à envoyer les identifiants.');
    await load();
  }, () => {});
});

/** « studio.lumiere@eureka-smart-finder.app » s'affiche « studio.lumiere », comme on le tape pour se connecter. */
const shownId = e => String(e || '').replace('@' + LOGIN_DOMAIN, '');
const loginUrl = () => new URL('espace.html', location.href).href;
function credsMessage(c) {
  const p = planOf(c.plan);
  return 'Bonjour ' + (c.name || '') + ',\n\n' +
    (c.reset ? 'Voici un nouveau mot de passe provisoire pour votre espace Eureka Smart Photo Finder.' :
      'Votre espace Eureka Smart Photo Finder est prêt ! Photos illimitées, et chaque galerie reste en ligne ' + (c.galleryDays || p.galleryDays) + ' jours.') + '\n\n' +
    'Pour vous connecter : ' + loginUrl() + '\n' +
    'Identifiant : ' + shownId(c.email) + '\n' +
    'Mot de passe provisoire : ' + c.password + '\n\n' +
    'À la première connexion, vous choisirez votre propre mot de passe. Une question ? Répondez simplement à ce message.';
}
function showCreds(c) {
  state.lastCreds = c;
  const p = planOf(c.plan);
  $('#creds').innerHTML =
    '<div><span>Client</span><b>' + esc(c.name || '') + '</b></div>' +
    '<div><span>Photos</span><b>illimitées</b></div>' +
    '<div><span>Connexion</span><b>' + esc(loginUrl()) + '</b></div>' +
    '<div><span>Identifiant</span><b>' + esc(shownId(c.email)) + '</b></div>' +
    '<div><span>Mot de passe</span><b>' + esc(c.password) + '</b></div>';
  const phone = String(c.phone || '').replace(/[^\d]/g, '');
  const wa = $('#sendWa');
  wa.href = phone ? whatsappLink(credsMessage(c), phone) : 'https://wa.me/?text=' + encodeURIComponent(credsMessage(c));
  wa.textContent = phone ? 'Envoyer sur WhatsApp' : 'Partager sur WhatsApp';
  $('#credsCard').hidden = false;
  $('#credsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#copyCreds').addEventListener('click', () => {
  const t = credsMessage(state.lastCreds);
  navigator.clipboard?.writeText(t).then(() => toast('Message copié'), () => toast('Copie impossible, sélectionnez le texte à la main.'));
});
