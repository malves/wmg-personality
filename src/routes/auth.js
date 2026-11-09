'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getUserByEmail } = require('../db');
const { loginLimiter, loginFailed, loginSucceeded } = require('../auth');

const router = express.Router();

function homeFor(user) { return user.role === 'admin' ? '/admin' : '/'; }

function startSession(req, res, user, redirectTo) {
  const returnTo = req.session.returnTo;
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Erreur de session');
    req.session.userId = user.id;
    return req.session.save(() => res.redirect(redirectTo || returnTo || homeFor(user)));
  });
}

/* ----------  Connexion  ---------- */
router.get('/login', (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  return res.render('pages/app/login', { title: 'Connexion', error: null, email: '', hideNav: true });
});

router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = getUserByEmail(email);
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    loginFailed(req);
    return res.status(401).render('pages/app/login', { title: 'Connexion', error: 'Email ou mot de passe incorrect.', email, hideNav: true });
  }
  loginSucceeded(req);
  return startSession(req, res, user);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('disc.sid');
    res.redirect('/login');
  });
});

/* ----------  Invitation  ---------- */
function findInvite(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const user = db.prepare('SELECT * FROM users WHERE invite_token = ?').get(token);
  if (!user || !user.invite_expires_at || user.invite_expires_at < Date.now()) return null;
  return user;
}

router.get('/invite/:token', (req, res) => {
  const user = findInvite(req.params.token);
  if (!user) return res.status(404).render('pages/app/invite', { title: 'Invitation', invalid: true, invitee: null, error: null, hideNav: true });
  return res.render('pages/app/invite', { title: 'Bienvenue', invalid: false, invitee: user, error: null, hideNav: true });
});

router.post('/invite/:token', (req, res) => {
  const user = findInvite(req.params.token);
  if (!user) return res.status(404).render('pages/app/invite', { title: 'Invitation', invalid: true, invitee: null, error: null, hideNav: true });
  const password = String(req.body.password || '');
  const password2 = String(req.body.password2 || '');
  let error = null;
  if (!password) error = 'Choisis un mot de passe.';
  else if (password !== password2) error = 'Les deux mots de passe ne correspondent pas.';
  if (error) return res.status(400).render('pages/app/invite', { title: 'Bienvenue', invalid: false, invitee: user, error, hideNav: true });

  db.prepare('UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires_at = NULL WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), user.id);
  return startSession(req, res, user, '/');
});

module.exports = router;
