/**
 * Présentation « Démarrer l'explication », jouée par-dessus la carte sur tous les écrans du live.
 * Le serveur retient la position (voir src/deck.js) : cette page affiche la diapositive reçue, et rien
 * ne défile tout seul. Seules les animations internes d'une diapositive se jouent d'elles-mêmes.
 *
 * C'est une seule scène continue : les quatre boules quittent les coins de la carte, passent d'une
 * diapositive à l'autre sans jamais disparaître, puis retournent se poser exactement sur leur coin.
 * Tout est dimensionné en unités de conteneur : la scène 16:9 s'adapte à l'écran comme à l'aperçu admin.
 */
(function () {
  'use strict';
  const K = window.AvatarKit;
  const SLIDES = window.DeckSlides && window.DeckSlides.SLIDES;
  const root = document.getElementById('live');
  const stage = document.getElementById('lv-stage');
  const configEl = document.getElementById('lv-deck');
  if (!K || !SLIDES || !root || !stage || !configEl) return;

  const config = JSON.parse(configEl.textContent);
  const dims = config.dims;
  const ORDER = ['D', 'I', 'S', 'C'];
  const ZONES = { D: 'tl', I: 'tr', S: 'br', C: 'bl' };
  const BLOB_WIDTH = 0.6; // largeur d'une boule à l'échelle 1, en part de la scène
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLOSE_MS = reduced ? 0 : 1150;

  const byId = new Map(SLIDES.map((s) => [s.id, s]));
  const avatars = new Map();
  let snap = null;
  let isOpen = false;
  let currentId = null;
  let beats = [];
  let closing = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const fill = (text) => String(text).replace('{blocks}', config.blocks);

  /* ----------  Scène  ---------- */
  const deck = document.createElement('div');
  deck.className = 'dk';
  deck.hidden = true;
  deck.setAttribute('role', 'region');
  deck.setAttribute('aria-label', 'Présentation du DISC');
  deck.innerHTML = `<div class="dk-veil"><div class="dk-sky"></div></div>
    <div class="dk-frame">
      <div class="dk-blobs">${ORDER.map((d, i) => `<div class="dk-blob" data-dim="${d}" style="--i:${i}"><div class="dk-hop"><div class="dk-float">${K.renderBlob({ color: dims[d].color, face: dims[d].face })}</div></div></div>`).join('')}</div>
      <div class="dk-layers"></div>
      <div class="dk-pill"><i></i><span></span></div>
    </div>`;
  stage.appendChild(deck);

  const veil = deck.querySelector('.dk-veil');
  const frame = deck.querySelector('.dk-frame');
  const layers = deck.querySelector('.dk-layers');
  const blobLayer = deck.querySelector('.dk-blobs');
  const pillFill = deck.querySelector('.dk-pill i');
  const pillText = deck.querySelector('.dk-pill span');
  const blobs = Object.fromEntries(ORDER.map((d) => [d, deck.querySelector(`[data-dim="${d}"]`)]));

  function place(el, p) {
    el.style.transform = `translate(${p.x}cqw, ${p.y}cqh) scale(${p.s})`;
  }
  function pose(map) { ORDER.forEach((d) => place(blobs[d], map[d])); }

  /** Les boules de la carte, exprimées dans le repère de la scène : le départ et l'arrivée du voyage. */
  function cornerPose() {
    const f = frame.getBoundingClientRect();
    const out = {};
    for (const d of ORDER) {
      const blob = stage.querySelector(`.lv-zone.${ZONES[d]} .blob-svg`);
      const r = blob.getBoundingClientRect();
      out[d] = {
        x: ((r.left + r.width / 2 - f.left) / f.width) * 100,
        y: ((r.top + r.height / 2 - f.top) / f.height) * 100,
        s: r.width / (f.width * BLOB_WIDTH),
      };
    }
    return out;
  }

  function hop(d) {
    if (reduced) return;
    blobs[d].firstElementChild.animate(
      [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-9%) scale(1.05, .97)', offset: 0.35 }, { transform: 'translateY(0) scale(1)' }],
      { duration: 620, easing: 'cubic-bezier(.23, 1, .32, 1)' },
    );
  }

  function later(fn, ms) { beats.push(setTimeout(fn, ms)); }
  function clearBeats() {
    beats.forEach(clearTimeout);
    beats = [];
  }

  /* ----------  Morceaux de texte  ---------- */
  const eyebrow = (text, d = 0) => `<div class="dk-eyebrow dk-in" style="--d:${d}ms">${esc(text)}</div>`;

  /** Phrase lue mot à mot, comme sur les maquettes : la seconde partie reste en gris. */
  function read(parts, delay, extra = '') {
    let i = 0;
    const html = parts.map((part, p) => fill(part).split(' ').map((w) => `<span class="dk-w${p ? ' is-soft' : ''}" style="--i:${i++}">${esc(w)}</span>`).join(' ')).join(' ');
    return `<p class="dk-say ${extra}" style="--d:${delay}ms">${html}</p>`;
  }

  /** Titre dont les lettres montent une à une : c'est le coup d'éclat de chaque diapositive. */
  function title(text, delay, extra = '') {
    let i = 0;
    const html = text.split(' ').map((word) => `<span class="dk-word">${[...word].map((c) => `<span class="dk-c" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
    return `<h1 class="dk-title ${extra}" style="--d:${delay}ms" aria-label="${esc(text)}">${html}</h1>`;
  }

  function avatarUrl(person) {
    const key = JSON.stringify(person.avatar);
    if (!avatars.has(key)) avatars.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(K.renderAvatar(person.avatar, { expression: 'joy', background: false }))}`);
    return avatars.get(key);
  }

  /** Le public : les vrais avatars, mélangés et neutres, sans aucun lien avec les résultats. */
  function crowd(delay) {
    const people = (snap ? snap.people : []).slice().sort((a, b) => ((a.id * 7919) % 101) - ((b.id * 7919) % 101)).slice(0, 48);
    if (!people.length) return '';
    const n = people.length;
    const size = n <= 10 ? 7.4 : n <= 20 ? 5.9 : n <= 32 ? 5 : 4.1;
    return `<div class="dk-crowd" style="--a:${size}cqw">${people.map((p, i) => `<span class="lv-ring dk-face" style="--p:1;--ring:${['#F07A6E', '#F6C644', '#7CD39A', '#6EC1F5'][i % 4]};--d:${delay + i * 34}ms"><img alt="" src="${avatarUrl(p)}"></span>`).join('')}</div>`;
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 5) return 'Bonne nuit';
    if (hour < 12) return 'Bonjour';
    return hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  }

  function wave() {
    const p = 'M0 30 C 12 30 18 22 26 26 S 40 44 50 30 S 62 6 72 22 S 86 54 96 30 S 108 10 118 26 S 132 40 142 30 S 154 18 166 24 S 180 42 190 30 S 206 26 230 30';
    return `<svg class="dk-wave" viewBox="0 0 230 56" aria-hidden="true"><g><path d="${p}"/><path d="${p}" transform="translate(230 0)"/></g></svg>`;
  }

  /* ----------  Diapositives  ---------- */
  const VIEWS = {
    hello: (s) => `<div class="dk-center is-top">
        ${eyebrow(s.eyebrow)}
        <h1 class="dk-hero dk-in" style="--d:120ms">${esc(greeting())} l'équipe</h1>
        ${read(s.say, 700)}
        ${crowd(2100)}
      </div>`,

    scene: (s) => `<div class="dk-center is-top is-tight">
        ${eyebrow(s.eyebrow)}
        ${read(s.say, 200, 'is-big is-wide')}
      </div>
      ${ORDER.map((d, i) => `<div class="dk-bubble" style="--x:${s.blobs[d].x}cqw;--c:${dims[d].color};--d:${1900 + i * 1700}ms">${esc(s.lines[d])}</div>`).join('')}`,

    statement: (s) => `<div class="dk-center is-mid">
        ${eyebrow(s.eyebrow)}
        ${title(s.title, 120)}
        ${read(s.say, 900)}
        <p class="dk-note dk-in" style="--d:3600ms">${esc(s.note)}</p>
      </div>`,

    axes: (s) => `<div class="dk-left is-axes">
        ${eyebrow(s.eyebrow)}
        ${title(s.title, 120, 'is-small')}
        <p class="dk-question dk-in" style="--d:1300ms"><i>1</i>${esc(s.questions[0])}</p>
        <p class="dk-question dk-in" style="--d:3300ms"><i>2</i>${esc(s.questions[1])}</p>
        <p class="dk-conclusion dk-in" style="--d:6400ms">${esc(s.conclusion)}</p>
      </div>
      <div class="dk-axes">
        <i class="dk-axis is-v"></i><i class="dk-axis is-h"></i>
        <span class="dk-end is-top dk-in" style="--d:1500ms">${esc(s.ends.top)}</span>
        <span class="dk-end is-bottom dk-in" style="--d:1500ms">${esc(s.ends.bottom)}</span>
        <span class="dk-end is-left dk-in" style="--d:3500ms">${esc(s.ends.left)}</span>
        <span class="dk-end is-right dk-in" style="--d:3500ms">${esc(s.ends.right)}</span>
      </div>
      ${ORDER.map((d, i) => { const q = s.beats[0].blobs[d]; return `<span class="dk-mark dk-in" style="left:${q.x}cqw;top:${q.y + 8.5}cqh;--d:${5900 + i * 90}ms;--c:${dims[d].color}"><b>${d}</b>${esc(dims[d].name)}</span>`; }).join('')}`,

    dim: (s) => `<div class="dk-left is-dim" style="--ink:${dims[s.dim].chart}">
        ${eyebrow(s.eyebrow)}
        ${title(s.title, 240)}
        ${read(s.say, 760)}
        <ul class="dk-chips">${s.chips.map((c, i) => `<li class="dk-in" style="--d:${1900 + i * 110}ms;--c:${dims[s.dim].color}">${esc(c)}</li>`).join('')}</ul>
      </div>
      <div class="dk-ask" style="--d:2500ms;--c:${dims[s.dim].color}"><small>Sa question</small>${esc(s.ask)}</div>`,

    mix: (s) => `<div class="dk-center is-top is-tight">
        ${eyebrow(s.eyebrow)}
        ${title(s.title, 120, 'is-small')}
      </div>
      <div class="dk-center is-foot">${read(s.say, 1300, 'is-small')}</div>`,

    survey: (s) => `<div class="dk-left is-survey">
        ${eyebrow(s.eyebrow)}
        ${read(s.say, 240, 'is-big')}
        <p class="dk-tip dk-in" style="--d:3400ms">${esc(s.tip)}</p>
      </div>
      <div class="dk-phone dk-in" style="--d:300ms">
        <div class="dk-phone-bar"><i></i></div>
        <div class="dk-phone-head"><span class="dk-count"></span><span class="dk-sample">${esc(s.sample)}</span></div>
        <div class="dk-phone-body"></div>
        <span class="dk-next">Suivant</span>
        <i class="dk-finger"></i>
      </div>`,

    map: (s) => `<div class="dk-center is-top is-tight">
        ${eyebrow(s.eyebrow)}
        ${read(s.say, 200, 'is-small')}
      </div>
      <div class="dk-dots"></div>
      <span class="dk-mapnote dk-in" style="--d:1000ms">${esc(s.sample)}</span>
      <p class="dk-then dk-in" style="--d:6000ms">${esc(s.then)}</p>`,

    go: (s) => `<div class="dk-center is-top">
        <h1 class="dk-hero dk-in" style="--d:80ms">${esc(snap && snap.state === 'final' ? s.titleDone : s.title)}</h1>
        <ul class="dk-points">${s.points.map((p, i) => `<li class="dk-in" style="--d:${620 + i * 240}ms">${esc(p)}</li>`).join('')}</ul>
        ${read(s.say, 2400)}
        ${wave()}
      </div>`,
  };

  /* Ce qui se joue après l'affichage : réactions, démonstrations. */
  const RUNS = {
    scene(s) {
      ORDER.forEach((d, i) => later(() => hop(d), 1900 + i * 1700));
    },
    dim(s) {
      later(() => hop(s.dim), 2500);
    },
    survey: runSurvey,
    map: runMap,
  };

  function runSurvey(s, layer) {
    const phone = layer.querySelector('.dk-phone');
    const body = layer.querySelector('.dk-phone-body');
    const count = layer.querySelector('.dk-count');
    const bar = layer.querySelector('.dk-phone-bar i');
    const nextBtn = layer.querySelector('.dk-next');
    const finger = layer.querySelector('.dk-finger');
    const total = config.blocks;

    function showCount(n) {
      count.textContent = `${n} / ${total}`;
      bar.style.transform = `scaleX(${total ? n / total : 0})`;
    }
    function ask(step) {
      const head = body.querySelector('.dk-q');
      head.innerHTML = step === 'done'
        ? '<b>C\'est noté !</b>'
        : `<b>Ce qui te ressemble</b> <span class="dk-step is-${step === 'most' ? 'most' : 'least'}">${step === 'most' ? 'le plus' : 'le moins'}</span>`;
    }
    function draw(demo) {
      body.innerHTML = `<p class="dk-q"></p><div class="dk-choices">${demo.items.map((t) => `<div class="dk-choice"><span class="dk-tick"></span><span class="dk-choice-text">${esc(t)}</span><span class="dk-tag"></span></div>`).join('')}</div>`;
      ask('most');
      nextBtn.classList.remove('is-ready');
    }
    function point(target) {
      const a = phone.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      finger.classList.add('is-on');
      finger.style.transform = `translate(${(b.left - a.left + b.width * 0.72).toFixed(1)}px, ${(b.top - a.top + b.height * 0.5).toFixed(1)}px)`;
    }
    function pick(i, kind) {
      const el = body.querySelectorAll('.dk-choice')[i];
      finger.classList.remove('is-tap');
      void finger.offsetWidth;
      finger.classList.add('is-tap');
      el.classList.add(kind === 'most' ? 'is-most' : 'is-least');
      el.querySelector('.dk-tag').textContent = kind === 'most' ? '+ le plus' : '− le moins';
      ask(kind === 'most' ? 'least' : 'done');
      if (kind === 'least') {
        body.querySelector('.dk-choices').classList.add('is-done');
        nextBtn.classList.add('is-ready');
      }
    }
    /** Une réponse complète à l'écran, au rythme demandé. Rend l'instant où elle se termine. */
    function answer(demo, n, start, pace) {
      later(() => { draw(demo); showCount(n); }, start);
      later(() => point(body.querySelectorAll('.dk-choice')[demo.most]), start + 500 * pace);
      later(() => pick(demo.most, 'most'), start + 1050 * pace);
      later(() => point(body.querySelectorAll('.dk-choice')[demo.least]), start + 1500 * pace);
      later(() => pick(demo.least, 'least'), start + 2050 * pace);
      later(() => point(nextBtn), start + 2450 * pace);
      return start + 3000 * pace;
    }

    draw(s.demo[0]);
    showCount(1);
    let t = answer(s.demo[0], 1, 700, 1);
    t = answer(s.demo[1], 2, t, 0.72);
    // Les blocs suivants défilent : on voit la longueur du test sans s'y attarder.
    const remaining = Math.max(0, total - 2);
    later(() => {
      finger.classList.remove('is-on');
      nextBtn.classList.remove('is-ready');
      ask('most');
      body.querySelector('.dk-choices').className = 'dk-choices is-fast';
    }, t);
    for (let n = 0; n < remaining; n++) {
      later(() => {
        showCount(n + 3);
        body.querySelectorAll('.dk-choice').forEach((el, i) => {
          el.classList.toggle('is-most', i === (n * 3 + 1) % 4);
          el.classList.toggle('is-least', i === (n * 3 + 3) % 4);
        });
      }, t + n * 62);
    }
    later(() => {
      body.innerHTML = `<div class="dk-finish">${K.renderBlob({ color: dims.S.color, face: 'sparkle' })}<b>C'est terminé !</b></div>`;
      ORDER.forEach(hop);
    }, t + remaining * 62 + 120);
  }

  /** Points anonymes : la carte est expliquée sans montrer le résultat de personne. */
  function runMap(s, layer) {
    const box = layer.querySelector('.dk-dots');
    const count = Math.max(14, Math.min(36, snap ? snap.people.length : 24));
    const clusters = [
      { x: 34, y: 38, dim: 'D' }, { x: 66, y: 38, dim: 'I' }, { x: 64, y: 66, dim: 'S' }, { x: 36, y: 66, dim: 'C' }, { x: 50, y: 52, dim: 'I' },
    ];
    const sizes = new Array(clusters.length).fill(0);
    const dots = [];
    for (let i = 0; i < count; i++) {
      const c = (i * 3) % clusters.length;
      const k = sizes[c]++;
      const el = document.createElement('i');
      el.className = 'dk-dot';
      el.style.setProperty('--c', dims[clusters[c].dim].color);
      el.style.setProperty('--i', i);
      box.appendChild(el);
      const angle = k * 2.39996;
      const dist = Math.sqrt(k + 0.4);
      const spread = Math.sqrt((i + 1) / count);
      dots.push({ el, c, near: { x: 50 + (clusters[c].x - 50) * 0.3 + Math.cos(i * 2.39996) * spread * 10, y: 52 + (clusters[c].y - 52) * 0.3 + Math.sin(i * 2.39996) * spread * 17 }, at: { x: clusters[c].x + Math.cos(angle) * dist * 1.25, y: clusters[c].y + Math.sin(angle) * dist * 2.2 } });
    }
    const move = (key) => dots.forEach((d) => { d.el.style.transform = `translate(${d[key].x}cqw, ${d[key].y}cqh)`; });
    dots.forEach((d) => { d.el.style.transform = 'translate(50cqw, 52cqh)'; });
    const halos = clusters.map((c, i) => {
      const n = sizes[i];
      const el = document.createElement('div');
      el.className = 'dk-halo';
      const radius = 3.4 + Math.sqrt(n) * 1.5;
      el.style.cssText = `left:${c.x}cqw;top:${c.y}cqh;width:${radius * 2}cqw;--c:${dims[c.dim].color}`;
      el.innerHTML = '<span>Provisoire</span>';
      box.prepend(el);
      return el;
    });
    later(() => move('near'), 1300);
    later(() => move('at'), 3400);
    later(() => halos.forEach((h) => h.classList.add('is-on')), 4700);
    later(() => halos.forEach((h) => { h.classList.add('is-final'); h.querySelector('span').textContent = 'Définitif'; }), 8600);
  }

  /* ----------  Enchaînement  ---------- */
  /** La couleur de la dimension part de sa boule, inonde l'écran, puis s'efface dans le ciel. */
  function flood(color, x, y) {
    if (reduced) return;
    const el = document.createElement('i');
    el.className = 'dk-flood';
    el.style.background = color;
    veil.appendChild(el);
    const from = `${x}% ${y}%`;
    el.animate([{ clipPath: `circle(0% at ${from})` }, { clipPath: `circle(125% at ${from})` }], { duration: 680, easing: 'cubic-bezier(.77, 0, .175, 1)', fill: 'forwards' });
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, delay: 620, easing: 'ease', fill: 'forwards' }).onfinish = () => el.remove();
  }

  function show(id) {
    const s = byId.get(id);
    if (!s) return;
    const first = currentId === null;
    currentId = id;
    clearBeats();
    const old = layers.lastElementChild;
    if (old) {
      old.classList.add('is-out');
      setTimeout(() => old.remove(), 240);
    }
    pose(s.blobs);
    blobLayer.classList.toggle('is-mixing', s.view === 'mix');
    deck.style.setProperty('--sky', s.dim ? K.mix(dims[s.dim].color, '#FFFFFF', 0.25) : s.sky);
    if (s.dim) flood(dims[s.dim].color, s.blobs[s.dim].x, s.blobs[s.dim].y);
    (s.beats || []).forEach((b) => later(() => pose(b.blobs), b.at));

    const draw = () => {
      const layer = document.createElement('div');
      layer.className = 'dk-layer';
      layer.dataset.view = s.view;
      layer.innerHTML = VIEWS[s.view](s);
      layers.appendChild(layer);
      if (RUNS[s.view]) RUNS[s.view](s, layer);
    };
    if (reduced) draw();
    else later(draw, first ? 460 : 200);
  }

  function enter() {
    clearTimeout(closing);
    isOpen = true;
    currentId = null;
    layers.innerHTML = '';
    deck.hidden = false;
    deck.classList.add('is-still');
    pose(cornerPose());
    void deck.offsetWidth;
    deck.classList.remove('is-still');
    deck.classList.add('is-on');
    root.classList.add('is-deck');
  }

  /** Les boules rentrent dans leurs coins, le voile se lève et les avatars réapparaissent. */
  function leave() {
    isOpen = false;
    currentId = null;
    clearBeats();
    const old = layers.lastElementChild;
    if (old) old.classList.add('is-out');
    blobLayer.classList.remove('is-mixing');
    pose(cornerPose());
    deck.classList.remove('is-on');
    root.classList.remove('is-deck');
    if (!reduced) {
      stage.querySelectorAll('.lv-node .lv-ring').forEach((ring, i) => {
        ring.animate([{ opacity: 0, transform: 'scale(.72)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 460, delay: 500 + i * 16, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'backwards' });
      });
    }
    closing = setTimeout(() => {
      deck.hidden = true;
      layers.innerHTML = '';
    }, CLOSE_MS);
  }

  function paintProgress(v) {
    pillText.textContent = `${v.index + 1} / ${v.total}`;
    pillFill.style.transform = `scaleX(${(v.index + 1) / v.total})`;
  }

  /* ----------  Commandes de l'admin  ---------- */
  /* Rien ne défile tout seul : seules les flèches et la télécommande changent de diapositive. */
  let view = { active: false };

  async function send(action) {
    let ok = false;
    try {
      const res = await fetch('/admin/live/deck', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      ok = res.ok && !res.redirected;
    } catch (e) { /* signalé ci-dessous */ }
    if (!ok) window.alert('La commande n\'a pas abouti. Recharge la page et réessaie.');
  }

  /* Sur la page admin, et sur la carte publique ouverte dans un navigateur connecté en admin. */
  if (root.dataset.kiosk !== '1' || root.dataset.presenter === '1') {
    document.addEventListener('keydown', (ev) => {
      if (!view.active || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey || ev.target.closest('input, textarea, select')) return;
      if (ev.key === 'ArrowRight') send('next');
      else if (ev.key === 'ArrowLeft') send('prev');
    });
  }

  function remote() {
    const startBtn = document.getElementById('dk-start');
    const box = document.getElementById('dk-remote');
    if (!startBtn || !box) return () => {};
    const where = document.getElementById('dk-where');
    startBtn.addEventListener('click', () => send('start'));
    document.getElementById('dk-prev').addEventListener('click', () => send('prev'));
    document.getElementById('dk-next').addEventListener('click', () => send('next'));
    document.getElementById('dk-stop').addEventListener('click', () => send('stop'));

    return (v) => {
      box.hidden = !v.active;
      startBtn.hidden = v.active;
      if (v.active) where.textContent = `${v.index + 1} / ${v.total} · ${byId.get(v.id).label}`;
    };
  }
  const paintRemote = remote();

  window.LiveDeck = {
    snapshot(next) { snap = next; },
    update(v) {
      view = v;
      paintRemote(v);
      if (!v.active) {
        if (isOpen) leave();
        return;
      }
      if (!isOpen) enter();
      if (v.id !== currentId) show(v.id);
      paintProgress(v);
    },
  };
}());
