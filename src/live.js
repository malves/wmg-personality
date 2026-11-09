'use strict';

/**
 * Suivi en direct du test pour l'admin : photo de l'avancement et diffusion par Server-Sent Events.
 * La photo est recalculée depuis la base : une page rouverte ou un serveur redémarré retrouvent donc
 * le même état. Les groupes de la photo précédente y sont conservés (réglage `live_groups`) pour que
 * chacun évolue d'une photo à l'autre au lieu d'être refait de zéro, et les groupes finaux avec eux.
 */

const crypto = require('crypto');
const { db, parseJSON, getSettings, setSetting } = require('./db');
const disc = require('./disc');
const groups = require('./groups');
const { createDeck } = require('./deck');
const AvatarKit = require('../public/js/avatar');

const THROTTLE_MS = 400;
const HEARTBEAT_MS = 25000;
const FEED_SIZE = 25;

const stmtPeople = db.prepare(`
  SELECT u.id, u.first_name, u.last_name, u.avatar_json,
         a.id AS attempt_id, a.status, a.block_order, a.scores_json, a.profile_key
  FROM users u LEFT JOIN attempts a ON a.user_id = u.id
  WHERE u.show_in_team = 1
  ORDER BY u.first_name COLLATE NOCASE, u.last_name COLLATE NOCASE
`);
const stmtAnswers = db.prepare('SELECT attempt_id, most_dim, least_dim, skipped FROM answers');
const stmtFeed = db.prepare(`
  SELECT u.id AS user_id, u.first_name, u.last_name, an.skipped, an.answered_at,
         most.text AS most_text, least.text AS least_text
  FROM answers an
  JOIN attempts a ON a.id = an.attempt_id
  JOIN users u ON u.id = a.user_id AND u.show_in_team = 1
  LEFT JOIN items most ON most.id = an.most_item_id
  LEFT JOIN items least ON least.id = an.least_item_id
  ORDER BY an.answered_at DESC, an.rowid DESC
  LIMIT ${FEED_SIZE}
`);

function profilesByKey() {
  const out = {};
  for (const p of db.prepare('SELECT key, name FROM profiles').all()) out[p.key] = p;
  return out;
}

/**
 * Repères de lecture des groupes et des personnes, par profil : textes génériques, sans donnée personnelle.
 * Sérialisés pour un <script type="application/json"> : `<` est échappé pour ne pas le refermer.
 */
function groupGuideJson() {
  const lines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const guide = {};
  for (const p of db.prepare('SELECT key, name, tagline, strengths, watchouts, communication, how_to_work, keywords FROM profiles').all()) {
    guide[p.key] = {
      name: p.name,
      dim: disc.primaryOf(p.key),
      tagline: p.tagline,
      strengths: lines(p.strengths),
      watchouts: lines(p.watchouts),
      communication: p.communication,
      howTo: lines(p.how_to_work),
      keywords: String(p.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
    };
  }
  return JSON.stringify(guide).replace(/</g, '\\u003c');
}

/** Ce dont la présentation a besoin pour se dessiner : aucune donnée personnelle. */
function deckConfigJson() {
  const blocks = db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE active = 1').get().n;
  return JSON.stringify({ dims: disc.DIMENSIONS, blocks }).replace(/</g, '\\u003c');
}

function roundScores(s) {
  return Object.fromEntries(disc.ORDER.map((d) => [d, Math.round(s[d])]));
}

/** État global de la session : `final` seulement quand toute l'équipe a terminé. */
function sessionState({ total, notStarted, inProgress, done }) {
  if (!total || (!done && !inProgress)) return 'idle';
  if (inProgress) return 'live';
  return notStarted ? 'paused' : 'final';
}

function snapshot() {
  const choicesByAttempt = new Map();
  for (const a of stmtAnswers.all()) {
    if (!choicesByAttempt.has(a.attempt_id)) choicesByAttempt.set(a.attempt_id, []);
    choicesByAttempt.get(a.attempt_id).push(a.skipped ? { skipped: true } : { most: a.most_dim, least: a.least_dim });
  }

  const counts = { total: 0, notStarted: 0, inProgress: 0, done: 0, answers: 0, expected: 0 };
  const placed = [];
  const people = stmtPeople.all().map((u) => {
    counts.total += 1;
    const base = {
      id: u.id, firstName: u.first_name, lastName: u.last_name,
      avatar: AvatarKit.normalizeConfig(parseJSON(u.avatar_json, null)),
    };
    if (!u.attempt_id) {
      counts.notStarted += 1;
      return { ...base, status: 'none', answered: 0, total: 0, x: 0, y: 0, group: null, scores: null, profileKey: null };
    }
    const done = u.status === 'completed';
    const choices = choicesByAttempt.get(u.attempt_id) || [];
    const total = parseJSON(u.block_order, []).length;
    const stored = done ? parseJSON(u.scores_json, null) : null;
    const computed = stored || disc.computeScores(choices);
    const confidence = done ? 1 : (total ? computed.answered / total : 0);
    const scores = groups.provisional(computed.norm, confidence);
    if (done) counts.done += 1;
    else counts.inProgress += 1;
    counts.answers += choices.length;
    counts.expected += total;
    if (done || computed.answered >= groups.MIN_ANSWERS) placed.push({ id: u.id, scores, full: computed.norm });
    return { ...base, status: done ? 'done' : 'progress', answered: choices.length, total, ...groups.mapPosition(scores), group: null, scores: roundScores(scores), profileKey: done ? (u.profile_key || disc.resolveProfile(computed.norm)) : null };
  });
  counts.expected += counts.notStarted * (db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE active = 1').get().n);

  const previous = getSettings().live_groups;
  const memory = { groups: parseJSON(previous, []), progress: counts.expected ? counts.answers / counts.expected : 0 };
  const { groups: list, alone } = groups.buildGroups(placed, profilesByKey(), memory);
  const current = JSON.stringify(list.map((g) => g.members));
  if (current !== previous) setSetting('live_groups', current);
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const g of list) for (const id of g.members) byId.get(id).group = g.id;

  const feed = stmtFeed.all().map((f) => ({
    userId: f.user_id, name: `${f.first_name} ${f.last_name}`.trim(), skipped: !!f.skipped,
    most: f.most_text || null, least: f.least_text || null,
    at: `${String(f.answered_at).replace(' ', 'T')}Z`,
  }));

  return { state: sessionState(counts), counts, people, groups: list, alone, feed };
}

/**
 * Efface les passations (réponses et résultats par cascade) d'une personne ou de toute l'équipe,
 * et les retire des groupes mémorisés : une nouvelle passation repart sans groupe.
 * @returns {number} nombre de passations supprimées
 */
function resetAttempts(userId = null) {
  return db.transaction(() => {
    const removed = userId === null
      ? db.prepare('DELETE FROM attempts').run().changes
      : db.prepare('DELETE FROM attempts WHERE user_id = ?').run(userId).changes;
    const kept = userId === null
      ? []
      : parseJSON(getSettings().live_groups, []).map((ids) => ids.filter((id) => id !== userId)).filter((ids) => ids.length > 1);
    setSetting('live_groups', JSON.stringify(kept));
    return removed;
  })();
}

/* ----------  Diffusion  ---------- */
const clients = new Map(); // réponse -> vue publique ou non
let timer = null;

/* La présentation passe par le même flux que la carte, sous un événement à part. */
const deckEvent = (view) => `event: deck\ndata: ${JSON.stringify(view)}\n\n`;
const deck = createDeck({
  onChange(view) {
    const message = deckEvent(view);
    for (const res of clients.keys()) res.write(message);
  },
});

function broadcast() {
  timer = null;
  if (!clients.size) return;
  const snap = snapshot();
  const full = `data: ${JSON.stringify(snap)}\n\n`;
  const open = `data: ${JSON.stringify(groups.publicView(snap))}\n\n`;
  for (const [res, isPublic] of clients) res.write(isPublic ? open : full);
}

/** À appeler après une écriture : regroupe les réponses simultanées en une seule mise à jour. */
function notify() {
  if (!clients.size || timer) return;
  timer = setTimeout(broadcast, THROTTLE_MS);
}

function subscribe(req, res, { isPublic = false } = {}) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  const first = snapshot();
  res.write(`data: ${JSON.stringify(isPublic ? groups.publicView(first) : first)}\n\n`);
  res.write(deckEvent(deck.view()));
  clients.set(res, isPublic);
  const ping = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  ping.unref();
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

/* ----------  Lien public de la carte  ---------- */
function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  setSetting('live_token', token);
  return token;
}

/** Le lien n'existe qu'à partir de la première visite de l'admin sur la page « En direct ». */
function publicToken() {
  return getSettings().live_token || newToken();
}

function tokenIsValid(candidate) {
  const stored = Buffer.from(getSettings().live_token || '');
  const given = Buffer.from(String(candidate || ''));
  return stored.length > 0 && stored.length === given.length && crypto.timingSafeEqual(stored, given);
}

/** Remplace le lien et coupe les écrans encore ouverts avec l'ancien. */
function revokePublicLink() {
  const token = newToken();
  for (const [res, isPublic] of clients) if (isPublic) res.end();
  return token;
}

module.exports = { deck, deckConfigJson, groupGuideJson, resetAttempts, snapshot, sessionState, notify, subscribe, publicToken, tokenIsValid, revokePublicLink };
