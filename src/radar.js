'use strict';

/**
 * Radar SVG des 4 dimensions, rendu côté serveur.
 * Disposition du cercle DISC classique : D haut gauche, I haut droite, S bas droite, C bas gauche.
 */

const { DIMENSIONS, ORDER } = require('./disc');

const ANGLES = { D: 225, I: 315, S: 45, C: 135 };
const W = 340;
const CX = 170;
const CY = 92;
const R = 120;
const SURFACE = '#F6F7F9';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clamp(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** Coordonnées d'une valeur 0–100 sur l'axe d'une dimension. */
function pointFor(dim, value) {
  const a = (ANGLES[dim] * Math.PI) / 180;
  const r = (R * clamp(value)) / 100;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function polygon(scores) {
  return ORDER.map((d) => pointFor(d, scores[d]).map((n) => n.toFixed(1)).join(',')).join(' ');
}

function ring(value) {
  return polygon({ D: value, I: value, S: value, C: value });
}

function axisLabel(dim, series) {
  const [x, y] = pointFor(dim, 100);
  const left = dim === 'D' || dim === 'C';
  const top = dim === 'D' || dim === 'I';
  const anchor = left ? 'end' : 'start';
  const tx = x + (left ? -10 : 10);
  const name = DIMENSIONS[dim].name;
  const values = series.map((s) => clamp(s.scores[dim])).join(' · ');
  const ny = top ? y + 6 : y - 16;
  return `<text x="${tx.toFixed(1)}" y="${ny.toFixed(1)}" text-anchor="${anchor}" font-size="12" font-weight="600" fill="#5F626C">${name}</text>`
    + `<text x="${tx.toFixed(1)}" y="${(ny + 18).toFixed(1)}" text-anchor="${anchor}" font-size="15" font-weight="800" fill="#1C1D22">${values}</text>`;
}

/**
 * @param {Object} o
 * @param {Array<{label?:string, scores:Object, stroke:string, fill?:string, dash?:string}>} o.series  1 ou 2 séries
 * @returns {string} SVG
 */
function renderRadar({ series }) {
  const multi = series.length > 1;
  const H = multi ? 216 : 186;

  const grid = [25, 75, 100].map((v) => `<polygon points="${ring(v)}" fill="none" stroke="#E3E5EA" stroke-width="1"/>`).join('')
    + `<polygon points="${ring(50)}" fill="none" stroke="#B9BDC8" stroke-width="1" stroke-dasharray="3 3"/>`;
  const axes = ORDER.map((d) => {
    const [x, y] = pointFor(d, 100);
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E3E5EA" stroke-width="1"/>`;
  }).join('');

  const shapes = series.map((s) => {
    const fill = s.fill ? `fill="${s.fill}" fill-opacity="0.16"` : 'fill="none"';
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    return `<polygon points="${polygon(s.scores)}" ${fill} stroke="${s.stroke}" stroke-width="2" stroke-linejoin="round"${dash}/>`;
  }).join('');

  const marks = series.map((s) => ORDER.map((d) => {
    const [x, y] = pointFor(d, s.scores[d]);
    const name = DIMENSIONS[d].name;
    const who = s.label ? `${s.label}, ` : '';
    return `<g><title>${esc(who + name)} : ${clamp(s.scores[d])}</title>`
      + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${DIMENSIONS[d].chart}" stroke="${SURFACE}" stroke-width="2"/>`
      + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="transparent"/></g>`;
  }).join('')).join('');

  const labels = ORDER.map((d) => axisLabel(d, series)).join('');

  let legend = '';
  if (multi) {
    const y = H - 10;
    legend = series.map((s, i) => {
      const x = i === 0 ? 80 : 192;
      const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
      return `<line x1="${x}" y1="${y - 4}" x2="${x + 24}" y2="${y - 4}" stroke="${s.stroke}" stroke-width="2.5"${dash}/>`
        + `<text x="${x + 30}" y="${y}" font-size="12" font-weight="600" fill="#5F626C">${esc(s.label || '')}</text>`;
    }).join('');
  }

  const summary = series.map((s) => (s.label ? `${s.label} : ` : '') + ORDER.map((d) => `${DIMENSIONS[d].name} ${clamp(s.scores[d])}`).join(', ')).join(' ; ');

  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">${grid}${axes}${shapes}${marks}${labels}${legend}</svg>`;
}

/* Roue DISC : le même radar posé sur un disque à quatre quarts colorés. */
const WHEEL = { size: 320, c: 160, r: 112 };
const WHEEL_LABELS = {
  D: { x: 4, y: 18, anchor: 'start', top: true },
  I: { x: 316, y: 18, anchor: 'end', top: true },
  S: { x: 316, y: 296, anchor: 'end', top: false },
  C: { x: 4, y: 296, anchor: 'start', top: false },
};

/* Les scores DISC restent proches de 50 : l'écart à la valeur neutre est amplifié pour que la forme se lise. */
const WHEEL_ZOOM = 1.6;

function wheelPoint(dim, value) {
  const a = (ANGLES[dim] * Math.PI) / 180;
  const r = (WHEEL.r * clamp(50 + (clamp(value) - 50) * WHEEL_ZOOM)) / 100;
  return [WHEEL.c + r * Math.cos(a), WHEEL.c + r * Math.sin(a)];
}

function wheelQuarter(dim) {
  const { c, r } = WHEEL;
  const mid = (ANGLES[dim] * Math.PI) / 180;
  const a0 = mid - Math.PI / 4;
  const a1 = mid + Math.PI / 4;
  const p = (a) => `${(c + r * Math.cos(a)).toFixed(1)} ${(c + r * Math.sin(a)).toFixed(1)}`;
  return `M ${c} ${c} L ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)} Z`;
}

/**
 * @param {Object} o
 * @param {Object} o.scores  scores normalisés { D, I, S, C }
 * @returns {string} SVG
 */
function renderDiscWheel({ scores }) {
  const { size, c, r } = WHEEL;
  const quarters = ORDER.map((d) => `<path d="${wheelQuarter(d)}" fill="${DIMENSIONS[d].color}" fill-opacity=".34"/>`).join('');
  const rings = [25, 75].map((v) => `<circle cx="${c}" cy="${c}" r="${r * v / 100}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.5"/>`).join('')
    + `<circle cx="${c}" cy="${c}" r="${r / 2}" fill="none" stroke="#5F626C" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="3 4"/>`
    + `<path d="M ${c} ${c - r} V ${c + r} M ${c - r} ${c} H ${c + r}" stroke="#fff" stroke-width="3"/>`;
  const points = ORDER.map((d) => wheelPoint(d, scores[d]).map((n) => n.toFixed(1)).join(',')).join(' ');
  const dots = ORDER.map((d) => {
    const [x, y] = wheelPoint(d, scores[d]);
    return `<g><title>${DIMENSIONS[d].name} : ${clamp(scores[d])}</title><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="${DIMENSIONS[d].chart}" stroke="#fff" stroke-width="2.5"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18" fill="transparent"/></g>`;
  }).join('');
  const labels = ORDER.map((d) => {
    const l = WHEEL_LABELS[d];
    return `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="13" font-weight="600" fill="#5F626C">${DIMENSIONS[d].name}</text>`
      + `<text x="${l.x}" y="${l.y + 22}" text-anchor="${l.anchor}" font-size="20" font-weight="800" fill="#1C1D22">${clamp(scores[d])}</text>`;
  }).join('');
  const summary = ORDER.map((d) => `${DIMENSIONS[d].name} ${clamp(scores[d])}`).join(', ');
  return `<svg class="wheel" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(summary)}" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">${quarters}${rings}<g class="wheel-shape"><polygon points="${points}" fill="#1C1D22" fill-opacity=".1" stroke="#1C1D22" stroke-width="2.5" stroke-linejoin="round"/>${dots}</g>${labels}</svg>`;
}

module.exports = { renderRadar, renderDiscWheel, pointFor, wheelPoint, CENTER: [CX, CY] };
