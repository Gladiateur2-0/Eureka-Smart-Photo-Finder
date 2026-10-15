/* Scène animée des pages de connexion (script classique : fonctionne même en ouvrant la page par double-clic).
 *
 *   attente      : le personnage patiente devant la porte ; la poignée bouge quand on tape
 *   vérification : il s'avance, frappe (« Toc toc »), la porte s'entrouvre
 *   succès       : lampe verte, la porte s'ouvre en grand, la lumière sort, des étincelles,
 *                  il salue (« Bienvenue ! ») et entre en marchant ; la porte se referme derrière lui
 *   échec        : la porte claque (rebond + poussière), cadenas rouge, il sursaute, secoue la tête
 *                  (« Oups ! ») et repart à sa place
 *
 * Utilisation :  var door = Eureka.createDoorScene(conteneur);
 *                door.pending();  door.success().then(…)  ou  door.fail().then(…)
 * Respecte « prefers-reduced-motion » : les états changent sans mouvement. */
(function () {
  'use strict';
  var REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(.22,1,.36,1)';
  var IDLE_X = 96, KNOCK_X = 186, INSIDE_X = 266, GROUND = 252;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, REDUCE ? 0 : ms); }); };

  var STAR = 'M0 -7L1.8 -1.8 7 0 1.8 1.8 0 7 -1.8 1.8 -7 0 -1.8 -1.8Z';
  var sparks = [[-58, -40], [-40, -150], [6, -196], [52, -150], [64, -46], [-66, -96], [70, -110], [0, -120]]
    .map(function (p, i) { return '<path class="d-spark" d="' + STAR + '" transform="translate(' + (266 + p[0]) + ' ' + (GROUND + p[1]) + ')" fill="' + (i % 2 ? '#FFD166' : '#3DDC84') + '" opacity="0"/>'; }).join('');
  var dust = [[214, 0], [204, -6], [226, -4], [318, 0], [328, -6], [306, -3]]
    .map(function (p) { return '<circle class="d-dust" cx="' + p[0] + '" cy="' + (GROUND + p[1]) + '" r="6" fill="#D9D3C4" opacity="0"/>'; }).join('');

  var SVG = '' +
'<svg class="door-svg" viewBox="0 0 400 300" role="img" aria-labelledby="doorTitle">' +
'  <title id="doorTitle">Un visiteur devant la porte de votre espace Eureka</title>' +
'  <defs>' +
'    <linearGradient id="dLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8DD"/><stop offset=".55" stop-color="#E3F6FB"/><stop offset="1" stop-color="#3DDC84"/></linearGradient>' +
'    <linearGradient id="dRay" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF4C2" stop-opacity=".95"/><stop offset="1" stop-color="#FFF4C2" stop-opacity="0"/></linearGradient>' +
'    <radialGradient id="dGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4C2" stop-opacity=".9"/><stop offset="1" stop-color="#FFF4C2" stop-opacity="0"/></radialGradient>' +
'    <linearGradient id="dPanel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0A5CBF"/><stop offset="1" stop-color="#084BA0"/></linearGradient>' +
'  </defs>' +
'  <rect x="0" y="0" width="400" height="' + GROUND + '" fill="#F2F7FC"/>' +
'  <g fill="#E3EDF7"><rect x="24" y="40" width="58" height="34" rx="6"/><rect x="92" y="24" width="40" height="28" rx="6"/><rect x="344" y="52" width="40" height="30" rx="6"/></g>' +
'  <g stroke="#CFDDEC" stroke-width="1.5" fill="#FFFFFF">' +
'    <rect x="36" y="96" width="34" height="42" rx="3" transform="rotate(-6 53 117)"/><rect x="80" y="110" width="30" height="36" rx="3" transform="rotate(5 95 128)"/><rect x="340" y="104" width="32" height="40" rx="3" transform="rotate(4 356 124)"/>' +
'  </g>' +
'  <g fill="#A9D8F0"><circle cx="53" cy="114" r="5"/><circle cx="95" cy="125" r="4"/><circle cx="356" cy="120" r="5"/></g>' +
'  <rect x="0" y="' + GROUND + '" width="400" height="' + (300 - GROUND) + '" fill="#E6EFF8"/>' +
'  <rect x="0" y="' + GROUND + '" width="400" height="2" fill="#CFDDEC"/>' +
'  <polygon class="d-rays" points="219,' + (GROUND + 2) + ' 313,' + (GROUND + 2) + ' 400,300 120,300" fill="url(#dRay)" opacity="0"/>' +
'  <ellipse class="d-glowfloor" cx="266" cy="' + (GROUND + 8) + '" rx="84" ry="11" fill="url(#dGlow)" opacity="0"/>' +
'  <rect x="209" y="60" width="114" height="' + (GROUND - 58) + '" rx="8" fill="#0E2A4F"/>' +
'  <rect x="219" y="70" width="94" height="182" fill="#0B2244"/>' +
'  <rect class="d-inside" x="219" y="70" width="94" height="182" fill="url(#dLight)" opacity="0"/>' +
'  <rect x="236" y="36" width="60" height="18" rx="9" fill="#0E2A4F"/>' +
'  <text class="d-sign" x="266" y="50" text-anchor="middle" font-family="Caveat, cursive" font-size="15" font-weight="700" fill="#3DDC84">Eureka</text>' +
'  <circle class="d-lamp" cx="266" cy="65" r="4" fill="#5B6B82"/>' +
'  <g class="d-man" transform="translate(' + IDLE_X + ' ' + GROUND + ')">' +
'    <g class="d-body">' +
'      <ellipse cx="0" cy="1" rx="20" ry="4" fill="#0E2A4F" opacity=".12"/>' +
'      <g class="d-leg d-leg-b"><rect x="-6" y="-58" width="11" height="54" rx="5.5" fill="#16325C"/><ellipse cx="2" cy="-3" rx="9" ry="4.5" fill="#0B2244"/></g>' +
'      <g class="d-arm d-arm-b"><rect x="-5" y="-100" width="10" height="42" rx="5" fill="#22C06B"/><circle cx="0" cy="-58" r="5.5" fill="#8B5A3C"/></g>' +
'      <rect x="-15" y="-104" width="30" height="50" rx="13" fill="#3DDC84"/>' +
'      <path d="M-15 -70h30v10a6 6 0 0 1-6 6h-18a6 6 0 0 1-6-6z" fill="#22C06B"/>' +
'      <g class="d-leg d-leg-f"><rect x="-5" y="-58" width="11" height="54" rx="5.5" fill="#1C3D6E"/><ellipse cx="3" cy="-3" rx="9" ry="4.5" fill="#0B2244"/></g>' +
'      <rect x="-4" y="-112" width="8" height="10" rx="3" fill="#7A4D33"/>' +
'      <g class="d-head"><circle cx="0" cy="-124" r="14" fill="#8B5A3C"/>' +
'        <path d="M-14 -126a14 14 0 0 1 28 0c-4-6-9-8-14-8s-10 2-14 8z" fill="#1A1410"/>' +
'        <circle cx="7" cy="-125" r="1.7" fill="#1A1410"/>' +
'        <path class="d-mouth" d="M5 -117q3 2 6 0" stroke="#1A1410" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>' +
'      <g class="d-arm d-arm-f"><rect x="-5" y="-100" width="10" height="42" rx="5" fill="#3DDC84"/><circle cx="0" cy="-58" r="5.5" fill="#8B5A3C"/></g>' +
'    </g>' +
'  </g>' +
'  <g class="d-door">' +
'    <rect x="219" y="70" width="94" height="182" fill="url(#dPanel)"/>' +
'    <rect x="231" y="84" width="70" height="62" rx="4" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="2"/>' +
'    <rect x="231" y="160" width="70" height="78" rx="4" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="2"/>' +
'    <rect x="252" y="96" width="28" height="18" rx="9" fill="#0B2244"/>' +
'    <g class="d-knob"><circle cx="300" cy="166" r="6" fill="#FFD166"/><rect x="292" y="164" width="12" height="4" rx="2" fill="#E8B84A"/></g>' +
'    <g class="d-lock" opacity="0"><g class="d-lock-in">' +
'      <path d="M258 186v-8a8 8 0 0 1 16 0v8" fill="none" stroke="#FFFFFF" stroke-width="3.5"/>' +
'      <rect x="253" y="185" width="26" height="22" rx="5" fill="#B3261E"/><circle cx="266" cy="195" r="3" fill="#FFFFFF"/>' +
'    </g></g>' +
'  </g>' +
   dust + sparks +
'  <g class="d-bubble" opacity="0"><g class="d-bubble-in">' +
'    <rect class="d-bubble-r" x="-42" y="-30" width="84" height="26" rx="13" fill="#FFFFFF" stroke="#0E2A4F" stroke-width="1.5"/>' +
'    <path d="M-6 -4l4 8 4-8" fill="#FFFFFF" stroke="#0E2A4F" stroke-width="1.5" stroke-linejoin="round"/>' +
'    <rect x="-5" y="-6" width="10" height="3" fill="#FFFFFF"/>' +
'    <text class="d-bubble-t" x="0" y="-11" text-anchor="middle" font-family="Caveat, cursive" font-size="18" font-weight="700" fill="#0E2A4F">Toc toc</text>' +
'  </g></g>' +
'</svg>';

  function createDoorScene(host) {
    host.innerHTML = SVG;
    host.classList.add('door-scene');
    var q = function (s) { return host.querySelector(s); }, qa = function (s) { return Array.prototype.slice.call(host.querySelectorAll(s)); };
    var man = q('.d-man'), body = q('.d-body'), head = q('.d-head'), door = q('.d-door'), inside = q('.d-inside');
    var lamp = q('.d-lamp'), knob = q('.d-knob'), bubble = q('.d-bubble'), bubbleIn = q('.d-bubble-in'), bubbleT = q('.d-bubble-t');
    var glow = q('.d-glowfloor'), rays = q('.d-rays'), lock = q('.d-lock'), lockIn = q('.d-lock-in'), sign = q('.d-sign'), mouth = q('.d-mouth');
    var legs = [q('.d-leg-f'), q('.d-leg-b')], arms = [q('.d-arm-f'), q('.d-arm-b')], sparkEls = qa('.d-spark'), dustEls = qa('.d-dust');
    [door, knob, bubbleIn, body, head, lockIn].concat(legs, arms, sparkEls, dustEls).forEach(function (el) { el.style.transformBox = 'fill-box'; });
    bubbleIn.style.transformOrigin = '50% 100%';
    door.style.transformOrigin = 'left center';
    knob.style.transformOrigin = 'center';
    head.style.transformOrigin = '50% 100%';
    lockIn.style.transformOrigin = 'center';
    sparkEls.concat(dustEls).forEach(function (el) { el.style.transformOrigin = 'center'; });
    legs.concat(arms).forEach(function (el) { el.style.transformOrigin = '50% 4px'; });

    var x = IDLE_X, face = 1, walking = [], current = Promise.resolve(), knockLoop = null;
    function place(nx, scale) { scale = scale == null ? 1 : scale; x = nx; man.setAttribute('transform', 'translate(' + nx + ' ' + GROUND + ') scale(' + (scale * face) + ' ' + scale + ')'); }
    function anim(el, frames, opts) {
      var o = { fill: 'forwards', easing: EASE }; for (var k in opts) o[k] = opts[k];
      if (REDUCE) o = { duration: 1, fill: 'forwards' };
      return el.animate(frames, o).finished;
    }
    function doorAt(open) { return 'scaleX(' + (1 - open * 0.84) + ') skewY(' + (-open * 9) + 'deg)'; }
    function fadeAttr(el, to, ms) { // opacité d'un élément SVG, en douceur
      var from = parseFloat(el.getAttribute('opacity') || '0');
      if (REDUCE) { el.setAttribute('opacity', to); return; }
      var t0 = performance.now();
      (function step(t) { var k = Math.min(1, (t - t0) / ms); el.setAttribute('opacity', from + (to - from) * k); if (k < 1) requestAnimationFrame(step); })(t0);
    }
    var swing = function (el, a, b, ms) { return el.animate([{ transform: 'rotate(' + a + 'deg)' }, { transform: 'rotate(' + b + 'deg)' }], { duration: ms, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }); };
    function startWalk(fast) {
      if (REDUCE) return;
      stopWalk(); var ms = fast ? 300 : 380;
      walking = [swing(legs[0], 24, -24, ms), swing(legs[1], -24, 24, ms), swing(arms[0], -26, 26, ms), swing(arms[1], 26, -26, ms),
        body.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }], { duration: ms / 2, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' })];
    }
    function stopWalk() { walking.forEach(function (a) { a.cancel(); }); walking = []; }

    function walkTo(nx, ms, extra) {
      extra = extra || {};
      var from = x, s0 = extra.from == null ? 1 : extra.from, s1 = extra.to == null ? 1 : extra.to;
      face = extra.backwards ? 1 : (nx < from ? -1 : 1);
      if (REDUCE) { place(nx, s1); return Promise.resolve(); }
      startWalk(extra.fast);
      return new Promise(function (res) {
        var t0 = performance.now();
        (function step(t) {
          var k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          place(from + (nx - from) * e, s0 + (s1 - s0) * e);
          if (extra.fade) man.style.opacity = String(1 - Math.max(0, (k - .6) / .4));
          if (k < 1) requestAnimationFrame(step); else { stopWalk(); res(); }
        })(t0);
      });
    }
    function say(text, color) {
      bubbleT.textContent = text; bubbleT.setAttribute('fill', color || '#0E2A4F');
      bubble.setAttribute('transform', 'translate(' + (x + 4) + ' ' + (GROUND - 146) + ')');
      bubbleIn.getAnimations().forEach(function (a) { a.cancel(); });
      bubble.setAttribute('opacity', '1');
      if (!REDUCE) bubbleIn.animate([{ transform: 'scale(.5) rotate(-6deg)', opacity: 0 }, { transform: 'scale(1.08) rotate(2deg)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, easing: EASE });
    }
    function hush() { bubble.setAttribute('opacity', '0'); }
    function lampColor(c, blink) {
      lamp.setAttribute('fill', c);
      if (!REDUCE) lamp.animate([{ opacity: 1 }, { opacity: .3 }, { opacity: 1 }, { opacity: .3 }, { opacity: 1 }], { duration: blink || 600 });
    }
    function burst() { // étincelles qui jaillissent de la porte
      if (REDUCE) return;
      sparkEls.forEach(function (s, i) {
        s.setAttribute('opacity', '1');
        s.animate([{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: 'scale(1.4) rotate(90deg)', opacity: 1, offset: .4 }, { transform: 'scale(.2) rotate(180deg)', opacity: 0 }],
          { duration: 900, delay: i * 55, easing: 'ease-out', fill: 'forwards' });
      });
    }
    function puff() { // poussière quand la porte claque
      if (REDUCE) return;
      dustEls.forEach(function (d, i) {
        d.setAttribute('opacity', '1');
        var dx = (i < 3 ? -1 : 1) * (10 + i * 3);
        d.animate([{ transform: 'translate(0,0) scale(.4)', opacity: .9 }, { transform: 'translate(' + dx + 'px,-14px) scale(1.5)', opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' });
      });
    }
    function smile(on) { mouth.setAttribute('d', on ? 'M3 -118q4 4 9 0' : 'M5 -117q3 2 6 0'); }
    function frown() { mouth.setAttribute('d', 'M5 -115q3 -2 6 0'); }

    function reset() {
      stopWalk(); clearInterval(knockLoop); hush();
      [door, head, lockIn, sign].concat(arms, sparkEls, dustEls).forEach(function (el) { el.getAnimations().forEach(function (a) { a.cancel(); }); });
      door.style.transform = doorAt(0);
      [inside, glow, rays, lock].forEach(function (el) { el.setAttribute('opacity', '0'); });
      sparkEls.concat(dustEls).forEach(function (el) { el.setAttribute('opacity', '0'); });
      lamp.setAttribute('fill', '#5B6B82'); smile(false);
      man.style.opacity = '1'; face = 1; place(IDLE_X);
      host.classList.remove('is-ok', 'is-ko');
    }

    var lastWiggle = 0;
    function typing() {
      if (REDUCE || performance.now() - lastWiggle < 250) return;
      lastWiggle = performance.now();
      knob.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-28deg)' }, { transform: 'rotate(0)' }], { duration: 300, easing: EASE });
    }

    function pending() {
      reset();
      current = (async function () {
        await walkTo(KNOCK_X, 560);
        say('Toc toc');
        if (!REDUCE) {
          var knock = function () { arms[0].animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-80deg)' }, { transform: 'rotate(-62deg)' }, { transform: 'rotate(-80deg)' }, { transform: 'rotate(0)' }], { duration: 620, easing: 'ease-in-out' }); };
          knock(); knockLoop = setInterval(knock, 900);
          await wait(240);
        }
        await anim(door, [{ transform: doorAt(0) }, { transform: doorAt(.18) }], { duration: 300 });
        inside.setAttribute('opacity', '.35');
      })();
      return current;
    }

    async function success() {
      await current; clearInterval(knockLoop); hush();
      host.classList.add('is-ok');
      lampColor('#5FCB5A');
      if (!REDUCE) sign.animate([{ opacity: 1 }, { opacity: .4 }, { opacity: 1 }], { duration: 500, iterations: 2 });
      fadeAttr(inside, 1, 300); fadeAttr(glow, 1, 500); fadeAttr(rays, 1, 600);
      await anim(door, [{ transform: doorAt(.18) }, { transform: doorAt(1.04) }, { transform: doorAt(1) }], { duration: 520 });
      burst(); smile(true);
      say('Bienvenue !', '#0A5CBF');
      if (!REDUCE) {   // il salue de la main
        await arms[0].animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-150deg)' }, { transform: 'rotate(-120deg)' }, { transform: 'rotate(-150deg)' }, { transform: 'rotate(-120deg)' }, { transform: 'rotate(0)' }], { duration: 700, easing: 'ease-in-out' }).finished;
      }
      hush();
      await walkTo(INSIDE_X, 900, { from: 1, to: .8, fade: true });
      fadeAttr(rays, 0, 300);
      await anim(door, [{ transform: doorAt(1) }, { transform: doorAt(0) }], { duration: 320 });
      fadeAttr(glow, 0, 300);
    }

    async function fail() {
      await current; clearInterval(knockLoop); hush();
      host.classList.add('is-ko');
      lampColor('#E5484D', 900);
      // la porte claque, avec un petit rebond
      await anim(door, [{ transform: doorAt(.18) }, { transform: doorAt(0) }], { duration: 130, easing: 'cubic-bezier(.6,0,1,1)' });
      inside.setAttribute('opacity', '0'); puff();
      if (!REDUCE) {
        door.animate([{ transform: doorAt(0) }, { transform: doorAt(.05) }, { transform: doorAt(0) }, { transform: doorAt(.02) }, { transform: doorAt(0) }], { duration: 380, easing: 'ease-out' });
        host.querySelector('.door-svg').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'ease-out' });
      }
      lock.setAttribute('opacity', '1');
      if (!REDUCE) lockIn.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 360, easing: EASE });
      frown(); say('Oups !', '#B3261E');
      if (!REDUCE) body.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' });
      await walkTo(KNOCK_X - 34, 360, { backwards: true });
      if (!REDUCE) await head.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0)' }], { duration: 700, easing: 'ease-in-out' }).finished;
      await wait(250);
      hush();
      await walkTo(IDLE_X, 600);
      face = 1; place(IDLE_X); smile(false);
      lamp.setAttribute('fill', '#5B6B82');
      fadeAttr(lock, 0, 400);
      host.classList.remove('is-ko');
    }

    reset();
    return { reset: reset, typing: typing, pending: pending, success: success, fail: fail };
  }

  window.Eureka = window.Eureka || {};
  window.Eureka.createDoorScene = createDoorScene;
})();
