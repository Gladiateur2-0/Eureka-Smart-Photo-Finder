/* Mode de fonctionnement :
 *  - EN LIGNE : supabase-config.js est rempli → Supabase.
 *  - DÉMO     : supabase-config.js n'est pas rempli, ou « ?demo=1 » (mémorisé) → tout fonctionne dans le navigateur.
 * « ?demo=0 » désactive le mode démo mémorisé. */
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

function flag(name, key) {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has(name)) localStorage.setItem(key, q.get(name) === '0' ? '0' : '1');
    return localStorage.getItem(key) === '1';
  } catch (e) { return false; }
}

export const CONFIGURED = !/COLLEZ/.test(SUPABASE_URL + SUPABASE_KEY);
export const DEMO = flag('demo', 'eurekaDemo') || !CONFIGURED;
