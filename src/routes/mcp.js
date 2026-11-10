'use strict';

/**
 * API dédiée au serveur MCP (pilotage depuis Claude).
 *
 * Volontairement en dehors de l'espace admin à session : l'authentification se fait par un jeton
 * Bearer dédié (variable d'environnement MCP_TOKEN), comparé en temps constant. Sans MCP_TOKEN
 * défini, toute l'API répond 503 : le pilotage reste donc désactivé par défaut.
 *
 * Portée actuelle : LECTURE SEULE pour les données (collaborateurs, résultats, groupes) +
 * pilotage du live/présentation, qui doit passer par ce serveur car l'état de la présentation
 * et les écrans connectés vivent dans sa mémoire (voir src/deck.js et src/live.js).
 */

const express = require('express');
const crypto = require('crypto');
const {
  db, getUserById, getAttemptByUser, parseJSON, getSettings,
} = require('../db');
const disc = require('../disc');
const live = require('../live');
const { ACTIONS } = require('../deck');

const router = express.Router();

/* ----------  Authentification par jeton  ---------- */
function tokenValid(req) {
  const expected = Buffer.from(process.env.MCP_TOKEN || '');
  const given = Buffer.from((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  return expected.length > 0 && expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

router.use((req, res, next) => {
  if (!process.env.MCP_TOKEN) return res.status(503).json({ error: 'MCP désactivé : définir MCP_TOKEN côté serveur.' });
  if (!tokenValid(req)) return res.status(401).json({ error: 'Jeton MCP invalide.' });
  return next();
});

/* ----------  Helpers  ---------- */
const stmtProfile = db.prepare('SELECT * FROM profiles WHERE key = ?');
const stmtPair = db.prepare('SELECT text FROM pair_advice WHERE key = ?');

function profileSummary(p) {
  if (!p) return null;
  return {
    key: p.key, name: p.name, tagline: p.tagline,
    keywords: String(p.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
  };
}

function resultOf(user) {
  const attempt = getAttemptByUser(user.id);
  if (!attempt || attempt.status !== 'completed') return null;
  const scores = parseJSON(attempt.scores_json, null);
  if (!scores) return null;
  const profile = stmtProfile.get(attempt.profile_key) || stmtProfile.get('EQ');
  const dims = disc.orderedDims(scores.norm);
  return {
    completedAt: attempt.completed_at,
    primary: dims[0],
    order: dims,
    scores: Object.fromEntries(disc.ORDER.map((d) => [d, Math.round(scores.norm[d])])),
    profile: profileSummary(profile),
  };
}

/* ----------  Collaborateurs (lecture)  ---------- */
router.get('/collaborators', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.show_in_team,
           u.password_hash IS NOT NULL AS active, u.invite_token, u.invite_expires_at,
           a.status, a.profile_key, a.completed_at
    FROM users u LEFT JOIN attempts a ON a.user_id = u.id
    ORDER BY u.role DESC, u.first_name COLLATE NOCASE, u.last_name COLLATE NOCASE
  `).all();
  const base = (getSettings().base_url || `http://localhost:${process.env.PORT || 3020}`).replace(/\/+$/, '');
  const people = rows.map((u) => ({
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    role: u.role,
    showInTeam: !!u.show_in_team,
    active: !!u.active,
    testStatus: u.status || 'none',
    profileKey: u.status === 'completed' ? u.profile_key : null,
    completedAt: u.completed_at || null,
    inviteLink: (!u.active && u.invite_token && u.invite_expires_at > Date.now())
      ? `${base}/invite/${u.invite_token}` : null,
  }));
  res.json({ count: people.length, collaborators: people });
});

/* ----------  Résultat d'une personne (lecture)  ---------- */
router.get('/result/:id', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Collaborateur introuvable.' });
  const result = resultOf(user);
  res.json({
    user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email },
    completed: !!result,
    result,
  });
});

/* ----------  Comparaison de deux personnes (lecture)  ---------- */
router.get('/compare/:a/:b', (req, res) => {
  const a = getUserById(Number(req.params.a));
  const b = getUserById(Number(req.params.b));
  if (!a || !b) return res.status(404).json({ error: 'Collaborateur introuvable.' });
  const ra = resultOf(a);
  const rb = resultOf(b);
  if (!ra || !rb) return res.status(409).json({ error: 'Les deux personnes doivent avoir terminé le test.' });
  const key = disc.pairKey(ra.primary, rb.primary);
  res.json({
    a: { id: a.id, firstName: a.first_name, ...ra },
    b: { id: b.id, firstName: b.first_name, ...rb },
    pairKey: key,
    advice: (stmtPair.get(key) || {}).text || '',
  });
});

/* ----------  Groupes + photo du live (lecture)  ---------- */
router.get('/live', (req, res) => {
  const snap = live.snapshot();
  res.json({
    state: snap.state,
    counts: snap.counts,
    groups: snap.groups.map((g) => ({ id: g.id, name: g.name, members: g.members })),
    alone: snap.alone,
    feed: snap.feed,
  });
});

/* ----------  Pilotage de la présentation (action)  ---------- */
router.get('/presentation', (req, res) => res.json(live.deck.view()));

router.post('/presentation', (req, res) => {
  const action = String((req.body || {}).action || '');
  if (!ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Commande inconnue. Attendu : ${ACTIONS.join(', ')}.` });
  }
  live.deck[action]();
  res.json(live.deck.view());
});

module.exports = router;
