/**
 * Page « En direct » : reçoit l'état du test par Server-Sent Events et anime la carte.
 * Chaque personne part du centre et glisse vers sa zone DISC à mesure qu'elle répond,
 * tandis que les groupes calculés par le serveur se resserrent et s'entourent d'un halo.
 *
 * Fluidité : les cibles sont calculées sans chevauchement et rafraîchies à intervalle régulier, donc
 * rien ne pousse les pastilles au repos. Elles rejoignent leur cible par un ressort amorti, et un halo
 * survit aux changements de membres : il garde son identité, et n'englobe une personne qu'à son arrivée.
 */
(function () {
  'use strict';
  const K = window.AvatarKit;
  const root = document.getElementById('live');
  if (!root || !K) return;

  const $ = (id) => document.getElementById(id);
  const stage = $('lv-stage');
  const hullLayer = $('lv-hulls');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const kiosk = root.dataset.kiosk === '1';
  const DIM_COLORS = { D: '#F07A6E', I: '#F6C644', S: '#7CD39A', C: '#6EC1F5' };
  const DIM_INK = { D: '#D5493E', I: '#B8860B', S: '#2F8F56', C: '#2F7FC1' };
  const NEUTRAL = '#B7A6E8';
  const STATE_LABELS = { connecting: 'Connexion…', idle: 'En attente', live: 'En direct', paused: 'En pause', final: 'Groupes définitifs', lost: 'Reconnexion…' };

  const LAYOUT_EVERY = 2200; // ms entre deux recalculs de la carte pendant le test
  const SPRING = 1.9; // raideur du ressort, en rad/s : une pastille arrive en 2 à 3 secondes

  const nodes = new Map();
  const hulls = new Set();
  const avatars = new Map();
  let snap = null;
  let W = 0;
  let H = 0;
  let R = 24;
  const BAND = 46; // bandes hautes et basses réservées aux libellés des zones
  let hideAnswers = false;
  let seenFeed = null;
  let zones = [];
  let TOP = BAND - 26; // sous cette limite, rien ne passe derrière le bandeau de la carte seule
  let centerOf = new Map();
  let layoutTimer = null;
  let lastLayout = 0;
  let lastFrame = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function avatarUrl(person, expression) {
    const key = `${JSON.stringify(person.avatar)}|${expression}`;
    if (!avatars.has(key)) avatars.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(K.renderAvatar(person.avatar, { expression, background: false }))}`);
    return avatars.get(key);
  }
  function fullName(p) { return `${p.firstName} ${p.lastName}`.trim(); }
  function groupColor(g) { return (g && DIM_COLORS[g.dim]) || NEUTRAL; }

  /* ----------  Nœuds  ---------- */
  function createNode(person) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lv-node';
    el.innerHTML = '<span class="lv-ring"><img alt=""></span><span class="lv-name"></span>';
    stage.appendChild(el);
    return { id: person.id, el, img: el.querySelector('img'), x: W / 2, y: H / 2, vx: 0, vy: 0, tx: W / 2, ty: H / 2, answered: person.answered };
  }

  function updateNode(n, p) {
    const group = snap.groups.find((g) => g.id === p.group);
    n.el.classList.toggle('is-done', p.status === 'done');
    n.el.classList.toggle('is-waiting', p.status === 'none');
    n.el.style.setProperty('--p', p.total ? p.answered / p.total : 0);
    n.el.style.setProperty('--ring', p.status === 'done' ? groupColor(group) : '#5DB5FF');
    n.el.title = p.scores
      ? `${fullName(p)} · ${p.answered} / ${p.total}\nD ${p.scores.D} · I ${p.scores.I} · S ${p.scores.S} · C ${p.scores.C}`
      : fullName(p);
    n.el.querySelector('.lv-name').textContent = p.firstName;
    const url = avatarUrl(p, p.status === 'done' ? 'joy' : 'neutral');
    if (n.img.getAttribute('src') !== url) n.img.src = url;
    if (p.answered > n.answered) {
      n.el.classList.remove('is-ping');
      void n.el.offsetWidth;
      n.el.classList.add('is-ping');
    }
    n.answered = p.answered;
  }

  /* ----------  Disposition  ---------- */
  function measureZones() {
    zones = [...stage.querySelectorAll('.lv-zone')].map((z) => ({
      x0: z.offsetLeft, y0: z.offsetTop, x1: z.offsetLeft + z.offsetWidth, y1: z.offsetTop + z.offsetHeight,
    }));
    const hud = stage.querySelector('.lv-hud');
    if (hud) TOP = hud.offsetTop + hud.offsetHeight + 8;
  }

  /** Écarte un disque des quatre coins, où sont posés les noms des dimensions. */
  function avoidZones(c, radius) {
    for (const z of zones) {
      const nx = Math.max(z.x0, Math.min(z.x1, c.x));
      const ny = Math.max(z.y0, Math.min(z.y1, c.y));
      const dx = c.x - nx;
      const dy = c.y - ny;
      const dist = Math.hypot(dx, dy);
      if (dist >= radius) continue;
      if (dist) {
        c.x = nx + (dx / dist) * radius;
        c.y = ny + (dy / dist) * radius;
      } else {
        // Centre à l'intérieur du coin : sortie par le bord intérieur le plus proche.
        const toX = c.x < W / 2 ? z.x1 + radius - c.x : z.x0 - radius - c.x;
        const toY = c.y < H / 2 ? z.y1 + radius - c.y : z.y0 - radius - c.y;
        if (Math.abs(toX) < Math.abs(toY)) c.x += toX;
        else c.y += toY;
      }
    }
  }

  /** Attribue chaque place à la personne la plus proche : un arrivant ne décale pas les autres. */
  function assignSlots(members, slots) {
    const pairs = [];
    members.forEach((p, i) => {
      const n = nodes.get(p.id);
      if (n) slots.forEach((s, j) => pairs.push({ i, j, n, d: Math.hypot(n.x - s.x, n.y - s.y) }));
    });
    pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
    const doneI = new Set();
    const doneJ = new Set();
    for (const { i, j, n } of pairs) {
      if (doneI.has(i) || doneJ.has(j)) continue;
      doneI.add(i);
      doneJ.add(j);
      n.tx = slots[j].x;
      n.ty = slots[j].y;
    }
  }

  function computeTargets() {
    if (!snap) return;
    const crowded = snap.people.length > 40;
    // Dans la page admin, la taille suit la place disponible pour que les groupes tiennent sur la carte.
    R = kiosk ? Math.max(20, Math.min(38, Math.round(Math.min(H / 26, W / 36) * (crowded ? 0.75 : 1)))) : Math.max(15, Math.min(24, Math.round(Math.sqrt((W * H) / Math.max(1, snap.people.length)) / 6.2)));
    root.style.setProperty('--r', `${R}px`);
    const cx = W / 2;
    const cy = H / 2;
    const rx = W / 2 - R - 26;
    const ry = H / 2 - R - BAND - 14;
    const baseOf = (p) => ({ x: cx + p.x * rx, y: cy + p.y * ry });
    const spacing = (R * 2.6 + 12) * 0.62; // laisse la place au prénom sous chaque avatar

    const centers = snap.groups.map((g) => {
      const members = g.members.map((id) => snap.people.find((p) => p.id === id)).filter(Boolean);
      const pts = members.map(baseOf);
      return {
        id: g.id,
        members,
        x: pts.reduce((a, q) => a + q.x, 0) / pts.length,
        y: pts.reduce((a, q) => a + q.y, 0) / pts.length,
        r: spacing * Math.sqrt(members.length) + R,
      };
    });
    // Les groupes s'écartent les uns des autres pour rester lisibles sur la carte.
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const a = centers[i];
          const b = centers[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          if (!dx && !dy) { dx = 1 + i; dy = 1 + j; }
          const dist = Math.hypot(dx, dy);
          const gap = a.r + b.r + 18 - dist;
          if (gap > 0) {
            const ux = (dx / dist) * gap * 0.5;
            const uy = (dy / dist) * gap * 0.5;
            a.x -= ux; a.y -= uy; b.x += ux; b.y += uy;
          }
        }
      }
      for (const c of centers) {
        avoidZones(c, c.r + 10);
        c.x = Math.max(c.r + 4, Math.min(W - c.r - 4, c.x));
        c.y = Math.max(c.r + TOP + 32, Math.min(H - c.r - BAND - 8, c.y));
      }
    }

    const grouped = new Set();
    centerOf = new Map();
    for (const c of centers) {
      centerOf.set(c.id, c);
      const count = c.members.length;
      const slots = c.members.map((p, i) => {
        grouped.add(p.id);
        const angle = i * 2.39996;
        const dist = spacing * Math.sqrt(i + (count > 1 ? 0.5 : 0));
        return { x: c.x + Math.cos(angle) * dist, y: c.y + Math.sin(angle) * dist };
      });
      assignSlots(c.members, slots);
    }

    // Les autres se répartissent sans se chevaucher : couronne d'attente, puis position DISC.
    const waiting = snap.people.filter((p) => p.status === 'none');
    const free = [];
    waiting.forEach((p, i) => {
      const n = nodes.get(p.id);
      if (!n) return;
      const angle = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / waiting.length;
      free.push({ n, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
    });
    for (const p of snap.people) {
      if (p.status === 'none' || grouped.has(p.id)) continue;
      const n = nodes.get(p.id);
      if (!n) continue;
      // Léger décalage propre à chacun : deux personnes au même point s'écartent toujours pareil.
      const b = baseOf(p);
      free.push({ n, x: b.x + Math.cos(p.id * 2.39996), y: b.y + Math.sin(p.id * 2.39996) });
    }
    const gap = R * 2.6 + 12;
    for (let it = 0; it < 50; it++) {
      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          const a = free[i];
          const b = free[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          if (dist >= gap) continue;
          const push = (gap - dist) * 0.5;
          a.x -= (dx / dist) * push; a.y -= (dy / dist) * push;
          b.x += (dx / dist) * push; b.y += (dy / dist) * push;
        }
      }
      for (const f of free) {
        for (const c of centers) {
          const dx = f.x - c.x;
          const dy = f.y - c.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const reach = c.r + R + 12;
          if (dist < reach) { f.x = c.x + (dx / dist) * reach; f.y = c.y + (dy / dist) * reach; }
        }
        avoidZones(f, R + 12);
        f.x = Math.max(R + 4, Math.min(W - R - 4, f.x));
        f.y = Math.max(R + TOP + 26, Math.min(H - R - BAND - 12, f.y));
      }
    }
    for (const f of free) { f.n.tx = f.x; f.n.ty = f.y; }
  }

  function hullOf(points) {
    const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (list) => {
      const out = [];
      for (const p of list) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };
    return half(pts).concat(half([...pts].reverse()));
  }

  function createHull(c) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hullLayer.appendChild(path);
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'lv-glabel';
    stage.appendChild(label);
    return { path, label, x: c.x, y: c.y, vx: 0, vy: 0, tx: c.x, ty: c.y, reach: c.r, members: new Set(), weights: new Map(), on: 0, name: '', labelW: 0, lx: null, ly: 0, exiting: false };
  }

  /** Relie chaque groupe reçu au halo qui partage le plus de membres avec lui. */
  function matchHulls() {
    const pairs = [];
    const live = [...hulls].filter((h) => !h.exiting);
    snap.groups.forEach((g, i) => {
      live.forEach((h, j) => {
        const shared = g.members.filter((id) => h.members.has(id)).length;
        if (shared) pairs.push({ i, j, shared });
      });
    });
    pairs.sort((a, b) => b.shared - a.shared || a.i - b.i || a.j - b.j);
    const hullOfGroup = new Map();
    const taken = new Set();
    for (const { i, j } of pairs) {
      if (hullOfGroup.has(i) || taken.has(j)) continue;
      hullOfGroup.set(i, live[j]);
      taken.add(j);
    }
    live.forEach((h, j) => { if (!taken.has(j)) { h.exiting = true; h.members = new Set(); } });
    return hullOfGroup;
  }

  function syncHulls() {
    const hullOfGroup = matchHulls();
    snap.groups.forEach((g, i) => {
      const c = centerOf.get(g.id);
      if (!c) return;
      let h = hullOfGroup.get(i);
      if (!h) {
        h = createHull(c);
        hulls.add(h);
        const open = () => openSheet(h);
        const hover = (on) => () => { h.hover = on; };
        for (const el of [h.path, h.label]) {
          el.addEventListener('click', open);
          el.addEventListener('mouseenter', hover(true));
          el.addEventListener('mouseleave', hover(false));
        }
      }
      h.group = g;
      h.tx = c.x;
      h.ty = c.y;
      h.reach = c.r + R * 2;
      h.members = new Set(g.members);
      for (const id of g.members) if (!h.weights.has(id)) h.weights.set(id, 0);
      const color = groupColor(g);
      h.path.style.fill = color;
      h.path.style.stroke = color;
      h.final = snap.state === 'final';
      h.label.textContent = `${g.label} · ${g.members.length}`;
      h.labelW = h.label.offsetWidth;
      if (h.name !== g.label) {
        if (h.name && !reduced) h.label.animate([{ filter: 'blur(3px)' }, { filter: 'blur(0)' }], { duration: 360, easing: 'ease-out' });
        h.name = g.label;
      }
    });
    if (sheetHull || sheetPerson) followSheet();
  }

  /** Un point sort du halo en glissant vers son centre, et n'y entre qu'une fois arrivé. */
  function hullPoints(h, ease) {
    const pts = [];
    for (const [id, w] of h.weights) {
      const n = nodes.get(id);
      if (!n) { h.weights.delete(id); continue; }
      const inside = h.members.has(id) && Math.hypot(n.x - h.x, n.y - h.y) < h.reach;
      const next = w + ((inside ? 1 : 0) - w) * ease;
      if (next < 0.01 && !h.members.has(id)) { h.weights.delete(id); continue; }
      h.weights.set(id, next);
      if (next > 0.01) pts.push({ x: h.x + (n.x - h.x) * next, y: h.y + (n.y - h.y) * next, full: next });
    }
    return pts;
  }

  function drawHulls(dt) {
    const ease = reduced ? 1 : 1 - Math.exp(-dt / 0.3);
    for (const h of hulls) {
      moveTowards(h, dt);
      const pts = hullPoints(h, ease);
      const shown = !h.exiting && pts.some((p) => p.full > 0.5);
      h.on += ((shown ? 1 : 0) - h.on) * ease;
      if (h.exiting && h.on < 0.02) {
        h.path.remove();
        h.label.remove();
        hulls.delete(h);
        continue;
      }
      if (!pts.length) {
        h.path.removeAttribute('d');
        h.label.style.opacity = 0;
        continue;
      }
      const hull = hullOf(pts);
      h.path.setAttribute('d', `M ${hull.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z`);
      h.path.style.strokeWidth = `${((R + 11) * 2 * h.on).toFixed(1)}px`;
      h.path.style.opacity = (h.final ? 0.4 : 0.24) * (h.hover ? 1.4 : 1) * h.on;
      const half = h.labelW / 2;
      const mid = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const lx = Math.max(half + 4, Math.min(W - half - 4, mid));
      const ly = Math.max(TOP, Math.min(...pts.map((p) => p.y)) - R - 30);
      if (h.lx === null) { h.lx = lx; h.ly = ly; }
      const glide = reduced ? 1 : 1 - Math.exp(-dt / 0.25);
      h.lx += (lx - h.lx) * glide;
      h.ly += (ly - h.ly) * glide;
      h.label.style.opacity = h.on;
      h.label.style.pointerEvents = h.on > 0.5 ? 'auto' : 'none';
      h.label.style.transform = `translate(${h.lx.toFixed(1)}px, ${h.ly.toFixed(1)}px) translateX(-50%)`;
    }
  }

  /* ----------  Animation  ---------- */
  /** Ressort amorti sans rebond, à vitesse plafonnée : un grand trajet reste lisible. */
  function moveTowards(n, dt) {
    if (reduced) { n.x = n.tx; n.y = n.ty; return; }
    n.vx += (SPRING * SPRING * (n.tx - n.x) - 2 * SPRING * n.vx) * dt;
    n.vy += (SPRING * SPRING * (n.ty - n.y) - 2 * SPRING * n.vy) * dt;
    const max = Math.max(W, H) * 0.2;
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > max) { n.vx *= max / speed; n.vy *= max / speed; }
    n.x += n.vx * dt;
    n.y += n.vy * dt;
  }

  function step(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    const list = [...nodes.values()];
    for (const n of list) moveTowards(n, dt);
    if (!reduced) {
      // Seules les pastilles qui se croisent en route se frôlent : au repos, les cibles sont espacées.
      const contact = R * 2.5;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const dx = b.x - a.x || 0.1 * (i - j);
          const dy = b.y - a.y || 0.1;
          const dist = Math.hypot(dx, dy);
          if (dist >= contact) continue;
          const push = (contact - dist) * 30 * dt;
          a.vx -= (dx / dist) * push; a.vy -= (dy / dist) * push;
          b.vx += (dx / dist) * push; b.vy += (dy / dist) * push;
        }
      }
    }
    for (const n of list) {
      n.el.style.transform = `translate(${n.x.toFixed(2)}px, ${n.y.toFixed(2)}px) translate(-50%, -50%)`;
    }
    drawHulls(dt);
    requestAnimationFrame(step);
  }

  /* ----------  Fiche d'un groupe  ---------- */
  /* Elle reste sur la carte : le groupe peut encore bouger derrière, et la fiche suit ses membres. */
  let sheetHull = null;
  let sheetPerson = null;
  let sheetDrawn = '';
  let sheetReturn = null;
  let guide = {};
  try { guide = JSON.parse($('lv-guide').textContent); } catch (e) { /* fiches sans repères */ }
  const sheet = document.createElement('div');
  sheet.className = 'lv-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'lv-sheet-title');
  stage.appendChild(sheet);

  function listOf(items) { return `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`; }

  function hullOfPerson(id) { return [...hulls].find((h) => !h.exiting && h.members.has(id)); }

  function sheetGroups() {
    return [...hulls].filter((h) => !h.exiting && h.group).sort((a, b) => b.group.members.length - a.group.members.length || a.group.id - b.group.id);
  }

  /** Personnes parcourues avec ‹ et › depuis la fiche d'une personne : celles de son groupe. */
  function sheetMembers() {
    const h = hullOfPerson(sheetPerson);
    return h ? h.group.members.filter((id) => snap.people.some((p) => p.id === id)) : [sheetPerson];
  }

  function guideBlocks(g2, addressTitle) {
    return `${g2.keywords.length ? `<p class="lv-sheet-words">${g2.keywords.map((k) => `<span>${esc(k)}</span>`).join('')}</p>` : ''}
      <div class="lv-sheet-grid">
        <section><h3>Points forts</h3>${listOf(g2.strengths)}</section>
        <section class="is-main"><h3>${esc(addressTitle)}</h3><p>${esc(g2.communication || '')}</p>${listOf(g2.howTo)}</section>
        <section><h3>À surveiller</h3>${listOf(g2.watchouts)}</section>
      </div>`;
  }

  function sheetFrame({ color, title, subtitle, tag, moves, body, animate }) {
    const focused = sheet.contains(document.activeElement) && (document.activeElement.dataset.move ? `[data-move="${document.activeElement.dataset.move}"]` : '[data-close]');
    sheet.style.setProperty('--c', color);
    sheet.classList.toggle('is-quiet', !animate);
    sheet.innerHTML = `<div class="lv-sheet-card">
      <header class="lv-sheet-head">
        <div class="lv-sheet-title">
          <h2 id="lv-sheet-title">${esc(title)}</h2>
          <p>${esc(subtitle)}</p>
        </div>
        ${tag}
        <div class="lv-sheet-nav">
          ${moves > 1 ? `<button type="button" data-move="-1" aria-label="Précédent">‹</button><button type="button" data-move="1" aria-label="Suivant">›</button>` : ''}
          <button type="button" data-close aria-label="Fermer">×</button>
        </div>
      </header>
      <div class="lv-sheet-body">${body}</div>
    </div>`;
    const target = focused && sheet.querySelector(focused);
    if (target) target.focus();
  }

  function drawGroupSheet(animate) {
    const g = sheetHull.group;
    const g2 = guide[g.key] || { strengths: [], watchouts: [], howTo: [], keywords: [] };
    const final = snap.state === 'final';
    const members = g.members.map((id) => snap.people.find((p) => p.id === id)).filter(Boolean);
    const signature = JSON.stringify([g.key, g.label, g.dim, final, members.map((p) => [p.id, p.status])]);
    if (signature === sheetDrawn) return;
    sheetDrawn = signature;
    sheetFrame({
      animate,
      color: groupColor(g),
      title: g.label,
      subtitle: g2.tagline || '',
      tag: `<span class="lv-tag${final ? ' is-final' : ''}">${final ? 'Définitif' : 'Provisoire'}</span>`,
      moves: sheetGroups().length,
      body: `<div class="lv-sheet-people${members.length > 9 ? ' is-many' : ''}" aria-label="${members.length} ${members.length > 1 ? 'personnes' : 'personne'}">
          ${members.map((p, i) => `<figure style="--i:${Math.min(i, 14)}"><button type="button" data-person="${p.id}" aria-label="Voir le profil de ${esc(p.firstName)}"><span class="lv-ring" style="--p:${p.total ? p.answered / p.total : 0};--ring:${groupColor(g)}"><img alt="" src="${avatarUrl(p, 'joy')}"></span></button><figcaption>${esc(p.firstName)}</figcaption></figure>`).join('')}
        </div>
        ${guideBlocks(g2, 'Comment s\'adresser à ce profil')}
        <p class="lv-sheet-note">Repères tirés du profil moyen du groupe. Clique sur un avatar pour voir le profil de la personne.</p>`,
    });
  }

  function drawPersonSheet(animate) {
    const p = snap.people.find((q) => q.id === sheetPerson);
    if (!p) { closeSheet(); return; }
    const done = p.status === 'done';
    const g2 = done ? guide[p.profileKey] : null;
    const h = hullOfPerson(p.id);
    const final = snap.state === 'final';
    const color = (g2 && DIM_COLORS[g2.dim]) || NEUTRAL;
    const signature = JSON.stringify(['p', p.id, p.status, p.answered, p.profileKey, h && h.group.label, sheetMembers().length]);
    if (signature === sheetDrawn) return;
    sheetDrawn = signature;
    const waiting = p.status === 'none'
      ? `${p.firstName} n'a pas encore commencé le test.`
      : `${p.firstName} passe le test : son profil s'affichera ici à la fin.`;
    sheetFrame({
      animate,
      color,
      title: p.firstName,
      subtitle: g2 ? [g2.name, g2.tagline].filter(Boolean).join(' · ') : (p.status === 'none' ? 'Pas encore commencé' : `Test en cours : ${p.answered} / ${p.total}`),
      tag: '',
      moves: sheetMembers().length,
      body: `<div class="lv-sheet-solo">
          <span class="lv-ring" style="--p:${p.total ? p.answered / p.total : 0};--ring:${color}"><img alt="" src="${avatarUrl(p, done ? 'joy' : 'neutral')}"></span>
          ${h ? `<button type="button" class="lv-sheet-chip" data-group>${final ? 'Groupe' : 'Groupe provisoire'} : ${esc(h.group.label)} ›</button>` : ''}
          ${kiosk ? '' : `<a class="lv-sheet-chip" href="/admin/users/${p.id}" target="_blank" rel="noopener">Fiche complète</a>`}
        </div>
        ${g2 ? `${guideBlocks(g2, `Comment s'adresser à ${p.firstName}`)}
        <p class="lv-sheet-note">Repères tirés du profil DISC de ${esc(p.firstName)} : un indicateur pour mieux travailler ensemble, pas une évaluation.</p>`
    : `<p class="lv-sheet-wait">${esc(waiting)}</p>`}`,
    });
  }

  function drawSheet(animate) {
    if (sheetPerson !== null) drawPersonSheet(animate);
    else drawGroupSheet(animate);
  }

  function showSheet(x, y, focusSelector) {
    sheetDrawn = '';
    sheet.style.setProperty('--ox', `${x.toFixed(0)}px`);
    sheet.style.setProperty('--oy', `${y.toFixed(0)}px`);
    sheet.classList.remove('is-closing');
    sheet.hidden = false;
    clearTimeout(sheet.closing);
    drawSheet(true);
    if (!sheetHull && sheetPerson === null) return;
    const focus = sheet.querySelector(focusSelector) || sheet.querySelector('[data-close]');
    if (focus) focus.focus();
  }

  function openSheet(h, moveBy) {
    if (!h || !h.group) return;
    const moved = !!sheetHull || sheetPerson !== null;
    if (!moved) sheetReturn = document.activeElement;
    sheetHull = h;
    sheetPerson = null;
    sheet.classList.toggle('is-moved', moved);
    showSheet(h.x, h.y, moveBy ? `[data-move="${moveBy}"]` : '[data-close]');
  }

  function openPerson(id, moveBy) {
    const n = nodes.get(id);
    const moved = !!sheetHull || sheetPerson !== null;
    if (!moved) sheetReturn = document.activeElement;
    sheetHull = null;
    sheetPerson = id;
    sheet.classList.toggle('is-moved', moved);
    showSheet(n ? n.x : W / 2, n ? n.y : H / 2, moveBy ? `[data-move="${moveBy}"]` : '[data-close]');
  }

  function closeSheet() {
    if (!sheetHull && sheetPerson === null) return;
    sheetHull = null;
    sheetPerson = null;
    const finish = () => { sheet.hidden = true; sheet.innerHTML = ''; };
    if (reduced) finish();
    else {
      sheet.classList.add('is-closing');
      sheet.closing = setTimeout(finish, 180);
    }
    if (sheetReturn && document.contains(sheetReturn)) sheetReturn.focus();
    sheetReturn = null;
  }

  function moveSheet(by) {
    if (sheetPerson !== null) {
      const list = sheetMembers();
      if (list.length > 1) openPerson(list[(list.indexOf(sheetPerson) + by + list.length) % list.length], by);
      return;
    }
    const list = sheetGroups();
    if (list.length > 1) openSheet(list[(list.indexOf(sheetHull) + by + list.length) % list.length], by);
  }

  /** Ce qui est affiché a pu changer : la fiche se met à jour, et se ferme si le groupe n'existe plus. */
  function followSheet() {
    if (sheetHull && (sheetHull.exiting || !hulls.has(sheetHull))) closeSheet();
    else drawSheet(false);
  }

  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet || ev.target.closest('[data-close]')) { closeSheet(); return; }
    const move = ev.target.closest('[data-move]');
    if (move) { moveSheet(Number(move.dataset.move)); return; }
    const person = ev.target.closest('[data-person]');
    if (person) { openPerson(Number(person.dataset.person)); return; }
    if (ev.target.closest('[data-group]')) openSheet(hullOfPerson(sheetPerson));
  });
  document.addEventListener('keydown', (ev) => {
    if (!sheetHull && sheetPerson === null) return;
    if (ev.key === 'Escape') { ev.preventDefault(); closeSheet(); }
    else if (ev.key === 'ArrowLeft') moveSheet(-1);
    else if (ev.key === 'ArrowRight') moveSheet(1);
    else if (ev.key === 'Tab') {
      const stops = [...sheet.querySelectorAll('button, a')];
      const at = stops.indexOf(document.activeElement);
      ev.preventDefault();
      stops[(at + (ev.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
    }
  });
  stage.addEventListener('click', (ev) => {
    const el = ev.target.closest('.lv-node');
    if (!el) return;
    const node = [...nodes.values()].find((n) => n.el === el);
    if (node) openPerson(node.id);
  });

  /* ----------  Panneaux  ---------- */
  function renderGroups() {
    const title = $('lv-groups-title');
    title.textContent = snap.state === 'final' ? 'Groupes définitifs' : 'Groupes en formation';
    const final = snap.state === 'final';
    const box = $('lv-groups');
    const cards = snap.groups.map((g) => {
      const members = g.members.map((id) => snap.people.find((p) => p.id === id)).filter(Boolean);
      const bars = ['D', 'I', 'S', 'C'].map((d) => `<span class="lv-mini" title="${d} ${g.mean[d]}"><i style="height:${g.mean[d]}%;background:${DIM_INK[d]}"></i><em>${d}</em></span>`).join('');
      return `<article class="lv-group" style="--c:${groupColor(g)}">
        <div class="lv-group-top"><h3><button type="button" data-open-group="${g.members[0]}">${esc(g.label)}</button></h3><span class="lv-tag${final ? ' is-final' : ''}">${final ? 'Définitif' : 'Provisoire'}</span></div>
        <div class="lv-group-body"><p>${members.map((m) => esc(m.firstName)).join(', ')}</p><div class="lv-minis">${bars}</div></div>
      </article>`;
    }).join('');
    const alone = snap.alone.map((id) => snap.people.find((p) => p.id === id)).filter(Boolean);
    const forming = snap.people.filter((p) => p.status !== 'none' && !p.group && !snap.alone.includes(p.id));
    const notes = [];
    if (alone.length) notes.push(`<p class="lv-note"><b>Profils à part :</b> ${alone.map((p) => esc(p.firstName)).join(', ')}</p>`);
    if (forming.length) notes.push(`<p class="lv-note"><b>Trop tôt pour les placer :</b> ${forming.map((p) => esc(p.firstName)).join(', ')}</p>`);
    const html = cards + notes.join('') || '<p class="lv-note">Les groupes apparaîtront après les premières réponses.</p>';
    if (html !== box.dataset.html) { box.innerHTML = html; box.dataset.html = html; }
  }

  function timeLabel(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function renderFeed() {
    const key = (f) => `${f.userId}|${f.at}`;
    const known = seenFeed;
    const html = snap.feed.map((f) => {
      const detail = f.skipped ? '<span class="muted">a passé la question</span>'
        : hideAnswers ? '<span class="muted">a répondu</span>'
          : `<span class="lv-plus">+ ${esc(f.most)}</span><span class="lv-minus">− ${esc(f.least)}</span>`;
      return `<div class="lv-line${known && !known.has(key(f)) ? ' is-new' : ''}"><div><b>${esc(f.name)}</b><time>${timeLabel(f.at)}</time></div><div class="lv-line-detail">${detail}</div></div>`;
    }).join('');
    $('lv-feed').innerHTML = html || '<p class="lv-note">Aucune réponse pour le moment.</p>';
    seenFeed = new Set(snap.feed.map(key));
  }

  function renderTray() {
    const waiting = snap.people.filter((p) => p.status === 'none');
    $('lv-tray-box').hidden = !waiting.length;
    $('lv-tray').innerHTML = waiting.map((p) => `<span class="lv-wait" title="${esc(fullName(p))}"><img alt="" src="${avatarUrl(p, 'neutral')}"><em>${esc(p.firstName)}</em></span>`).join('');
  }

  function renderScreenHead() {
    const c = snap.counts;
    const n = snap.groups.length;
    const blocks = Math.max(0, ...snap.people.map((p) => p.total));
    const answered = snap.people.reduce((sum, p) => sum + p.answered, 0);
    $('k-bar').style.transform = `scaleX(${blocks && c.total ? answered / (blocks * c.total) : 0})`;
    setState(snap.state);
    $('lv-hud-text').textContent = snap.state === 'final'
      ? `${n} ${n > 1 ? 'groupes' : 'groupe'}`
      : `${c.done} / ${c.total} ont terminé`;
  }

  function renderHead() {
    const c = snap.counts;
    $('k-progress').textContent = c.inProgress;
    $('k-done').textContent = c.done;
    $('k-wait').textContent = c.notStarted;
    $('k-groups').textContent = snap.groups.length;
    $('k-answers').textContent = `${c.answers} / ${c.expected}`;
    $('k-bar').style.transform = `scaleX(${c.expected ? c.answers / c.expected : 0})`;
    setState(snap.state);
    const sub = {
      idle: 'Le test n\'a pas encore commencé.',
      live: `${c.inProgress} ${c.inProgress > 1 ? 'personnes répondent' : 'personne répond'} en ce moment.`,
      paused: `Personne ne répond en ce moment. ${c.notStarted} ${c.notStarted > 1 ? 'personnes n\'ont' : 'personne n\'a'} pas encore commencé.`,
      final: `Toute l'équipe a terminé : ${snap.groups.length} ${snap.groups.length > 1 ? 'groupes définitifs' : 'groupe définitif'}.`,
    };
    $('lv-sub').textContent = sub[snap.state] || '';
    $('lv-empty').hidden = snap.people.some((p) => p.status !== 'none');
  }

  function setState(state) {
    const el = $('lv-state');
    el.dataset.state = state;
    el.querySelector('span').textContent = STATE_LABELS[state] || state;
  }

  function layout() {
    layoutTimer = null;
    lastLayout = performance.now();
    computeTargets();
    syncHulls();
  }

  /** Les réponses arrivent en continu : la carte se réorganise par étapes, et tout de suite à la fin. */
  function scheduleLayout() {
    const wait = snap.state === 'final' ? 0 : Math.max(0, lastLayout + LAYOUT_EVERY - performance.now());
    if (!wait) {
      clearTimeout(layoutTimer);
      layout();
    } else if (!layoutTimer) {
      layoutTimer = setTimeout(layout, wait);
    }
  }

  function apply(next) {
    snap = next;
    if (window.LiveDeck) window.LiveDeck.snapshot(snap);
    const started = new Set();
    for (const p of snap.people) {
      if (!kiosk && p.status === 'none') continue;
      started.add(p.id);
      if (!nodes.has(p.id)) nodes.set(p.id, createNode(p));
    }
    for (const [id, n] of nodes) {
      if (started.has(id)) continue;
      n.el.remove();
      nodes.delete(id);
    }
    for (const p of snap.people) if (nodes.has(p.id)) updateNode(nodes.get(p.id), p);
    scheduleLayout();
    if (kiosk) {
      renderScreenHead();
      return;
    }
    renderHead();
    renderGroups();
    renderFeed();
    renderTray();
  }

  /* ----------  Connexion  ---------- */
  function connect() {
    const source = new EventSource(root.dataset.stream || '/admin/live/stream');
    source.onmessage = (ev) => apply(JSON.parse(ev.data));
    source.addEventListener('deck', (ev) => {
      const view = JSON.parse(ev.data);
      if (view.active) closeSheet();
      if (window.LiveDeck) window.LiveDeck.update(view);
    });
    source.onerror = () => {
      setState('lost');
      if (kiosk && source.readyState === EventSource.CLOSED) {
        $('lv-gone').hidden = false;
        if (window.LiveDeck) window.LiveDeck.update({ active: false });
      }
    };
  }

  /* ----------  Commandes  ---------- */
  function adminControls() {
    try { hideAnswers = localStorage.getItem('lv-hide') === '1'; } catch (e) { /* stockage indisponible */ }
    const hideBtn = $('lv-hide');
    function paintHide() {
      hideBtn.textContent = hideAnswers ? 'Afficher les réponses' : 'Masquer les réponses';
      hideBtn.setAttribute('aria-pressed', String(hideAnswers));
    }
    paintHide();
    hideBtn.addEventListener('click', () => {
      hideAnswers = !hideAnswers;
      try { localStorage.setItem('lv-hide', hideAnswers ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
      paintHide();
      if (snap) renderFeed();
    });
    $('lv-groups').addEventListener('click', (ev) => {
      const card = ev.target.closest('.lv-group');
      const btn = card && card.querySelector('[data-open-group]');
      if (btn) openSheet([...hulls].find((h) => !h.exiting && h.members.has(Number(btn.dataset.openGroup))));
    });
    const share = $('lv-share');
    share.addEventListener('click', () => {
      const box = $('lv-link');
      box.hidden = !box.hidden;
      share.setAttribute('aria-expanded', String(!box.hidden));
    });
    $('lv-link-close').addEventListener('click', () => {
      $('lv-link').hidden = true;
      share.setAttribute('aria-expanded', 'false');
      share.focus();
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen();
  }

  /* Sur la carte seule, le bouton et le curseur disparaissent quand la souris ne bouge plus. */
  function screenControls() {
    let idle = null;
    const wake = () => {
      root.classList.remove('is-idle');
      clearTimeout(idle);
      idle = setTimeout(() => root.classList.add('is-idle'), 2500);
    };
    document.addEventListener('mousemove', wake);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'f' || ev.key === 'F') toggleFullscreen();
    });
    wake();
  }

  if (kiosk) screenControls();
  else adminControls();
  $('lv-full').addEventListener('click', toggleFullscreen);

  function resize() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    hullLayer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    measureZones();
    if (snap) layout();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  connect();
  requestAnimationFrame(step);
}());
