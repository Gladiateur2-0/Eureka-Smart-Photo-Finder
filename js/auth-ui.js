/* Formulaire de connexion + scène de la porte (js/door.js), commun à l'espace client et à la gestion.
 * Script classique (pas un module) : la porte s'anime même quand la page est ouverte par double-clic.
 *  - pendant la vérification : le personnage frappe, la porte s'entrouvre ;
 *  - identifiants corrects  : la porte s'ouvre, il entre, PUIS la page affiche l'espace ;
 *  - identifiants incorrects : la porte claque, message d'erreur, mot de passe resélectionné. */
(function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function setupDoorLogin(o) {
    var form = o.form, idInput = o.idInput, pwInput = o.pwInput, msg = o.msg, submit = o.submit;
    if (form.dataset.doorReady) return form._door;  // déjà branché (aperçu puis vraie connexion)
    form.dataset.doorReady = '1';
    var door = window.Eureka.createDoorScene(o.scene);
    var gate = null, label = submit.textContent;
    var ctl = { signIn: o.signIn, errorText: o.errorText || function (e) { return (e && e.message) || String(e); }, onSuccess: o.onSuccess };

    [idInput, pwInput].forEach(function (i) {
      i.addEventListener('input', function () { door.typing(); pwInput.removeAttribute('aria-invalid'); idInput.removeAttribute('aria-invalid'); });
    });
    if (o.toggle) o.toggle.addEventListener('click', function () {
      var show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      o.toggle.setAttribute('aria-pressed', String(show));
      o.toggle.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      pwInput.focus();
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (gate) return;
      if (!idInput.value.trim() || !pwInput.value) {
        msg.innerHTML = '<p class="auth-msg ko">Il manque l\'identifiant ou le mot de passe.</p>';
        (idInput.value.trim() ? pwInput : idInput).focus();
        return;
      }
      var release; gate = new Promise(function (r) { release = r; });
      msg.innerHTML = '<p class="auth-msg">On vérifie…</p>';
      submit.disabled = true; submit.classList.add('is-loading'); submit.textContent = 'Un instant…';
      form.setAttribute('aria-busy', 'true');
      door.pending();
      try {
        await ctl.signIn(idInput.value, pwInput.value);
        msg.innerHTML = '<p class="auth-msg ok">C\'est bien vous. Entrez !</p>';
        await door.success();
        pwInput.value = '';
        if (ctl.onSuccess) ctl.onSuccess();
      } catch (err) {
        msg.innerHTML = '<p class="auth-msg ko" role="alert">' + esc(ctl.errorText(err)) + '</p>';
        pwInput.setAttribute('aria-invalid', 'true');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        await door.fail();
        pwInput.focus(); pwInput.select();
      } finally {
        submit.disabled = false; submit.classList.remove('is-loading'); submit.textContent = label;
        form.removeAttribute('aria-busy');
        gate = null; release();
      }
    });

    var api = {
      door: door,
      /** À attendre avant d'afficher l'espace : laisse l'animation d'entrée se terminer. */
      waitGate: function () { return gate || Promise.resolve(); },
      reset: function () { door.reset(); msg.innerHTML = ''; },
      /** Remplace la vérification (utilisé quand la vraie connexion prend le relais de l'aperçu). */
      use: function (n) { for (var k in n) ctl[k] = n[k]; return api; },
    };
    form._door = api;
    return api;
  }

  window.Eureka = window.Eureka || {};
  window.Eureka.setupDoorLogin = setupDoorLogin;

  /* Aperçu hors serveur (page ouverte par double-clic) : les programmes de connexion ne peuvent pas
     se charger, mais la porte fonctionne quand même pour voir l'animation.
     Mot de passe d'aperçu : demo.eureka (n'importe quel identifiant). */
  function previewIfLocalFile() {
    if (location.protocol !== 'file:') return;
    var form = document.getElementById('loginForm'), scene = document.getElementById('doorScene');
    if (!form || !scene) return;
    setupDoorLogin({
      scene: scene, form: form, idInput: document.getElementById('email'), pwInput: document.getElementById('password'),
      msg: document.getElementById('loginMsg'), toggle: document.getElementById('pwToggle'), submit: document.getElementById('loginBtn'),
      signIn: function (id, pw) {
        return new Promise(function (ok, ko) { setTimeout(function () { pw === 'demo.eureka' ? ok() : ko(new Error('Identifiant ou mot de passe incorrect.')); }, 900); });
      },
      onSuccess: function () {
        document.getElementById('loginMsg').innerHTML = '<p class="auth-msg ok">La porte s\'ouvre ! Ceci n\'est qu\'un aperçu : pour entrer vraiment, lancez <b>Lancer-Eureka-Windows</b> (ou Mac).</p>';
      },
    });
    var m = document.getElementById('loginMsg');
    if (m && !m.innerHTML) m.innerHTML = '<p class="auth-msg">Aperçu : tapez <b>demo.eureka</b> pour voir la porte s\'ouvrir, autre chose pour la voir se fermer.</p>';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', previewIfLocalFile); else previewIfLocalFile();
})();
