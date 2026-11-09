'use strict';

const express = require('express');
const { publicBaseUrl } = require('../../db');
const live = require('../../live');
const { ACTIONS } = require('../../deck');

const router = express.Router();

router.get('/', (req, res) => res.render('pages/admin/live', {
  title: 'En direct',
  active: 'live',
  screenUrl: `${publicBaseUrl(req)}/live/${live.publicToken()}`,
  linkRenewed: req.query.link === 'new',
  guide: live.groupGuideJson(),
  deck: live.deckConfigJson(),
}));
router.get('/stream', live.subscribe);
router.get('/state', (req, res) => res.json(live.snapshot()));
router.post('/deck', (req, res) => {
  const action = String((req.body || {}).action || '');
  if (!ACTIONS.includes(action)) return res.status(400).json({ error: 'Commande inconnue' });
  live.deck[action]();
  return res.json(live.deck.view());
});
router.post('/link', (req, res) => {
  live.revokePublicLink();
  res.redirect('/admin/live?link=new');
});

module.exports = router;
