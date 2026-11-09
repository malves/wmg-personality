'use strict';

const express = require('express');
const { db } = require('../../db');
const disc = require('../../disc');

const router = express.Router();

const FIELDS = ['name', 'tagline', 'keywords', 'description', 'strengths', 'watchouts', 'communication', 'how_to_work'];

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM profiles').all();
  const byKey = {};
  for (const r of rows) byKey[r.key] = r;
  const profiles = disc.PROFILE_KEYS.map((key) => ({
    ...(byKey[key] || { key, name: key }),
    color: disc.profileColor(key),
    primary: disc.primaryOf(key),
    label: key === 'EQ' ? 'Profil équilibré' : key.split('').map((d) => disc.DIMENSIONS[d].name).join(' + '),
  }));
  const pairs = {};
  for (const p of db.prepare('SELECT * FROM pair_advice').all()) pairs[p.key] = p.text;
  const pairRows = disc.PAIR_KEYS.map((key) => ({ key, text: pairs[key] || '', a: disc.DIMENSIONS[key[0]], b: disc.DIMENSIONS[key[1]] }));
  res.render('pages/admin/profiles', { title: 'Profils', active: 'profiles', profiles, pairRows, flash: req.query.msg || null, open: req.query.open || null });
});

router.post('/pairs/:key', (req, res) => {
  const key = String(req.params.key);
  if (!disc.PAIR_KEYS.includes(key)) return res.redirect('/admin/profiles');
  db.prepare('INSERT INTO pair_advice (key, text) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET text = excluded.text')
    .run(key, String(req.body.text || '').trim());
  res.redirect(`/admin/profiles?msg=${encodeURIComponent('Conseil enregistré.')}&open=pairs#pairs`);
});

router.post('/:key', (req, res) => {
  const key = String(req.params.key);
  if (!disc.PROFILE_KEYS.includes(key)) return res.redirect('/admin/profiles');
  const values = {};
  for (const f of FIELDS) values[f] = String(req.body[f] || '').trim();
  if (!values.name) values.name = key;
  db.prepare(`INSERT INTO profiles (key, name, tagline, keywords, description, strengths, watchouts, communication, how_to_work)
              VALUES (@key, @name, @tagline, @keywords, @description, @strengths, @watchouts, @communication, @how_to_work)
              ON CONFLICT(key) DO UPDATE SET name = excluded.name, tagline = excluded.tagline, keywords = excluded.keywords,
              description = excluded.description, strengths = excluded.strengths, watchouts = excluded.watchouts,
              communication = excluded.communication, how_to_work = excluded.how_to_work`)
    .run({ key, ...values });
  res.redirect(`/admin/profiles?msg=${encodeURIComponent('Profil enregistré.')}&open=${key}#profile-${key}`);
});

module.exports = router;
