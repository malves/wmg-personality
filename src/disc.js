'use strict';

/**
 * Logique DISC pure (sans accès base) : dimensions, scoring, résolution du profil.
 * Format du test : blocs de 4 items (un par dimension), choix « le plus » / « le moins ».
 */

const DIMENSIONS = {
  D: { key: 'D', name: 'Dominance', adjective: 'Dominant', color: '#F07A6E', chart: '#D5493E', face: 'determined',
       summary: 'Orienté résultats, direct, décideur.' },
  I: { key: 'I', name: 'Influence', adjective: 'Influent', color: '#F6C644', chart: '#B8860B', face: 'happy',
       summary: 'Orienté relations, enthousiaste, persuasif.' },
  S: { key: 'S', name: 'Stabilité', adjective: 'Stable', color: '#7CD39A', chart: '#2F8F56', face: 'calm',
       summary: 'Orienté coopération, patient, fiable.' },
  C: { key: 'C', name: 'Conformité', adjective: 'Consciencieux', color: '#6EC1F5', chart: '#2F7FC1', face: 'focused',
       summary: 'Orienté qualité, précis, analytique.' },
};

const ORDER = ['D', 'I', 'S', 'C'];

/** Score normalisé (0–100, 50 = neutre) à partir duquel une dimension compte comme « haute ». */
const HIGH_THRESHOLD = 55;

const PROFILE_KEYS = ['D', 'I', 'S', 'C', 'DI', 'DS', 'DC', 'ID', 'IS', 'IC', 'SD', 'SI', 'SC', 'CD', 'CI', 'CS', 'EQ'];
const PAIR_KEYS = ['DD', 'DI', 'DS', 'DC', 'II', 'IS', 'IC', 'SS', 'SC', 'CC'];

/** Expression de l'avatar associée à la dimension dominante du profil. */
const PROFILE_EXPRESSIONS = { D: 'proud', I: 'joy', S: 'neutral', C: 'thinking', EQ: 'wink' };

/**
 * Calcule les scores à partir des choix.
 * @param {Array<{most?:string, least?:string, skipped?:boolean}>} choices  dimension choisie « le plus » / « le moins » par bloc
 * @returns {{raw:Object, norm:Object, plus:Object, minus:Object, answered:number}}
 */
function computeScores(choices) {
  const plus = { D: 0, I: 0, S: 0, C: 0 };
  const minus = { D: 0, I: 0, S: 0, C: 0 };
  let answered = 0;
  for (const c of choices || []) {
    if (!c || c.skipped) continue;
    if (!ORDER.includes(c.most) || !ORDER.includes(c.least)) continue;
    plus[c.most] += 1;
    minus[c.least] += 1;
    answered += 1;
  }
  const raw = {};
  const norm = {};
  for (const d of ORDER) {
    raw[d] = plus[d] - minus[d];
    norm[d] = answered ? Math.round(((raw[d] + answered) / (2 * answered)) * 100) : 50;
  }
  return { raw, norm, plus, minus, answered };
}

/** Dimensions triées par score décroissant (égalité : ordre D, I, S, C). */
function orderedDims(norm) {
  return [...ORDER].sort((a, b) => (norm[b] - norm[a]) || (ORDER.indexOf(a) - ORDER.indexOf(b)));
}

/** Clé de profil : 'D' | 'DI' | ... | 'EQ'. */
function resolveProfile(norm) {
  const [primary, secondary] = orderedDims(norm);
  if (norm[primary] < HIGH_THRESHOLD) return 'EQ';
  if (norm[secondary] >= HIGH_THRESHOLD) return primary + secondary;
  return primary;
}

/** Dimension principale d'un profil ('EQ' -> null). */
function primaryOf(profileKey) {
  return profileKey && profileKey !== 'EQ' ? profileKey[0] : null;
}

/** Clé de paire (non ordonnée) pour les conseils de collaboration. */
function pairKey(dimA, dimB) {
  return [dimA, dimB].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('');
}

function profileExpression(profileKey) {
  const p = primaryOf(profileKey);
  return PROFILE_EXPRESSIONS[p || 'EQ'];
}

function profileColor(profileKey, norm) {
  const p = primaryOf(profileKey) || (norm ? orderedDims(norm)[0] : 'I');
  return DIMENSIONS[p].color;
}

module.exports = {
  DIMENSIONS, ORDER, HIGH_THRESHOLD, PROFILE_KEYS, PAIR_KEYS,
  computeScores, orderedDims, resolveProfile, primaryOf, pairKey, profileExpression, profileColor,
};
