/**
 * Builder d'avatar (admin) : contrôles générés depuis AvatarKit.SCHEMA et rangés par onglets (AvatarKit.GROUPS),
 * aperçu en direct, couleur libre sur chaque palette, annulation, mélange d'un onglet, enregistrement en JSON.
 */
(function () {
  'use strict';
  const K = window.AvatarKit;
  const el = document.getElementById('builder');
  if (!el || !K) return;

  let cfg = K.normalizeConfig(JSON.parse(el.dataset.config || '{}'));
  const saveUrl = el.dataset.saveUrl;
  const tabs = document.getElementById('tabs');
  const controls = document.getElementById('controls');
  const preview = document.getElementById('preview');
  const exprSel = document.getElementById('expression');
  const status = document.getElementById('status');
  const undoBtn = document.getElementById('undo');
  const history = [];
  let dirty = false;
  let group = K.GROUPS[0].key;
  try { if (K.GROUPS.some((g) => g.key === localStorage.getItem('bd-tab'))) group = localStorage.getItem('bd-tab'); } catch (e) { /* stockage indisponible */ }

  const fieldsOf = (g) => K.SCHEMA.filter((f) => f.group === g);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function drawPreview() {
    preview.innerHTML = K.renderAvatar(cfg, { expression: exprSel.value });
  }

  function thumb(field, value) {
    const c = { ...cfg, [field.key]: value };
    /* Les vignettes zoomées visent la tête à sa place normale : un personnage tout petit ou très grand la ferait sortir du cadre. */
    if (field.zoom && (c.body === 'tiny' || c.body === 'giant')) c.body = 'medium';
    const bg = field.group === 'bg';
    return K.renderAvatar(c, { expression: 'neutral', background: bg, size: 72, viewBox: field.zoom });
  }

  /* ----------  Modifications  ---------- */
  function commit(next, { rebuild = false } = {}) {
    history.push(cfg);
    if (history.length > 60) history.shift();
    cfg = K.normalizeConfig(next);
    dirty = true;
    status.textContent = '';
    undoBtn.disabled = false;
    drawPreview();
    if (rebuild) buildControls();
    else refreshControls();
  }

  function undo() {
    if (!history.length) return;
    cfg = history.pop();
    dirty = true;
    undoBtn.disabled = !history.length;
    drawPreview();
    buildControls();
  }

  /* ----------  Contrôles  ---------- */
  function swatchButton(field, color, active) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (active ? ' is-active' : '');
    b.style.setProperty('--c', color);
    const name = color === K.SALT_PEPPER ? 'Poivre et sel' : color === K.ITALIA ? 'Italie' : color;
    if (color === K.SALT_PEPPER) b.classList.add('is-saltpepper');
    if (color === K.ITALIA) b.classList.add('is-italia');
    b.title = name;
    b.setAttribute('aria-label', `${field.label} ${name}`);
    b.dataset.value = color;
    return b;
  }

  /** Pastille « autre couleur » : ouvre le sélecteur natif, et garde la couleur choisie hors palette. */
  function customSwatch(field) {
    const inPalette = field.options.includes(cfg[field.key]);
    const wrap = document.createElement('label');
    wrap.className = 'swatch is-custom' + (inPalette ? '' : ' is-active');
    wrap.title = 'Autre couleur';
    if (!inPalette) wrap.style.setProperty('--c', cfg[field.key]);
    wrap.innerHTML = `<input type="color" value="${inPalette ? '#888888' : cfg[field.key]}" aria-label="${esc(field.label)} : autre couleur">`;
    const input = wrap.querySelector('input');
    let pending = null;
    input.addEventListener('input', () => {
      // Le sélecteur envoie une rafale de valeurs : une seule entrée d'historique par choix.
      const value = input.value.toUpperCase();
      if (pending === null) history.push(cfg);
      pending = value;
      cfg = K.normalizeConfig({ ...cfg, [field.key]: value });
      dirty = true;
      undoBtn.disabled = false;
      drawPreview();
      wrap.style.setProperty('--c', value);
      for (const sib of wrap.parentNode.children) sib.classList.toggle('is-active', sib === wrap);
    });
    input.addEventListener('change', () => { pending = null; refreshControls(field.key); });
    return wrap;
  }

  function buildField(field) {
    const section = document.createElement('section');
    section.className = 'ctrl-group';
    section.innerHTML = `<h3>${esc(field.label)}</h3><div class="ctrl-options" data-key="${field.key}"></div>`;
    const box = section.querySelector('.ctrl-options');
    if (field.type === 'color') {
      for (const color of field.options) box.appendChild(swatchButton(field, color, cfg[field.key] === color));
      box.appendChild(customSwatch(field));
    } else if (field.type === 'tint') {
      for (const opt of field.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tint' + (cfg[field.key] === opt.v ? ' is-active' : '');
        b.dataset.value = opt.v;
        b.innerHTML = `<i class="${opt.c ? '' : 'is-none'}" style="--c:${opt.c || '#fff'}"></i><span>${esc(opt.l)}</span>`;
        box.appendChild(b);
      }
    } else {
      for (const opt of field.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opt' + (cfg[field.key] === opt.v ? ' is-active' : '');
        b.dataset.value = opt.v;
        b.innerHTML = `${thumb(field, opt.v)}<span>${esc(opt.l)}</span>`;
        box.appendChild(b);
      }
    }
    box.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-value]');
      if (!btn || btn.dataset.value === cfg[field.key]) return;
      commit({ ...cfg, [field.key]: btn.dataset.value });
    });
    return section;
  }

  function buildTabs() {
    tabs.innerHTML = '';
    for (const g of K.GROUPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bd-tab' + (g.key === group ? ' is-active' : '');
      b.textContent = g.label;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(g.key === group));
      b.addEventListener('click', () => {
        group = g.key;
        try { localStorage.setItem('bd-tab', group); } catch (e) { /* stockage indisponible */ }
        buildTabs();
        buildControls();
      });
      tabs.appendChild(b);
    }
  }

  function buildControls() {
    controls.innerHTML = '';
    for (const field of fieldsOf(group)) controls.appendChild(buildField(field));
    document.getElementById('shuffle').textContent = `Mélanger « ${K.GROUPS.find((g) => g.key === group).label} »`;
  }

  /* Après un changement, l'onglet courant est remis à jour : états actifs tout de suite, vignettes un peu après. */
  let thumbTimer = null;
  function refreshControls(skipKey) {
    for (const field of fieldsOf(group)) {
      const box = controls.querySelector(`.ctrl-options[data-key="${field.key}"]`);
      if (!box) continue;
      const inPalette = field.type !== 'color' || field.options.includes(cfg[field.key]);
      for (const child of box.children) {
        if (child.classList.contains('is-custom')) {
          child.classList.toggle('is-active', !inPalette);
          if (!inPalette) child.style.setProperty('--c', cfg[field.key]);
        } else child.classList.toggle('is-active', child.dataset.value === cfg[field.key]);
      }
    }
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => {
      for (const field of fieldsOf(group)) {
        if (field.type !== 'choice' || field.key === skipKey) continue;
        const box = controls.querySelector(`.ctrl-options[data-key="${field.key}"]`);
        if (!box) continue;
        for (const btn of box.children) btn.firstElementChild.outerHTML = thumb(field, btn.dataset.value);
      }
    }, 120);
  }

  /* ----------  Actions  ---------- */
  document.getElementById('random').addEventListener('click', () => commit(K.randomConfig(), { rebuild: true }));
  document.getElementById('shuffle').addEventListener('click', () => commit(K.randomConfig(cfg, fieldsOf(group).map((f) => f.key)), { rebuild: true }));
  document.getElementById('reset').addEventListener('click', () => commit(K.DEFAULT_CONFIG, { rebuild: true }));
  undoBtn.addEventListener('click', undo);
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z' && !ev.target.closest('input, select, textarea')) {
      ev.preventDefault();
      undo();
    }
  });
  exprSel.addEventListener('change', drawPreview);
  document.getElementById('save').addEventListener('click', () => {
    status.textContent = 'Enregistrement…';
    status.classList.remove('err');
    fetch(saveUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ config: cfg }) })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Erreur ' + r.status)))
      .then(() => { dirty = false; status.textContent = 'Avatar enregistré ✓'; })
      .catch((e) => { status.textContent = 'Échec : ' + e.message; status.classList.add('err'); });
  });
  window.addEventListener('beforeunload', (ev) => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });

  undoBtn.disabled = true;
  buildTabs();
  buildControls();
  drawPreview();
}());
