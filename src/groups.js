'use strict';

/**
 * Regroupement des collaborateurs par similarité, à partir de scores éventuellement partiels.
 * Logique pure, sans accès base : la page « En direct » s'en sert pendant le test, et le même
 * calcul sur les scores définitifs donne les groupes finaux.
 */

const disc = require('./disc');

const { ORDER } = disc;

/** Nombre minimum de réponses pour qu'une personne entre dans un groupe : avant, ses scores varient trop. */
const MIN_ANSWERS = 6;
/**
 * Distance maximale entre deux membres d'un même groupe : la distance médiane entre collègues,
 * bornée. Elle s'adapte ainsi à une équipe aux scores marqués comme à une équipe très nuancée
 * (environ 6 groupes pour 28 personnes dans les deux cas, d'après des simulations).
 */
const MIN_DISTANCE = 18;
const MAX_DISTANCE = 44;
/** Une personne isolée rejoint le groupe le plus proche si elle reste dans cette marge. */
const ATTACH_FACTOR = 1.25;
/**
 * Pendant le test, un groupe garde un membre jusqu'à cette marge au-delà du seuil. Sans elle, une
 * seule réponse peut redistribuer la moitié de l'équipe. La marge se resserre jusqu'à ATTACH_FACTOR
 * en fin de test : le critère de proximité d'un groupe définitif reste celui d'un rattachement.
 */
const KEEP_FACTOR = 1.5;
/** Amplifie les écarts à 50 pour occuper la carte : les scores DISC restent proches du neutre. */
const MAP_ZOOM = 1.9;

/** Ramène les scores vers 50 tant que la personne a peu répondu : elle part du centre. */
function provisional(norm, confidence) {
  const c = Math.max(0, Math.min(1, confidence));
  const out = {};
  for (const d of ORDER) out[d] = 50 + (norm[d] - 50) * c;
  return out;
}

/** Position sur la carte DISC : D en haut à gauche, I en haut à droite, S en bas à droite, C en bas à gauche. */
function mapPosition(s) {
  const d = {};
  for (const k of ORDER) d[k] = (s[k] - 50) / 50;
  let x = ((d.I + d.S - d.D - d.C) / 2) * MAP_ZOOM;
  let y = ((d.S + d.C - d.D - d.I) / 2) * MAP_ZOOM;
  const r = Math.hypot(x, y);
  if (r > 1) { x /= r; y /= r; }
  return { x, y };
}

function distance(a, b) {
  return Math.sqrt(ORDER.reduce((sum, d) => sum + (a[d] - b[d]) ** 2, 0));
}

function mean(vectors) {
  const out = {};
  for (const d of ORDER) out[d] = vectors.reduce((sum, v) => sum + v[d], 0) / vectors.length;
  return out;
}

function groupDistance(points) {
  const all = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) all.push(distance(points[i].scores, points[j].scores));
  }
  if (!all.length) return MIN_DISTANCE;
  all.sort((a, b) => a - b);
  return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, all[all.length >> 1]));
}

/** Classification ascendante, lien complet : deux membres d'un groupe restent toujours proches. */
function cluster(points, threshold, seeds = []) {
  const seeded = new Set(seeds.flat());
  const clusters = [...seeds.map((c) => [...c]), ...points.filter((p) => !seeded.has(p)).map((p) => [p])];
  const link = (a, b) => {
    let max = 0;
    for (const p of a) for (const q of b) max = Math.max(max, distance(p.scores, q.scores));
    return max;
  };
  for (;;) {
    let best = null;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const dist = link(clusters[i], clusters[j]);
        if (dist <= threshold && (!best || dist < best.dist)) best = { i, j, dist };
      }
    }
    if (!best) break;
    clusters[best.i] = clusters[best.i].concat(clusters[best.j]);
    clusters.splice(best.j, 1);
  }
  return clusters;
}

/**
 * Reprend les groupes précédents comme point de départ. Le membre le plus à l'écart sort tant que
 * deux membres dépassent la marge, qui se resserre à mesure que l'équipe avance (`progress` de 0 à 1).
 */
function seedGroups(points, previous, threshold, progress) {
  const byId = new Map(points.map((p) => [p.id, p]));
  const margin = threshold * (ATTACH_FACTOR + (KEEP_FACTOR - ATTACH_FACTOR) * (1 - progress));
  const seeds = [];
  for (const ids of previous) {
    const members = ids.map((id) => byId.get(id)).filter(Boolean);
    for (;;) {
      const gaps = members.map((m) => members.map((o) => distance(m.scores, o.scores)));
      if (Math.max(...gaps.flat(), 0) <= margin) break;
      const totals = gaps.map((row) => row.reduce((a, b) => a + b, 0));
      members.splice(totals.indexOf(Math.max(...totals)), 1);
    }
    if (members.length > 1) seeds.push(members);
  }
  return seeds;
}

/** Rattache les personnes isolées au groupe le plus proche quand l'écart reste raisonnable. */
function attachLoners(clusters, threshold) {
  const groups = clusters.filter((c) => c.length > 1);
  const loners = clusters.filter((c) => c.length === 1).map((c) => c[0]);
  const alone = [];
  for (const person of loners) {
    let best = null;
    for (const g of groups) {
      const dist = Math.max(...g.map((m) => distance(m.scores, person.scores)));
      if (dist <= threshold * ATTACH_FACTOR && (!best || dist < best.dist)) best = { g, dist };
    }
    if (best) best.g.push(person);
    else alone.push(person);
  }
  return { groups, alone };
}

/** « Le Pionnier » → « Les Pionniers », « L'Analyste » → « Les Analystes ». */
function pluralName(name) {
  const base = String(name || '').trim().replace(/^(les|le|la)\s+/i, '').replace(/^l['’]/i, '');
  if (!base) return 'Groupe';
  const word = /[sxz]$/i.test(base) ? base : `${base}s`;
  return `Les ${word.charAt(0).toLocaleUpperCase('fr')}${word.slice(1)}`;
}

/**
 * @param {Array<{id:number, scores:Object, full:Object}>} people  scores = provisoires, full = sans amortissement
 * @param {Object} profiles  profils par clé, pour nommer les groupes
 * @param {{groups:number[][], progress:number}} [memory]  groupes de la photo précédente et avancement
 */
function buildGroups(people, profiles = {}, memory = null) {
  const threshold = groupDistance(people);
  const seeds = memory ? seedGroups(people, memory.groups, threshold, memory.progress) : [];
  const { groups, alone } = attachLoners(cluster(people, threshold, seeds), threshold);
  const named = {};
  const result = groups.map((members) => {
    const avg = mean(members.map((m) => m.full));
    const key = disc.resolveProfile(avg);
    const base = pluralName(profiles[key] && profiles[key].name);
    named[base] = (named[base] || 0) + 1;
    const dim = disc.primaryOf(key);
    const second = disc.orderedDims(avg).find((d) => d !== dim);
    return {
      key,
      dim,
      second: disc.DIMENSIONS[second].name,
      name: base,
      members: members.map((m) => m.id).sort((a, b) => a - b),
      mean: Object.fromEntries(ORDER.map((d) => [d, Math.round(avg[d])])),
    };
  }).sort((a, b) => b.members.length - a.members.length || a.members[0] - b.members[0]);

  /* Deux groupes au même nom se distinguent par leur deuxième dimension, puis par un numéro. */
  const seen = {};
  for (const g of result) {
    g.id = g.members[0];
    g.label = named[g.name] > 1 ? `${g.name} · ${g.second}` : g.name;
    seen[g.label] = (seen[g.label] || 0) + 1;
    if (seen[g.label] > 1) g.label = `${g.label} ${seen[g.label]}`;
    delete g.second;
  }
  return { groups: result, alone: alone.map((p) => p.id).sort((a, b) => a - b) };
}

/**
 * Version de la photo destinée au lien public : liste blanche des champs affichés sur la carte.
 * Le profil final de chacun y figure, comme sur la page Équipe ; pas de réponses, de scores ni de
 * nom de famille, car ce lien s'ouvre sans compte.
 */
function publicView(snap) {
  const { total, notStarted, inProgress, done } = snap.counts;
  return {
    state: snap.state,
    counts: { total, notStarted, inProgress, done },
    people: snap.people.map(({ id, firstName, avatar, status, answered, total: blocks, x, y, group, profileKey }) => ({ id, firstName, avatar, status, answered, total: blocks, x, y, group, profileKey })),
    groups: snap.groups.map(({ id, key, label, dim, members }) => ({ id, key, label, dim, members })),
  };
}

module.exports = { publicView, MIN_ANSWERS, MIN_DISTANCE, MAX_DISTANCE, groupDistance, provisional, mapPosition, distance, cluster, seedGroups, attachLoners, pluralName, buildGroups };
