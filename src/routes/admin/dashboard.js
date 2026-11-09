'use strict';

const express = require('express');
const { db, parseJSON } = require('../../db');
const disc = require('../../disc');

const router = express.Router();

router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.role, u.password_hash IS NOT NULL AS active, u.avatar_json,
           a.status, a.profile_key, a.scores_json, a.completed_at, a.started_at
    FROM users u LEFT JOIN attempts a ON a.user_id = u.id
    ORDER BY a.completed_at DESC, a.started_at DESC, u.first_name COLLATE NOCASE
  `).all();
  const profiles = {};
  for (const p of db.prepare('SELECT key, name FROM profiles').all()) profiles[p.key] = p.name;

  const stats = { total: users.length, completed: 0, inProgress: 0, notStarted: 0, pending: 0 };
  const distribution = {};
  const dimSums = { D: 0, I: 0, S: 0, C: 0 };
  for (const u of users) {
    if (u.status === 'completed') {
      stats.completed += 1;
      distribution[u.profile_key] = (distribution[u.profile_key] || 0) + 1;
      const scores = parseJSON(u.scores_json, null);
      if (scores) for (const d of disc.ORDER) dimSums[d] += scores.norm[d];
    } else if (u.status === 'in_progress') stats.inProgress += 1;
    else if (!u.active) stats.pending += 1;
    else stats.notStarted += 1;
  }
  const distributionRows = Object.entries(distribution)
    .map(([key, n]) => ({ key, n, name: profiles[key] || key, color: disc.profileColor(key), chart: disc.DIMENSIONS[disc.primaryOf(key) || 'I'].chart }))
    .sort((a, b) => b.n - a.n);
  const dimAverages = disc.ORDER.map((d) => ({ key: d, ...disc.DIMENSIONS[d], avg: stats.completed ? Math.round(dimSums[d] / stats.completed) : null }));
  const recent = users.filter((u) => u.status === 'completed').slice(0, 8).map((u) => ({ ...u, profileName: profiles[u.profile_key] || u.profile_key, color: disc.profileColor(u.profile_key) }));

  res.render('pages/admin/dashboard', { title: 'Tableau de bord', active: 'dashboard', stats, distributionRows, dimAverages, recent, maxDist: distributionRows[0] ? distributionRows[0].n : 1 });
});

module.exports = router;
