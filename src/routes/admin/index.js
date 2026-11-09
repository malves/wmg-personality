'use strict';

const express = require('express');

const router = express.Router();

/* Toutes les pages admin utilisent le layout desktop. */
router.use((req, res, next) => {
  res.locals.isAdminArea = true;
  const render = res.render.bind(res);
  res.render = (view, options, cb) => render(view, { layout: 'layouts/admin', ...(options || {}) }, cb);
  next();
});

router.use('/', require('./dashboard'));
router.use('/live', require('./live'));
router.use('/users', require('./users'));
router.use('/questions', require('./questions'));
router.use('/profiles', require('./profiles'));
router.use('/settings', require('./settings'));

module.exports = router;
