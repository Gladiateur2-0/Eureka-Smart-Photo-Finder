/* Point d'entrée unique vers les données : Supabase en ligne, ou le mode démo (tout dans le navigateur).
   Les pages n'importent que ce fichier ; les deux implémentations offrent exactement les mêmes fonctions. */
import { DEMO } from './mode.js';

export const api = DEMO ? (await import('./api/demo.js')).default : (await import('./api/supabase.js')).default;
export { DEMO };

/** Message lisible pour une erreur (codes normalisés par api/supabase.js et api/demo.js). */
export function errorText(e) {
  const map = {
    'bad-credentials': 'Identifiant ou mot de passe incorrect.',
    'disabled': 'Ce compte est suspendu. Écrivez-nous sur WhatsApp.',
    'weak-password': 'Mot de passe trop court : 8 caractères minimum.',
    'quota': 'Envoi refusé : galerie terminée ou compte suspendu.',
    'denied': 'Action refusée.',
    'network': 'Connexion impossible. Vérifiez votre accès à Internet.',
    'rate-limit': 'Trop de tentatives. Réessayez dans quelques minutes.',
  };
  // Un message précis (« Un compte existe déjà… ») est plus utile que le message générique.
  if (e?.code === 'denied' && e.message && e.message !== 'denied' && !/permission denied/i.test(e.message)) return e.message;
  return map[e?.code] || e?.message || String(e);
}

/* Bandeau discret en mode démo. */
if (DEMO) {
  const show = () => {
    if (document.getElementById('modeBanner')) return;
    const b = document.createElement('div');
    b.id = 'modeBanner'; b.className = 'demo-note'; b.setAttribute('role', 'status');
    b.innerHTML = '<span><b>Version de démonstration.</b> Les données restent dans ce navigateur. Gestion : <b>eureka.admin</b> / <b>demo.eureka</b></span>' +
      '<button type="button" id="demoReset">Tout effacer</button>';
    const top = document.querySelector('header.top');
    top ? top.after(b) : document.body.prepend(b);
    let armed = false;
    b.querySelector('#demoReset').addEventListener('click', async e => {
      if (!armed) { armed = true; e.target.textContent = 'Confirmer ?'; setTimeout(() => { armed = false; e.target.textContent = 'Tout effacer'; }, 4000); return; }
      await api.resetDemo(); location.reload();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
}
