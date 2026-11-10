'use strict';

/**
 * Déroulé du test : page /test (client-side) + API JSON /api/test/*.
 * La passation fige l'ordre des blocs et des items au démarrage (block_order) ;
 * les dimensions sont figées à chaque réponse (most_dim / least_dim).
 */

const express = require('express');
const { db, getAttemptByUser, getSettings, parseJSON } = require('../db');
const disc = require('../disc');
const AvatarKit = require('../../public/js/avatar');
const live = require('../live');

const router = express.Router();

/* Chaque écriture du test met à jour la page « En direct » de l'admin. */
router.use('/api/test', (req, res, next) => {
  if (req.method === 'POST') res.on('finish', live.notify);
  next();
});

const stmtItem = db.prepare('SELECT id, text, dimension FROM items WHERE id = ?');
const stmtAnswers = db.prepare('SELECT * FROM answers WHERE attempt_id = ?');
const stmtUpsertAnswer = db.prepare(`
  INSERT INTO answers (attempt_id, block_id, most_item_id, least_item_id, most_dim, least_dim, skipped, answered_at)
  VALUES (@attempt_id, @block_id, @most_item_id, @least_item_id, @most_dim, @least_dim, @skipped, datetime('now'))
  ON CONFLICT(attempt_id, block_id) DO UPDATE SET
    most_item_id = excluded.most_item_id, least_item_id = excluded.least_item_id,
    most_dim = excluded.most_dim, least_dim = excluded.least_dim, skipped = excluded.skipped, answered_at = excluded.answered_at
`);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Blocs de la passation avec le texte à jour des items (les blocs supprimés depuis disparaissent). */
function blocksForAttempt(attempt) {
  const order = parseJSON(attempt.block_order, []);
  return order
    .map((o) => ({ id: o.blockId, items: (o.itemIds || []).map((id) => stmtItem.get(id)).filter(Boolean).map((i) => ({ id: i.id, text: i.text })) }))
    .filter((b) => b.items.length >= 2);
}

function answersMap(attemptId) {
  const out = {};
  for (const a of stmtAnswers.all(attemptId)) {
    out[a.block_id] = { mostItemId: a.most_item_id, leastItemId: a.least_item_id, skipped: !!a.skipped };
  }
  return out;
}

function baseState(req, settings) {
  return {
    allowSkip: settings.allow_skip,
    avatar: AvatarKit.normalizeConfig(parseJSON(req.user.avatar_json, null)),
    firstName: req.user.first_name,
    blockCount: db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE active = 1').get().n,
  };
}

function fullState(req, attempt, settings) {
  return { ...baseState(req, settings), status: 'in_progress', blocks: blocksForAttempt(attempt), answers: answersMap(attempt.id) };
}

/* ----------  Page  ---------- */
router.get('/test', (req, res) => {
  const attempt = getAttemptByUser(req.user.id);
  if (attempt && attempt.status === 'completed') return res.redirect('/result');
  return res.render('pages/app/test', { title: 'Le test', nav: 'test', hideNav: true });
});

/* ----------  API  ---------- */
router.get('/api/test/state', (req, res) => {
  const settings = getSettings();
  const attempt = getAttemptByUser(req.user.id);
  if (!attempt) return res.json({ ...baseState(req, settings), status: 'none' });
  if (attempt.status === 'completed') return res.json({ ...baseState(req, settings), status: 'completed' });
  return res.json(fullState(req, attempt, settings));
});

router.post('/api/test/start', (req, res) => {
  const settings = getSettings();
  const existing = getAttemptByUser(req.user.id);
  if (existing && existing.status === 'completed') return res.status(409).json({ error: 'Test déjà terminé', status: 'completed' });
  if (existing) return res.json(fullState(req, existing, settings));
  if (!req.body || req.body.consent !== true) return res.status(400).json({ error: 'Le consentement est requis.' });

  const blocks = db.prepare('SELECT id FROM blocks WHERE active = 1 ORDER BY sort_order, id').all();
  if (!blocks.length) return res.status(400).json({ error: 'Aucune question disponible.' });
  const items = db.prepare('SELECT id, block_id FROM items ORDER BY sort_order, id').all();
  const order = blocks
    .map((b) => ({ blockId: b.id, itemIds: items.filter((i) => i.block_id === b.id).map((i) => i.id) }))
    .filter((o) => o.itemIds.length >= 2);
  if (settings.shuffle_blocks) shuffle(order);
  if (settings.shuffle_items) order.forEach((o) => shuffle(o.itemIds));

  db.prepare(`INSERT INTO attempts (user_id, status, consent_at, block_order) VALUES (?, 'in_progress', datetime('now'), ?)`)
    .run(req.user.id, JSON.stringify(order));
  return res.json(fullState(req, getAttemptByUser(req.user.id), settings));
});

router.post('/api/test/answer', (req, res) => {
  const settings = getSettings();
  const attempt = getAttemptByUser(req.user.id);
  if (!attempt || attempt.status !== 'in_progress') return res.status(409).json({ error: 'Aucune passation en cours.' });
  const body = req.body || {};
  const blockId = Number(body.blockId);
  const order = parseJSON(attempt.block_order, []);
  const entry = order.find((o) => o.blockId === blockId);
  if (!entry) return res.status(400).json({ error: 'Bloc inconnu.' });

  if (body.skipped === true) {
    if (!settings.allow_skip) return res.status(400).json({ error: 'Passer une question n\'est pas autorisé.' });
    stmtUpsertAnswer.run({ attempt_id: attempt.id, block_id: blockId, most_item_id: null, least_item_id: null, most_dim: null, least_dim: null, skipped: 1 });
  } else {
    const mostId = Number(body.mostItemId);
    const leastId = Number(body.leastItemId);
    if (!entry.itemIds.includes(mostId) || !entry.itemIds.includes(leastId)) return res.status(400).json({ error: 'Item inconnu pour ce bloc.' });
    if (mostId === leastId) return res.status(400).json({ error: '« Le plus » et « le moins » doivent être différents.' });
    const most = stmtItem.get(mostId);
    const least = stmtItem.get(leastId);
    if (!most || !least) return res.status(409).json({ error: 'Cette question a été modifiée, recharge la page.', reload: true });
    stmtUpsertAnswer.run({ attempt_id: attempt.id, block_id: blockId, most_item_id: mostId, least_item_id: leastId, most_dim: most.dimension, least_dim: least.dimension, skipped: 0 });
  }
  const answered = db.prepare('SELECT COUNT(*) AS n FROM answers WHERE attempt_id = ?').get(attempt.id).n;
  return res.json({ ok: true, answered, total: order.length });
});

router.post('/api/test/finish', (req, res) => {
  const attempt = getAttemptByUser(req.user.id);
  if (!attempt || attempt.status !== 'in_progress') return res.status(409).json({ error: 'Aucune passation en cours.' });
  const answers = {};
  for (const a of stmtAnswers.all(attempt.id)) answers[a.block_id] = a;
  const valid = new Set(blocksForAttempt(attempt).map((b) => b.id));
  const order = parseJSON(attempt.block_order, []);
  const missing = [];
  const choices = [];
  for (const o of order) {
    const a = answers[o.blockId];
    if (a) choices.push(a.skipped ? { skipped: true } : { most: a.most_dim, least: a.least_dim });
    else if (valid.has(o.blockId)) missing.push(o.blockId);
  }
  if (missing.length) return res.status(400).json({ error: 'Il reste des questions sans réponse.', missing });

  const scores = disc.computeScores(choices);
  const profileKey = disc.resolveProfile(scores.norm);
  db.prepare(`UPDATE attempts SET status = 'completed', completed_at = datetime('now'), scores_json = ?, profile_key = ? WHERE id = ?`)
    .run(JSON.stringify(scores), profileKey, attempt.id);
  return res.json({ ok: true, profileKey, scores: scores.norm });
});

module.exports = router;
