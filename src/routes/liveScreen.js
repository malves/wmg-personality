'use strict';

/**
 * Carte plein écran accessible sans compte, avec le jeton secret du lien.
 * Elle ne reçoit que la vue publique de l'état du test (voir groups.publicView).
 */

const express = require('express');
const live = require('../live');

const router = express.Router();

router.param('token', (req, res, next, token) => {
  if (!live.tokenIsValid(token)) return next('route');
  res.set({ 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  return next();
});

/* `presenter` n'active que le clavier de la page : les commandes restent réservées à l'admin côté serveur. */
router.get('/live/:token', (req, res) => res.render('pages/live-screen', {
  layout: false,
  token: req.params.token,
  guide: live.groupGuideJson(),
  deck: live.deckConfigJson(),
  presenter: !!req.user && req.user.role === 'admin',
}));
router.get('/live/:token/stream', (req, res) => live.subscribe(req, res, { isPublic: true }));

/* Jeton inconnu ou révoqué : message clair plutôt qu'une page de connexion. */
router.use('/live', (req, res) => res.status(404).render('pages/app/error', {
  title: 'Lien invalide',
  message: 'Ce lien n\'est plus valide. Demandez le nouveau lien à l\'administrateur.',
  layout: 'layouts/app',
}));

module.exports = router;
