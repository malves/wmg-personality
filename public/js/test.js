/**
 * Déroulé du test côté client : intro → consentement → blocs (le plus / le moins) → analyse → résultat.
 * S'appuie sur l'API JSON /api/test/* et sur AvatarKit pour l'avatar et les blobs.
 */
(function () {
  'use strict';
  const K = window.AvatarKit;
  const root = document.getElementById('test');
  if (!root || !K) return;

  let state = null;        // réponse de /api/test/state
  let blocks = [];
  let answers = {};
  let idx = 0;
  let currentEmotion = null;
  let saving = false;
  let picked = { most: null, least: null };
  let lastEmotion = null;
  let timers = [];
  let lastStep = null;

  /* Visage du petit blob qui marque un choix : sourire pour « le plus », moue pour « le moins ». */
  const MARK_FACE = '<svg viewBox="0 0 32 32"><ellipse cx="11.5" cy="13" rx="2" ry="2.6"/><ellipse cx="20.5" cy="13" rx="2" ry="2.6"/><path class="f-smile" d="M10.5 19.5c2.8 3.4 8.2 3.4 11 0"/><path class="f-frown" d="M10.5 22.5c2.8-3.4 8.2-3.4 11 0"/></svg>';

  /* ----------  Utilitaires  ---------- */
  function api(url, body) {
    return fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(data.error || 'Erreur réseau'); e.status = r.status; e.data = data; throw e; }
      return data;
    });
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function motionOK() { return !reducedMotion.matches; }
  /** Relance une animation CSS portée par une classe. */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function render(html) {
    clearTimers();
    root.innerHTML = html;
    root.style.animation = 'none';
    void root.offsetWidth; // relance l'animation d'entrée
    root.style.animation = '';
    root.scrollTop = 0;
    const screen = document.getElementById('screen');
    if (screen) screen.scrollTop = 0;
  }
  function pickEmotion() {
    const list = K.EMOTIONS.filter((e) => e !== lastEmotion);
    lastEmotion = list[Math.floor(Math.random() * list.length)];
    return lastEmotion;
  }
  function viewfinder(expression, emotion) {
    return `<div class="viewfinder${emotion ? ' has-tint' : ''}" id="vf" style="--tint:${emotion ? emotion.color : '#fff'};--tint-ink:${emotion ? K.darken(emotion.color, 0.58) : '#1C1D22'}">
      <div class="vf-avatar" id="vf-avatar">${K.renderAvatar(state.avatar, { expression })}</div>
      <div class="vf-tint"></div><div class="vf-glow"></div><i class="vf-scan"></i>
      <div class="vf-name">${esc(state.firstName)}</div>
      <svg class="vf-target" viewBox="0 0 32 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="#fff" stroke-width="3"/><path d="M 13 7 L 29 5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>
      <i class="vf-corner tl"></i><i class="vf-corner tr"></i><i class="vf-corner bl"></i><i class="vf-corner br"></i>
      ${emotion ? `<div class="vf-label"><small>Je détecte</small><strong>${esc(emotion.label)}</strong></div>` : ''}
    </div>`;
  }
  function setExpression(expression) {
    const el = document.getElementById('vf-avatar');
    if (el) el.innerHTML = K.renderAvatar(state.avatar, { expression });
  }
  /** Change d'expression avec un léger rebond, pour que l'avatar réagisse au clic. */
  function react(expression) {
    setExpression(expression);
    const el = document.getElementById('vf-avatar');
    if (el && motionOK() && el.animate) {
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    }
  }
  function peek(a, b) {
    return `<div class="peek" aria-hidden="true">${K.renderBlob({ color: a.color, face: a.face, className: 'pk-1' })}${K.renderBlob({ color: b.color, face: b.face, className: 'pk-2' })}</div>`;
  }
  function wave() {
    const p = 'M0 30 C 12 30 18 22 26 26 S 40 44 50 30 S 62 6 72 22 S 86 54 96 30 S 108 10 118 26 S 132 40 142 30 S 154 18 166 24 S 180 42 190 30 S 206 26 230 30';
    return `<svg class="wave" viewBox="0 0 230 56" aria-hidden="true"><g><path d="${p}"/><path d="${p}" transform="translate(230 0)"/></g></svg>`;
  }
  function emotionByKey(key) { return K.EMOTIONS.find((e) => e.key === key) || K.EMOTIONS[0]; }

  /* ----------  Écrans  ---------- */
  function screenIntro() {
    const n = state.blockCount;
    const e1 = emotionByKey('joie');
    const e2 = emotionByKey('curiosite');
    render(`
      <h2 class="screen-title">Analyse en cours…</h2>
      ${peek(e1, e2)}
      ${viewfinder('neutral', null)}
      <p class="intro-text"><b>Je scanne ton profil…</b> enfin presque. Tu vas voir ${n} séries de 4 mots : choisis celui qui te ressemble <b>le plus</b> et celui qui te ressemble <b>le moins</b>. Prêt&nbsp;?</p>
      ${wave()}
      <div class="test-footer">
        <a class="link-btn" href="/">Plus tard</a>
        <div class="pill rec"><i></i><span id="rec-time">00:00</span></div>
        <button class="link-btn" id="go" style="color:#1C1D22">C'est parti</button>
      </div>`);
    let sec = 0;
    const tick = () => {
      sec += 1;
      const el = document.getElementById('rec-time');
      if (!el) return;
      el.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      later(tick, 1000);
    };
    later(tick, 1000);
    const faces = ['neutral', 'thinking', 'joy', 'surprise', 'wink'];
    let f = 0;
    const cycle = () => { f = (f + 1) % faces.length; setExpression(faces[f]); later(cycle, 2200); };
    later(cycle, 2200);
    document.getElementById('go').addEventListener('click', screenConsent);
  }

  function screenConsent() {
    const paragraphs = String(state.consentText || '').split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    render(`
      <h2 class="screen-title">Avant de commencer</h2>
      <div class="consent-box">${paragraphs || '<p>Aucun texte de consentement.</p>'}</div>
      <label class="check"><input type="checkbox" id="consent"> J'ai lu et j'accepte.</label>
      <div class="test-footer" style="margin-top:16px">
        <button class="link-btn" id="back">Retour</button>
        <button class="btn btn-primary" id="start" disabled>Je commence</button>
      </div>`);
    const cb = document.getElementById('consent');
    const start = document.getElementById('start');
    cb.addEventListener('change', () => { start.disabled = !cb.checked; });
    document.getElementById('back').addEventListener('click', screenIntro);
    start.addEventListener('click', () => {
      start.disabled = true;
      api('/api/test/start', { consent: true }).then((s) => {
        state = { ...state, ...s };
        blocks = s.blocks || [];
        answers = s.answers || {};
        idx = 0;
        screenBlock();
      }).catch((e) => { alert(e.message); start.disabled = false; });
    });
  }

  function firstUnanswered() {
    const i = blocks.findIndex((b) => !answers[b.id]);
    return i < 0 ? blocks.length : i;
  }

  /* Enveloppe stable du test : le viseur et le pied de page restent en place d'un bloc à l'autre. */
  function blockShell(emotion, peekA, peekB) {
    return `
      <div class="q-progress" aria-hidden="true"><i id="q-bar"></i></div>
      <div id="peek-wrap">${peek(peekA, peekB)}</div>
      ${viewfinder(emotion.expression, emotion)}
      <div class="block-panel" id="block-panel"></div>
      <div class="test-footer test-footer--block">
        <button class="link-btn" id="back">Retour</button>
        <div class="pill" id="q-count"></div>
        <div class="footer-next">
          ${state.allowSkip ? '<button class="link-btn" id="skip">Passer</button>' : ''}
          <button class="btn btn-primary btn-next" id="next" disabled><span id="next-label">Suivant</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>
        </div>
      </div>`;
  }

  function bindFooter() {
    document.getElementById('back').addEventListener('click', () => {
      if (saving || idx === 0) return;
      idx -= 1;
      screenBlock(-1);
    });
    document.getElementById('next').addEventListener('click', submitBlock);
    const skip = document.getElementById('skip');
    if (!skip) return;
    skip.addEventListener('click', () => {
      if (saving) return;
      saving = true;
      const block = blocks[idx];
      api('/api/test/answer', { blockId: block.id, skipped: true }).then(() => {
        answers[block.id] = { skipped: true };
        idx += 1;
        screenBlock(1);
      }).catch(handleAnswerError);
    });
  }

  function screenBlock(dir) {
    if (!blocks.length) { render('<p class="lead center">Aucune question disponible pour le moment.</p><a class="btn btn-secondary btn-block" href="/">Retour</a>'); return; }
    if (idx >= blocks.length) { finish(); return; }
    const panel = document.getElementById('block-panel');
    if (panel && motionOK()) {
      saving = true;
      panel.style.setProperty('--dir', dir || 1);
      panel.classList.add('is-leaving');
      later(() => showBlock(dir), 130);
      return;
    }
    showBlock(dir);
  }

  function showBlock(dir) {
    const block = blocks[idx];
    const emotion = pickEmotion();
    currentEmotion = emotion;
    lastStep = null;
    const prev = answers[block.id];
    picked = { most: prev && !prev.skipped ? prev.mostItemId : null, least: prev && !prev.skipped ? prev.leastItemId : null };
    const peekA = K.EMOTIONS[(K.EMOTIONS.indexOf(emotion) + 3) % K.EMOTIONS.length];
    const peekB = K.EMOTIONS[(K.EMOTIONS.indexOf(emotion) + 6) % K.EMOTIONS.length];

    if (document.getElementById('block-panel')) {
      const vf = document.getElementById('vf');
      vf.style.setProperty('--tint', emotion.color);
      vf.style.setProperty('--tint-ink', K.darken(emotion.color, 0.58));
      vf.querySelector('.vf-label strong').textContent = emotion.label;
      replay(vf.querySelector('.vf-label'), 'is-swapping');
      document.getElementById('peek-wrap').innerHTML = peek(peekA, peekB);
      react(emotion.expression);
    } else {
      render(blockShell(emotion, peekA, peekB));
      bindFooter();
    }
    replay(document.getElementById('vf'), 'is-scanning');

    const panel = document.getElementById('block-panel');
    panel.classList.remove('is-leaving');
    panel.style.setProperty('--dir', dir || 1);
    panel.innerHTML = `
      <p class="q-text" id="q-text"></p>
      <div class="choices" id="choices">
        ${block.items.map((it, i) => `<button type="button" class="choice" style="--i:${i}" data-id="${it.id}"><span class="mark" aria-hidden="true">${MARK_FACE}</span><span class="choice-text">${esc(it.text)}</span><span class="tag"></span></button>`).join('')}
      </div>`;
    document.getElementById('choices').addEventListener('click', onChoice);
    document.getElementById('q-bar').style.transform = `scaleX(${(idx + 1) / blocks.length})`;
    document.getElementById('q-count').textContent = `${idx + 1} / ${blocks.length}`;
    document.getElementById('next-label').textContent = idx === blocks.length - 1 ? 'Terminer' : 'Suivant';
    document.getElementById('back').disabled = idx === 0;
    const screen = document.getElementById('screen');
    if (screen) screen.scrollTop = 0;
    saving = false;
    paint();
  }

  /** Ce qu'il reste à faire sur le bloc : 'most', 'least' ou 'done'. */
  function stepOf() {
    if (picked.most == null) return 'most';
    if (picked.least == null) return 'least';
    return 'done';
  }

  function paint() {
    const step = stepOf();
    if (step !== lastStep) {
      const q = document.getElementById('q-text');
      if (step === 'most') q.innerHTML = '<b>Ce qui te ressemble</b> <span class="q-step is-most">le plus</span>';
      else if (step === 'least') q.innerHTML = '<b>Ce qui te ressemble</b> <span class="q-step is-least">le moins</span>';
      else q.innerHTML = '<span class="q-done"><b>C\'est noté !</b> Reclique pour modifier.</span>';
    }
    document.querySelectorAll('.choice').forEach((el) => {
      const id = Number(el.dataset.id);
      el.classList.toggle('is-most', id === picked.most);
      el.classList.toggle('is-least', id === picked.least);
      el.setAttribute('aria-pressed', String(id === picked.most || id === picked.least));
      el.querySelector('.tag').textContent = id === picked.most ? '+ le plus' : id === picked.least ? '− le moins' : '';
    });
    const done = step === 'done';
    document.getElementById('choices').classList.toggle('is-done', done);
    const next = document.getElementById('next');
    const skip = document.getElementById('skip');
    next.hidden = !!skip && !done;
    next.disabled = !done || saving;
    if (skip) skip.hidden = done;
    if (done && lastStep && lastStep !== 'done') replay(next, 'is-ready');
    lastStep = step;
  }

  /* Un clic sur un choix déjà pris l'annule. Sinon il remplit « le plus », puis « le moins ». */
  function onChoice(ev) {
    const btn = ev.target.closest('.choice');
    if (!btn || saving) return;
    const id = Number(btn.dataset.id);
    if (id === picked.most) {
      picked.most = null;
      react(currentEmotion.expression);
    } else if (id === picked.least) {
      picked.least = null;
      react(currentEmotion.expression);
    } else if (picked.most == null) {
      picked.most = id;
      react('joy');
    } else {
      picked.least = id;
      react('doubt');
    }
    paint();
  }

  function submitBlock() {
    const block = blocks[idx];
    if (saving || stepOf() !== 'done') return;
    saving = true;
    paint();
    api('/api/test/answer', { blockId: block.id, mostItemId: picked.most, leastItemId: picked.least }).then(() => {
      answers[block.id] = { mostItemId: picked.most, leastItemId: picked.least, skipped: false };
      idx += 1;
      screenBlock(1);
    }).catch(handleAnswerError);
  }

  function handleAnswerError(e) {
    saving = false;
    if (e.data && e.data.reload) { window.location.reload(); return; }
    if (e.status === 409) { window.location.href = '/result'; return; }
    alert(e.message);
    paint();
  }

  function finish() {
    const steps = ['Lecture de tes réponses…', 'Calcul des 4 dimensions…', 'Recherche de ton profil…', 'C\'est prêt !'];
    render(`
      <h2 class="screen-title">Analyse en cours…</h2>
      ${viewfinder('thinking', null)}
      <div class="analyzing">
        ${wave()}
        <div class="progress"><i id="bar"></i></div>
        <p class="status" id="status">${steps[0]}</p>
      </div>`);
    const faces = ['thinking', 'surprise', 'joy', 'proud'];
    steps.forEach((s, i) => later(() => {
      const st = document.getElementById('status'); if (st) st.textContent = s;
      const bar = document.getElementById('bar'); if (bar) bar.style.width = `${Math.round(((i + 1) / steps.length) * 100)}%`;
      setExpression(faces[i]);
    }, i * 750));
    api('/api/test/finish', {}).then(() => {
      later(() => { window.location.href = '/result'; }, steps.length * 750 + 500);
    }).catch((e) => {
      if (e.status === 409) { window.location.href = '/result'; return; }
      if (e.data && Array.isArray(e.data.missing) && e.data.missing.length) {
        const i = blocks.findIndex((b) => b.id === e.data.missing[0]);
        idx = i < 0 ? 0 : i;
        alert('Il reste des questions sans réponse, on y retourne.');
        screenBlock();
        return;
      }
      alert(e.message);
      screenBlock();
    });
  }

  /* Entrée valide le bloc complet. Avant cela, elle ne doit pas retirer un choix par mégarde. */
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.repeat || !document.getElementById('block-panel')) return;
    if (ev.target.closest('#back, #skip')) return;
    if (stepOf() === 'done') {
      ev.preventDefault();
      submitBlock();
      return;
    }
    const card = ev.target.closest('.choice');
    if (card && (card.classList.contains('is-most') || card.classList.contains('is-least'))) ev.preventDefault();
  });

  /* ----------  Démarrage  ---------- */
  api('/api/test/state').then((s) => {
    state = s;
    if (s.status === 'completed') { window.location.href = '/result'; return; }
    if (s.status === 'in_progress') {
      blocks = s.blocks || [];
      answers = s.answers || {};
      idx = firstUnanswered();
      screenBlock();
      return;
    }
    screenIntro();
  }).catch((e) => {
    render(`<p class="lead center">${esc(e.message)}</p><a class="btn btn-secondary btn-block" href="/">Retour</a>`);
  });
}());
