'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getUserById, getAttemptByUser, parseJSON } = require('../db');
const disc = require('../disc');

const router = express.Router();

const stmtProfile = db.prepare('SELECT * FROM profiles WHERE key = ?');
const stmtPair = db.prepare('SELECT text FROM pair_advice WHERE key = ?');

function getProfile(key) { return stmtProfile.get(key) || stmtProfile.get('EQ'); }
function profilesMap() {
  const out = {};
  for (const p of db.prepare('SELECT * FROM profiles').all()) out[p.key] = p;
  return out;
}

/** Données complètes d'un résultat (ou null si le test n'est pas terminé). */
function resultData(user) {
  const attempt = getAttemptByUser(user.id);
  if (!attempt || attempt.status !== 'completed') return null;
  const scores = parseJSON(attempt.scores_json, null);
  if (!scores) return null;
  const profile = getProfile(attempt.profile_key);
  const dims = disc.orderedDims(scores.norm);
  return {
    user, attempt, scores, profile, dims,
    primary: dims[0],
    color: disc.profileColor(attempt.profile_key, scores.norm),
    expression: disc.profileExpression(attempt.profile_key),
  };
}

function renderResult(req, res, user) {
  const isSelf = user.id === req.user.id;
  const data = resultData(user);
  if (!data) {
    if (isSelf) return res.redirect('/test');
    return res.render('pages/app/not-yet', { title: user.first_name, person: user, nav: 'team' });
  }
  return res.render('pages/app/result', { title: isSelf ? 'Mon résultat' : user.first_name, ...data, isSelf, nav: isSelf ? 'result' : 'team' });
}

/* ----------  Accueil  ---------- */
router.get('/', (req, res) => {
  const data = resultData(req.user);
  const attempt = getAttemptByUser(req.user.id);
  res.render('pages/app/home', { title: 'Accueil', nav: 'home', result: data, attempt });
});

/* ----------  Résultat  ---------- */
router.get('/result', (req, res) => renderResult(req, res, req.user));

/* ----------  Équipe  ---------- */
router.get('/team', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.avatar_json, a.status, a.profile_key, a.scores_json
    FROM users u LEFT JOIN attempts a ON a.user_id = u.id
    WHERE u.show_in_team = 1 OR u.id = ?
    ORDER BY (a.status = 'completed') DESC, u.first_name COLLATE NOCASE, u.last_name COLLATE NOCASE
  `).all(req.user.id);
  const profiles = profilesMap();
  const members = rows.map((r) => {
    const scores = parseJSON(r.scores_json, null);
    const done = r.status === 'completed' && scores;
    return {
      ...r,
      done,
      profile: done ? (profiles[r.profile_key] || profiles.EQ) : null,
      color: done ? disc.profileColor(r.profile_key, scores.norm) : null,
      expression: done ? disc.profileExpression(r.profile_key) : 'neutral',
    };
  });
  res.render('pages/app/team', { title: 'Équipe', nav: 'team', members, doneCount: members.filter((m) => m.done).length });
});

router.get('/team/compare/:id', (req, res) => {
  const other = getUserById(Number(req.params.id));
  if (!other || (!other.show_in_team && other.id !== req.user.id)) return res.status(404).render('pages/app/error', { title: 'Introuvable', message: 'Collaborateur introuvable.' });
  if (other.id === req.user.id) return res.redirect('/result');
  const me = resultData(req.user);
  if (!me) return res.redirect('/test');
  const them = resultData(other);
  if (!them) return res.render('pages/app/not-yet', { title: other.first_name, person: other, nav: 'team' });
  const key = disc.pairKey(me.primary, them.primary);
  const advice = (stmtPair.get(key) || {}).text || '';
  res.render('pages/app/compare', { title: `Toi & ${other.first_name}`, nav: 'team', me, them, advice, pairKey: key });
});

router.get('/team/:id', (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user || (!user.show_in_team && user.id !== req.user.id)) return res.status(404).render('pages/app/error', { title: 'Introuvable', message: 'Collaborateur introuvable.' });
  return renderResult(req, res, user);
});

/* ----------  Moi  ---------- */
router.get('/me', (req, res) => {
  res.render('pages/app/me', { title: 'Moi', nav: 'me', error: null, success: req.query.ok === '1' });
});

router.post('/me/password', (req, res) => {
  const current = String(req.body.current || '');
  const password = String(req.body.password || '');
  const password2 = String(req.body.password2 || '');
  const full = getUserById(req.user.id);
  let error = null;
  if (!full.password_hash || !bcrypt.compareSync(current, full.password_hash)) error = 'Mot de passe actuel incorrect.';
  else if (!password) error = 'Choisis un nouveau mot de passe.';
  else if (password !== password2) error = 'Les deux nouveaux mots de passe ne correspondent pas.';
  if (error) return res.status(400).render('pages/app/me', { title: 'Moi', nav: 'me', error, success: false });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.user.id);
  return res.redirect('/me?ok=1');
});

module.exports = router;
module.exports.resultData = resultData;
module.exports.getProfile = getProfile;
module.exports.profilesMap = profilesMap;
