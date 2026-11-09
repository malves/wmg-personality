'use strict';

/**
 * Test de personnalité DISC : serveur Express.
 * - Pages collaborateur (mobile) : connexion, accueil, test, résultat, équipe, comparaison.
 * - Administration (desktop) : collaborateurs, avatars, questions, profils, réglages, tableau de bord.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');

const { seedIfEmpty, UPLOAD_DIR, parseJSON } = require('./src/db');
const { sessionMiddleware, loadUser, originCheck, requireUser, requireAdmin } = require('./src/auth');
const AvatarKit = require('./public/js/avatar');
const disc = require('./src/disc');
const { renderRadar, renderDiscWheel } = require('./src/radar');

const app = express();
const PORT = Number(process.env.PORT) || 3020;
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

/* ----------  Vues  ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/app');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

/* Helpers disponibles dans toutes les vues */
app.locals.renderAvatar = AvatarKit.renderAvatar;
app.locals.assetVersion = Date.now().toString(36);
app.locals.renderBlob = AvatarKit.renderBlob;
app.locals.renderRadar = renderRadar;
app.locals.renderDiscWheel = renderDiscWheel;
app.locals.AVATAR_SCHEMA = AvatarKit.SCHEMA;
app.locals.EXPRESSION_LABELS = AvatarKit.EXPRESSION_LABELS;
app.locals.DIMENSIONS = disc.DIMENSIONS;
app.locals.ORDER = disc.ORDER;
app.locals.orderedDims = disc.orderedDims;
app.locals.profileExpression = disc.profileExpression;
app.locals.profileColor = disc.profileColor;
app.locals.parseAvatar = (json) => AvatarKit.normalizeConfig(parseJSON(json, null));
app.locals.lines = (text) => String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
app.locals.keywords = (text) => String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
app.locals.formatDate = (sqlDate) => {
  if (!sqlDate) return '';
  const d = new Date(String(sqlDate).replace(' ', 'T') + (String(sqlDate).endsWith('Z') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};
app.locals.json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

/* ----------  Middlewares  ---------- */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '1h',
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"),
}));
app.use(sessionMiddleware());
app.use(loadUser);
app.use(originCheck);

/* ----------  Routes  ---------- */
app.use('/', require('./src/routes/auth'));
app.use('/', require('./src/routes/liveScreen'));
app.use('/admin', requireAdmin, require('./src/routes/admin'));
app.use('/', requireUser, require('./src/routes/test'));
app.use('/', requireUser, require('./src/routes/app'));

/* ----------  Erreurs  ---------- */
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ error: 'Introuvable' });
  return res.status(404).render('pages/app/error', { title: 'Page introuvable', message: 'Cette page n\'existe pas.', layout: 'layouts/app' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌', err);
  if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: 'Erreur interne' });
  return res.status(500).render('pages/app/error', { title: 'Erreur', message: 'Une erreur est survenue. Réessaie dans un instant.', layout: 'layouts/app' });
});

/* ----------  Démarrage  ---------- */
seedIfEmpty();
app.listen(PORT, () => {
  console.log(`✓ Serveur DISC démarré : http://localhost:${PORT}`);
  console.log(`✓ Administration     : http://localhost:${PORT}/admin`);
});
