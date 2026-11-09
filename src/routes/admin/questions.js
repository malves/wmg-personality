'use strict';

const express = require('express');
const { db } = require('../../db');
const disc = require('../../disc');

const router = express.Router();

function loadBlocks() {
  const blocks = db.prepare('SELECT * FROM blocks ORDER BY sort_order, id').all();
  const items = db.prepare('SELECT * FROM items ORDER BY block_id, sort_order, id').all();
  return blocks.map((b, idx) => {
    const its = items.filter((i) => i.block_id === b.id);
    const dims = its.map((i) => i.dimension);
    const missing = disc.ORDER.filter((d) => !dims.includes(d));
    const dup = dims.filter((d, i) => dims.indexOf(d) !== i);
    const warnings = [];
    if (its.length !== 4) warnings.push(`${its.length} item(s) au lieu de 4`);
    if (missing.length) warnings.push(`dimension(s) absente(s) : ${missing.join(', ')}`);
    if (dup.length) warnings.push(`dimension(s) en double : ${[...new Set(dup)].join(', ')}`);
    if (its.some((i) => !i.text.trim())) warnings.push('texte vide');
    return { ...b, index: idx + 1, items: its, warnings };
  });
}

function renumber() {
  const ids = db.prepare('SELECT id FROM blocks ORDER BY sort_order, id').all().map((r) => r.id);
  const upd = db.prepare('UPDATE blocks SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => upd.run(i + 1, id)))();
}

router.get('/', (req, res) => {
  const blocks = loadBlocks();
  res.render('pages/admin/questions', {
    title: 'Questions', active: 'questions', blocks,
    activeCount: blocks.filter((b) => b.active).length,
    flash: req.query.msg || null,
  });
});

router.post('/', (req, res) => {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM blocks').get().m;
  const info = db.prepare('INSERT INTO blocks (sort_order, active) VALUES (?, 1)').run(max + 1);
  const ins = db.prepare('INSERT INTO items (block_id, text, dimension, sort_order) VALUES (?, ?, ?, ?)');
  disc.ORDER.forEach((d, i) => ins.run(info.lastInsertRowid, '', d, i + 1));
  res.redirect(`/admin/questions?msg=${encodeURIComponent('Bloc ajouté : complète ses 4 items.')}#block-${info.lastInsertRowid}`);
});

router.post('/reorder', (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(400).json({ error: 'Liste vide' });
  const upd = db.prepare('UPDATE blocks SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => upd.run(i + 1, id)))();
  renumber();
  return res.json({ ok: true });
});

router.post('/:id', (req, res) => {
  const id = Number(req.params.id);
  const block = db.prepare('SELECT * FROM blocks WHERE id = ?').get(id);
  if (!block) return res.redirect('/admin/questions');
  const items = req.body.items || {};
  const upd = db.prepare('UPDATE items SET text = ?, dimension = ? WHERE id = ? AND block_id = ?');
  db.transaction(() => {
    for (const [itemId, v] of Object.entries(items)) {
      const dim = disc.ORDER.includes(v.dimension) ? v.dimension : 'D';
      upd.run(String(v.text || '').trim().slice(0, 200), dim, Number(itemId), id);
    }
    db.prepare('UPDATE blocks SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, id);
  })();
  res.redirect(`/admin/questions?msg=${encodeURIComponent('Bloc enregistré.')}#block-${id}`);
});

router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM blocks WHERE id = ?').run(Number(req.params.id));
  renumber();
  res.redirect(`/admin/questions?msg=${encodeURIComponent('Bloc supprimé.')}`);
});

router.post('/:id/move', (req, res) => {
  const id = Number(req.params.id);
  const ids = db.prepare('SELECT id FROM blocks ORDER BY sort_order, id').all().map((r) => r.id);
  const i = ids.indexOf(id);
  const j = req.body.dir === 'up' ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const upd = db.prepare('UPDATE blocks SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((bid, k) => upd.run(k + 1, bid)))();
  }
  res.redirect(`/admin/questions#block-${id}`);
});

module.exports = router;
