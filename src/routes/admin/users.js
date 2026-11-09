'use strict';

const express = require('express');
const live = require('../../live');
const { db, getUserById, getAttemptByUser, getSettings, parseJSON, newInviteToken, INVITE_TTL_MS, publicBaseUrl } = require('../../db');
const disc = require('../../disc');
const AvatarKit = require('../../../public/js/avatar');

const router = express.Router();

/* Réinitialisation, suppression, avatar : la page « En direct » se met à jour. */
router.use((req, res, next) => {
  if (req.method === 'POST') res.on('finish', live.notify);
  next();
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function inviteUrl(req, user) {
  if (!user.invite_token || !user.invite_expires_at || user.invite_expires_at < Date.now()) return null;
  return `${publicBaseUrl(req)}/invite/${user.invite_token}`;
}
function validateUserForm(body, excludeId) {
  const first_name = String(body.first_name || '').trim();
  const last_name = String(body.last_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const show_in_team = body.show_in_team ? 1 : 0;
  const errors = [];
  if (!first_name) errors.push('Le prénom est obligatoire.');
  if (!EMAIL_RE.test(email)) errors.push('L\'email est invalide.');
  const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, excludeId || 0);
  if (dup) errors.push('Un compte existe déjà avec cet email.');
  return { values: { first_name, last_name, email, show_in_team }, errors };
}

/* ----------  Liste  ---------- */
router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT u.*, u.password_hash IS NOT NULL AS active, a.status, a.profile_key, a.completed_at
    FROM users u LEFT JOIN attempts a ON a.user_id = u.id
    ORDER BY u.role = 'admin' DESC, u.first_name COLLATE NOCASE, u.last_name COLLATE NOCASE
  `).all();
  const profiles = {};
  for (const p of db.prepare('SELECT key, name FROM profiles').all()) profiles[p.key] = p.name;
  const rows = users.map((u) => ({
    ...u,
    inviteUrl: inviteUrl(req, u),
    profileName: u.profile_key ? (profiles[u.profile_key] || u.profile_key) : null,
    color: u.profile_key ? disc.profileColor(u.profile_key) : null,
  }));
  res.render('pages/admin/users', { title: 'Collaborateurs', active: 'users', users: rows, attempts: rows.filter((u) => u.status).length, flash: req.query.msg || null });
});

router.get('/new', (req, res) => {
  res.render('pages/admin/user-form', { title: 'Nouveau collaborateur', active: 'users', user: null, values: { first_name: '', last_name: '', email: '', show_in_team: 1 }, errors: [] });
});

router.post('/', (req, res) => {
  const { values, errors } = validateUserForm(req.body, null);
  if (errors.length) return res.status(400).render('pages/admin/user-form', { title: 'Nouveau collaborateur', active: 'users', user: null, values, errors });
  const token = newInviteToken();
  const info = db.prepare(`INSERT INTO users (email, first_name, last_name, role, invite_token, invite_expires_at, avatar_json, show_in_team)
                           VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`)
    .run(values.email, values.first_name, values.last_name, token, Date.now() + INVITE_TTL_MS, JSON.stringify(AvatarKit.randomConfig()), values.show_in_team);
  return res.redirect(`/admin/users/${info.lastInsertRowid}?created=1`);
});

/* ----------  Détail  ---------- */
function answersDetail(attempt) {
  if (!attempt) return [];
  const order = parseJSON(attempt.block_order, []);
  const answers = {};
  for (const a of db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(attempt.id)) answers[a.block_id] = a;
  const stmtItem = db.prepare('SELECT id, text, dimension FROM items WHERE id = ?');
  return order.map((o, idx) => {
    const a = answers[o.blockId];
    return {
      index: idx + 1,
      blockId: o.blockId,
      answered: !!a,
      skipped: !!(a && a.skipped),
      items: (o.itemIds || []).map((id) => {
        const it = stmtItem.get(id) || { id, text: '(item supprimé)', dimension: '?' };
        return { ...it, most: !!(a && a.most_item_id === id), least: !!(a && a.least_item_id === id) };
      }),
    };
  });
}

router.get('/:id', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.status(404).render('pages/admin/users', { title: 'Collaborateurs', active: 'users', users: [], flash: 'Collaborateur introuvable.' });
  const attempt = getAttemptByUser(user.id);
  const scores = attempt && attempt.scores_json ? parseJSON(attempt.scores_json, null) : null;
  const profile = attempt && attempt.profile_key ? db.prepare('SELECT * FROM profiles WHERE key = ?').get(attempt.profile_key) : null;
  res.render('pages/admin/user-detail', {
    title: `${user.first_name} ${user.last_name}`.trim(), active: 'users',
    user, attempt, scores, profile,
    dims: scores ? disc.orderedDims(scores.norm) : null,
    color: attempt && attempt.profile_key ? disc.profileColor(attempt.profile_key, scores && scores.norm) : null,
    expression: attempt && attempt.profile_key ? disc.profileExpression(attempt.profile_key) : 'neutral',
    inviteUrl: inviteUrl(req, user),
    answers: answersDetail(attempt),
    created: req.query.created === '1',
    flash: req.query.msg || null,
    errors: [],
    values: { first_name: user.first_name, last_name: user.last_name, email: user.email, show_in_team: user.show_in_team },
    isSelf: user.id === req.user.id,
  });
});

router.post('/reset-all', (req, res) => {
  const removed = live.resetAttempts();
  const msg = removed > 1 ? `${removed} passations réinitialisées : tout le monde peut repasser le test.` : `${removed} passation réinitialisée.`;
  res.redirect(`/admin/users?msg=${encodeURIComponent(msg)}`);
});

router.post('/:id', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.redirect('/admin/users');
  const { values, errors } = validateUserForm(req.body, user.id);
  if (errors.length) return res.redirect(`/admin/users/${user.id}?msg=${encodeURIComponent(errors.join(' '))}`);
  db.prepare('UPDATE users SET first_name = ?, last_name = ?, email = ?, show_in_team = ? WHERE id = ?')
    .run(values.first_name, values.last_name, values.email, values.show_in_team, user.id);
  return res.redirect(`/admin/users/${user.id}?msg=${encodeURIComponent('Informations enregistrées.')}`);
});

router.post('/:id/invite', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.redirect('/admin/users');
  db.prepare('UPDATE users SET invite_token = ?, invite_expires_at = ? WHERE id = ?').run(newInviteToken(), Date.now() + INVITE_TTL_MS, user.id);
  return res.redirect(`/admin/users/${user.id}?msg=${encodeURIComponent('Nouveau lien généré (valable 14 jours).')}`);
});

router.post('/:id/reset', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.redirect('/admin/users');
  live.resetAttempts(user.id);
  return res.redirect(`/admin/users/${user.id}?msg=${encodeURIComponent('Réponses réinitialisées : le collaborateur peut repasser le test.')}`);
});

router.post('/:id/delete', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.redirect('/admin/users');
  if (user.id === req.user.id) return res.redirect(`/admin/users/${user.id}?msg=${encodeURIComponent('Impossible de supprimer votre propre compte.')}`);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  return res.redirect(`/admin/users?msg=${encodeURIComponent('Collaborateur supprimé.')}`);
});

/* ----------  Avatar  ---------- */
router.get('/:id/avatar', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.redirect('/admin/users');
  res.render('pages/admin/avatar-builder', {
    title: `Avatar de ${user.first_name}`, active: 'users', user,
    config: AvatarKit.normalizeConfig(parseJSON(user.avatar_json, null)),
    schema: AvatarKit.SCHEMA,
    expressions: AvatarKit.EXPRESSION_LABELS,
  });
});

router.post('/:id/avatar', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Collaborateur introuvable' });
  const config = AvatarKit.normalizeConfig(req.body && req.body.config);
  db.prepare('UPDATE users SET avatar_json = ? WHERE id = ?').run(JSON.stringify(config), user.id);
  return res.json({ ok: true, config });
});

module.exports = router;
