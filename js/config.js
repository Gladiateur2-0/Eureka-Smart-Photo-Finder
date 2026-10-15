/* Réglages d'Eureka Smart Photo Finder (côté site).
   ⚠️ Les espaces et durées sont aussi définis dans supabase/functions/admin/index.ts et supabase/schema.sql :
   si vous changez une valeur ici, changez-la aussi là-bas. */

/** Numéro WhatsApp du service commercial, au format international SANS « + » ni espaces. */
export const WHATSAPP_NUMBER = '2420402376853';

/** Domaine technique ajouté aux identifiants sans « @ » (ex. « eureka.admin »).
    L'authentification exige une adresse e-mail : « eureka.admin » devient « eureka.admin@eureka-smart-finder.app ».
    Aucun e-mail n'est envoyé à cette adresse. */
export const LOGIN_DOMAIN = 'eureka-smart-finder.app';
export const loginToEmail = id => {
  id = String(id || '').trim().toLowerCase();
  return id.includes('@') ? id : id + '@' + LOGIN_DOMAIN;
};

export const GB = 1024 ** 3;
export const TB = 1024 ** 4;

export const PLANS = {
  // Offre unique : photos illimitées (quotaBytes null = pas de plafond), galeries en ligne 7 jours.
  premium: { id: 'premium', label: 'Accès Eureka', quotaBytes: null, galleryDays: 7 },
};

export const planOf = id => PLANS[id] || PLANS.premium;

/** Lien wa.me avec un message pré-rempli. */
export function whatsappLink(text, number = WHATSAPP_NUMBER) {
  return 'https://wa.me/' + String(number).replace(/[^\d]/g, '') + '?text=' + encodeURIComponent(text);
}

/** 1536 → « 1,5 Ko », 1099511627776 → « 1 To ». */
export function formatBytes(b) {
  b = Math.max(0, Number(b) || 0);
  const u = ['octets', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  while (b >= 1000 && i < u.length - 1) { b /= 1024; i++; }
  const n = i === 0 ? Math.round(b) : b >= 100 ? Math.round(b) : Math.round(b * 10) / 10;
  return n.toLocaleString('fr-FR') + ' ' + u[i];
}
