/* Animation d'ouverture de chaque page.
 * Présente la procédure de la page en 4 étapes animées (≈ 5 s), puis s'efface.
 *  - affichée une seule fois par page et par navigateur, puis rejouable avec le bouton « Comment ça marche » ;
 *  - « Passer » ou Échap la ferment à tout moment ;
 *  - si l'utilisateur a demandé moins d'animations (prefers-reduced-motion), les étapes s'affichent d'un coup, sans défilement automatique.
 * La page choisit son contenu avec <body data-intro="home | espace | superadmin | guest">. */
(function () {
  'use strict';

  /* Promesse résolue quand l'introduction est terminée (ou n'a pas lieu) :
     les pages attendent ce moment pour lancer la reconnaissance des visages, afin que l'animation reste fluide. */
  var resolveDone;
  window.eurekaIntroDone = new Promise(function (r) { resolveDone = r; });

  var I = {
    upload: '<path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
    face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="11" r="3"/><path d="M8.5 17c.9-1.4 2.1-2 3.5-2s2.6.6 3.5 2"/>',
    download: '<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
    plus: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M12 13v5M9.5 15.5h5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
    chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 11h6M9 14h4"/>',
    userPlus: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19c.8-3 3.4-4.8 6.5-4.8s5.7 1.8 6.5 4.8M18 7v6M15 10h6"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4.5-7-7-4.5z"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5"/><path d="M4 17h2M18 17h2"/>',
    hand: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-1.5V7a1.5 1.5 0 0 1 3 0v6.5A6.5 6.5 0 0 1 11.5 20h-.3a6 6 0 0 1-4.6-2.2L4 14.5a1.6 1.6 0 0 1 2.3-2.2L9 14"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12.5 2.5 2.5 5-6"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9S10.5 4 8 4.5 7 9 12 9zm0 0s1.5-5 4-4.5S17 9 12 9z"/>'
  };

  var CONTENT = {
    home: {
      title: 'Toutes les photos de la soirée. Juste les vôtres.',
      steps: [
        ['chat', 'On se parle', 'Vous nous écrivez, on ouvre votre espace et on vous envoie vos identifiants.'],
        ['upload', 'Vous déposez', 'Les photos de l\'événement, d\'un seul glisser-déposer.'],
        ['qr', 'Ils scannent', 'Un QR code par événement, sur les tables ou à l\'entrée.'],
        ['face', 'Chacun repart', 'Un selfie, et chaque invité récupère les photos où il apparaît.']
      ]
    },
    espace: {
      title: 'Votre espace, en quatre gestes',
      steps: [
        ['plus', 'Créer', 'Donnez un nom à l\'événement. Son QR code est prêt aussitôt, et ne changera plus.'],
        ['upload', 'Déposer', 'Glissez les photos. Les visages sont repérés ici, sur votre ordinateur.'],
        ['globe', 'Publier', 'La galerie part en ligne toute seule à la fin de l\'envoi.'],
        ['qr', 'Partager', 'Imprimez le QR code ou envoyez le lien. Les invités font le reste.']
      ]
    },
    superadmin: {
      title: 'Gestion des clients',
      steps: [
        ['chat', 'Demande', 'Un client vous écrit sur WhatsApp et règle son offre.'],
        ['userPlus', 'Compte', 'Vous créez son compte : son espace est réservé tout de suite.'],
        ['send', 'Identifiants', 'Vous les lui envoyez en un clic. Il choisira son mot de passe.'],
        ['gauge', 'Suivi', 'Vous gardez un œil sur l\'espace utilisé et ajustez l\'offre si besoin.']
      ]
    },
    guest: {
      title: 'On retrouve vos photos ?',
      steps: [
        ['hand', 'D\'accord ?', 'Cochez la case. Votre selfie reste sur ce téléphone, il n\'est envoyé nulle part.'],
        ['face', 'Selfie', 'De face, avec un peu de lumière. Quelques secondes suffisent.'],
        ['check', 'Un coup d\'œil', 'Retirez une photo avec « Pas moi », confirmez celles où vous avez un doute.'],
        ['download', 'C\'est à vous', 'Téléchargez tout d\'un coup, ou partagez directement.']
      ]
    }
  };

  var STEP_MS = 1150, END_HOLD_MS = 2600;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pageKey() {
    var k = document.body.getAttribute('data-intro') || 'home';
    return CONTENT[k] ? k : 'home';
  }
  function seen(k) { try { return localStorage.getItem('eurekaIntro:' + k) === '1'; } catch (e) { return true; } }
  function markSeen(k) { try { localStorage.setItem('eurekaIntro:' + k, '1'); } catch (e) {} }
  function svg(name) {
    return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[name] + '</svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* Entrée en douceur du contenu de la page, après l'introduction (ou directement si elle est déjà vue). */
  function revealPage() {
    if (reduce) return;
    document.documentElement.classList.add('page-enter');
    setTimeout(function () { document.documentElement.classList.remove('page-enter'); }, 900);
  }

  var open = false;
  function play(key, isReplay) {
    if (open) return;
    open = true;
    var c = CONTENT[key], timers = [], active = -1, lastFocus = document.activeElement;

    var ov = document.createElement('div');
    ov.className = 'intro' + (reduce ? ' intro--static' : '');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'introTitle');
    ov.tabIndex = -1;
    ov.innerHTML =
      '<div class="intro-stage">' +
        '<button type="button" class="intro-skip">Passer</button>' +
        '<div class="intro-brand"><img src="img/logo.png" alt="Eureka Smart Photo Finder" width="150" height="167" style="width:150px;height:auto"></div>' +
        
        '<h2 class="intro-title" id="introTitle">' + esc(c.title) + '</h2>' +
        '<ol class="intro-steps">' +
          '<li class="intro-track" aria-hidden="true"><i></i></li>' +
          c.steps.map(function (s, i) {
            return '<li class="intro-step" style="--i:' + i + '">' +
              '<span class="intro-node">' + svg(s[0]) + '<b>' + (i + 1) + '</b></span>' +
              '<span class="intro-label">' + esc(s[1]) + '</span>' +
              '<span class="intro-desc">' + esc(s[2]) + '</span>' +
            '</li>';
          }).join('') +
        '</ol>' +
        '<p class="intro-caption" aria-live="polite"></p>' +
        '<div class="intro-actions"><button type="button" class="btn primary intro-go">Commencer<span class="intro-timer" aria-hidden="true"></span></button></div>' +
      '</div>';
    document.body.appendChild(ov);
    document.documentElement.classList.add('intro-open');

    var steps = ov.querySelectorAll('.intro-step'), cap = ov.querySelector('.intro-caption'), go = ov.querySelector('.intro-go');

    function setActive(i) {
      active = i;
      for (var j = 0; j < steps.length; j++) {
        steps[j].classList.toggle('is-done', j < i);
        steps[j].classList.toggle('is-active', j === i);
      }
      ov.style.setProperty('--progress', steps.length > 1 ? (i / (steps.length - 1)) : 1);
      cap.classList.remove('is-in'); void cap.offsetWidth;
      cap.textContent = c.steps[i][2];
      cap.classList.add('is-in');
    }
    function close() {
      if (!open) return;
      open = false;
      timers.forEach(clearTimeout);
      markSeen(key);
      ov.classList.add('is-leaving');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () {
        ov.remove();
        document.documentElement.classList.remove('intro-open');
        if (lastFocus && lastFocus.focus && isReplay) lastFocus.focus();
      }, reduce ? 0 : 320);
      revealPage();
      resolveDone();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { // garder le focus dans la fenêtre
        var f = ov.querySelectorAll('button'), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.intro-skip').addEventListener('click', close);
    go.addEventListener('click', close);
    // Cliquer sur une étape l'affiche (et arrête le défilement automatique)
    Array.prototype.forEach.call(steps, function (el, i) {
      el.addEventListener('click', function () { timers.forEach(clearTimeout); timers = []; ov.classList.add('is-manual'); setActive(i); });
    });

    if (reduce) {
      ov.classList.add('is-ready');
      for (var k = 0; k < steps.length; k++) steps[k].classList.add('is-done');
      ov.style.setProperty('--progress', 1);
      cap.textContent = '';
      go.focus();
      return;
    }
    // Séquence : entrée de la scène, puis une étape toutes les 1,15 s, puis « Commencer » et fermeture automatique.
    requestAnimationFrame(function () { ov.classList.add('is-in'); });
    ov.focus({ preventScroll: true });
    c.steps.forEach(function (_, i) { timers.push(setTimeout(function () { setActive(i); }, 650 + i * STEP_MS)); });
    var end = 650 + (c.steps.length - 1) * STEP_MS + 700;
    timers.push(setTimeout(function () { ov.classList.add('is-ready'); go.focus({ preventScroll: true }); }, end));
    // Fermeture automatique, sauf si l'utilisateur a choisi une étape pour la lire.
    timers.push(setTimeout(function () { if (!ov.classList.contains('is-manual')) close(); }, end + END_HOLD_MS));
  }

  /* Bouton « Comment ça marche » dans l'en-tête, pour revoir l'animation. */
  function addHelpButton(key) {
    var bar = document.querySelector('header.top .top-in');
    if (!bar || bar.querySelector('.intro-help')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'intro-help';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2.1-2.4 3.6"/><path d="M12 17h.01"/></svg><span>Comment ça marche ?</span>';
    b.addEventListener('click', function () { play(pageKey(), true); });
    var brand = bar.querySelector('.brand');
    if (brand && brand.nextSibling) bar.insertBefore(b, brand.nextSibling); else bar.appendChild(b);
  }

  function start() {
    var key = pageKey();
    addHelpButton(key);
    if (seen(key)) { revealPage(); resolveDone(); } else play(key, false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
