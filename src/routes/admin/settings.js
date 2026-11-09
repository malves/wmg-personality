'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getSettings, setSetting, UPLOAD_DIR, DATA_DIR } = require('../../db');
const { exportDatabase, importDatabase } = require('../../backup');
const live = require('../../live');

const router = express.Router();

const ALLOWED = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}${ALLOWED[file.mimetype] || ''}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

function removeLogoFile(logoPath) {
  if (!logoPath) return;
  const file = path.join(UPLOAD_DIR, path.basename(logoPath));
  if (fs.existsSync(file)) { try { fs.unlinkSync(file); } catch (e) { /* ignore */ } }
}

router.get('/', (req, res) => {
  res.render('pages/admin/settings', { title: 'Réglages', active: 'settings', s: getSettings(), flash: req.query.msg || null });
});

router.post('/', (req, res) => {
  upload.single('logo')(req, res, (err) => {
    if (err) return res.redirect(`/admin/settings?msg=${encodeURIComponent('Logo refusé : image PNG, JPG, WebP ou SVG de 2 Mo maximum.')}`);
    const b = req.body || {};
    setSetting('app_name', String(b.app_name || '').trim().slice(0, 60) || 'Mon profil DISC');
    setSetting('base_url', String(b.base_url || '').trim().replace(/\/+$/, ''));
    setSetting('shuffle_blocks', !!b.shuffle_blocks);
    setSetting('shuffle_items', !!b.shuffle_items);
    setSetting('allow_skip', !!b.allow_skip);
    setSetting('consent_text', String(b.consent_text || '').trim());
    if (req.file) {
      removeLogoFile(getSettings().logo_path);
      setSetting('logo_path', `/uploads/${req.file.filename}`);
    }
    return res.redirect(`/admin/settings?msg=${encodeURIComponent('Réglages enregistrés.')}`);
  });
});

/* ----------  Export / import de la base  ---------- */
router.get('/export', async (req, res, next) => {
  try {
    const file = await exportDatabase();
    const day = new Date().toISOString().slice(0, 10);
    res.download(file, `disc-export-${day}.db`, () => fs.unlink(file, () => {}));
  } catch (e) { next(e); }
});

const importUpload = multer({ dest: DATA_DIR, limits: { fileSize: 100 * 1024 * 1024 } });
router.post('/import', (req, res, next) => {
  const back = (msg) => res.redirect(`/admin/settings?msg=${encodeURIComponent(msg)}`);
  importUpload.single('database')(req, res, async (err) => {
    if (err) return back('Fichier refusé : 100 Mo maximum.');
    if (!req.file) return back('Choisissez le fichier exporté (.db) à importer.');
    if ((req.body || {}).confirm !== 'REMPLACER') {
      fs.unlink(req.file.path, () => {});
      return back('Import annulé : tapez REMPLACER pour confirmer.');
    }
    try {
      const { adminId, counts, backup } = await importDatabase(req.file.path, req.user);
      live.notify();
      const summary = `Base importée : ${counts.users || 0} comptes, ${counts.attempts || 0} passations. Sauvegarde de l'ancienne base : ${path.basename(backup)}.`;
      return req.session.regenerate((e) => {
        if (e) return next(e);
        req.session.userId = adminId;
        return back(summary);
      });
    } catch (e) {
      if (e.userMessage) return back(e.userMessage);
      return next(e);
    } finally {
      fs.unlink(req.file.path, () => {});
    }
  });
});

router.post('/logo/delete', (req, res) => {
  removeLogoFile(getSettings().logo_path);
  setSetting('logo_path', '');
  res.redirect(`/admin/settings?msg=${encodeURIComponent('Logo supprimé.')}`);
});

module.exports = router;
