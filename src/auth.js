'use strict';

/**
 * Sessions (store SQLite), chargement de l'utilisateur courant, gardes d'accès,
 * vérification d'origine sur les écritures et limitation des tentatives de connexion.
 */

const path = require('path');
const session = require('express-session');
const { db, getUserById, getSettings } = require('./db');

const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;

class SqliteStore extends session.Store {
  constructor() {
    super();
    this.stGet = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?');
    this.stSet = db.prepare('INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires');
    this.stDel = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.stTouch = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.stClean = db.prepare('DELETE FROM sessions WHERE expires < ?');
    const timer = setInterval(() => { try { this.stClean.run(Date.now()); } catch (e) { /* ignore */ } }, 15 * 60 * 1000);
    if (timer.unref) timer.unref();
  }
  expiresOf(sess) {
    const e = sess && sess.cookie && sess.cookie.expires;
    const t = e ? new Date(e).getTime() : Date.now() + SESSION_TTL_MS;
    return Number.isFinite(t) ? t : Date.now() + SESSION_TTL_MS;
  }
  get(sid, cb) {
    try {
      const row = this.stGet.get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      return cb(null, JSON.parse(row.sess));
    } catch (e) { return cb(e); }
  }
  set(sid, sess, cb) {
    try { this.stSet.run(sid, JSON.stringify(sess), this.expiresOf(sess)); cb && cb(null); } catch (e) { cb && cb(e); }
  }
  destroy(sid, cb) {
    try { this.stDel.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }
  touch(sid, sess, cb) {
    try { this.stTouch.run(this.expiresOf(sess), sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }
}

function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  SESSION_SECRET non défini : définissez-le en production.');
  }
  return session({
    name: 'disc.sid',
    secret: secret || 'dev-secret-a-changer',
    store: new SqliteStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.TRUST_PROXY === '1',
      maxAge: SESSION_TTL_MS,
    },
  });
}

/** Charge l'utilisateur courant et les réglages dans req/res.locals. */
function loadUser(req, res, next) {
  req.user = null;
  if (req.session && req.session.userId) {
    const u = getUserById(req.session.userId);
    if (u) {
      delete u.password_hash;
      delete u.invite_token;
      req.user = u;
    } else {
      req.session.userId = null;
    }
  }
  res.locals.currentUser = req.user;
  res.locals.settings = getSettings();
  res.locals.appName = res.locals.settings.app_name || 'DISC';
  res.locals.path = req.path;
  next();
}

function isApi(req) { return req.originalUrl.startsWith('/api/'); }

/**
 * Retient la page demandée pour y revenir après connexion.
 * Ignore les fichiers (favicon, images) et les URL qui sortiraient du site (//hote, /\\hote).
 */
function rememberReturnTo(req) {
  if (req.method !== 'GET' || path.extname(req.path)) return;
  if (/^\/[^/\\]/.test(req.originalUrl) || req.originalUrl === '/') req.session.returnTo = req.originalUrl;
}

function requireUser(req, res, next) {
  if (req.user) return next();
  if (isApi(req)) return res.status(401).json({ error: 'Non connecté' });
  rememberReturnTo(req);
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (isApi(req)) return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
  if (!req.user) { rememberReturnTo(req); return res.redirect('/login'); }
  return res.status(403).render('pages/app/error', { title: 'Accès refusé', message: 'Cette page est réservée à l\'administrateur.', layout: 'layouts/app' });
}

/** Refuse les écritures dont l'origine (Origin / Referer) ne correspond pas à l'hôte. */
function originCheck(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return next();
  let host;
  try { host = new URL(origin).host; } catch (e) { host = null; }
  const forwarded = process.env.TRUST_PROXY === '1' ? (req.get('x-forwarded-host') || '').split(',')[0].trim() : '';
  if (host !== (forwarded || req.get('host'))) {
    if (isApi(req)) return res.status(403).json({ error: 'Origine invalide' });
    return res.status(403).send('Origine de la requête invalide.');
  }
  return next();
}

/**
 * Limiteur simple en mémoire : 5 échecs par 10 minutes pour un couple IP + email.
 * L'email évite de bloquer tout un bureau derrière une même IP publique.
 */
const attempts = new Map();
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

function limiterKey(req) {
  return `${req.ip || 'unknown'}|${String((req.body && req.body.email) || '').trim().toLowerCase()}`;
}

function loginLimiter(req, res, next) {
  const key = limiterKey(req);
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) { entry = { first: now, count: 0 }; attempts.set(key, entry); }
  if (entry.count >= LIMIT) {
    const minutes = Math.ceil((entry.first + WINDOW_MS - now) / 60000);
    return res.status(429).render('pages/app/login', {
      title: 'Connexion', layout: 'layouts/app',
      error: `Trop de tentatives. Réessaie dans ${minutes} min.`, email: req.body.email || '', hideNav: true,
    });
  }
  req.loginAttempt = entry;
  return next();
}
function loginFailed(req) { if (req.loginAttempt) req.loginAttempt.count += 1; }
function loginSucceeded(req) { attempts.delete(limiterKey(req)); }

module.exports = { sessionMiddleware, loadUser, requireUser, requireAdmin, originCheck, loginLimiter, loginFailed, loginSucceeded };
