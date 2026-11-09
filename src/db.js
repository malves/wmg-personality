'use strict';

/**
 * Couche base de données (SQLite via better-sqlite3) : connexion, schéma, seed initial, helpers.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'personality.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ----------  Schéma  ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    first_name        TEXT NOT NULL,
    last_name         TEXT NOT NULL DEFAULT '',
    role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    password_hash     TEXT,
    invite_token      TEXT UNIQUE,
    invite_expires_at INTEGER,
    avatar_json       TEXT,
    show_in_team      INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id   INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    dimension  TEXT NOT NULL CHECK (dimension IN ('D', 'I', 'S', 'C')),
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_items_block ON items(block_id);

  CREATE TABLE IF NOT EXISTS attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    consent_at   TEXT,
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    block_order  TEXT NOT NULL,          -- JSON : [{ blockId, itemIds: [..] }] figé au démarrage
    scores_json  TEXT,                   -- JSON : { raw, norm, plus, minus, answered }
    profile_key  TEXT
  );

  CREATE TABLE IF NOT EXISTS answers (
    attempt_id    INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    block_id      INTEGER NOT NULL,
    most_item_id  INTEGER,
    least_item_id INTEGER,
    most_dim      TEXT,                  -- dimension figée au moment de la réponse
    least_dim     TEXT,
    skipped       INTEGER NOT NULL DEFAULT 0,
    answered_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (attempt_id, block_id)
  );

  CREATE TABLE IF NOT EXISTS profiles (
    key           TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    tagline       TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    strengths     TEXT NOT NULL DEFAULT '',
    watchouts     TEXT NOT NULL DEFAULT '',
    communication TEXT NOT NULL DEFAULT '',
    how_to_work   TEXT NOT NULL DEFAULT '',
    keywords      TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS pair_advice (
    key  TEXT PRIMARY KEY,
    text TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    sess    TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

/* ----------  Réglages  ---------- */
const SETTING_DEFAULTS = {
  app_name: 'Mon profil DISC',
  logo_path: '',
  base_url: process.env.BASE_URL || '',
  shuffle_blocks: '1',
  shuffle_items: '1',
  allow_skip: '0',
  consent_text: require('./seed/profiles').consentText,
  live_token: '',
  live_groups: '[]',
};

const stmtGetSettings = db.prepare('SELECT key, value FROM settings');
const stmtSetSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function getSettings() {
  const out = { ...SETTING_DEFAULTS };
  for (const row of stmtGetSettings.all()) out[row.key] = row.value;
  out.shuffle_blocks = out.shuffle_blocks === '1';
  out.shuffle_items = out.shuffle_items === '1';
  out.allow_skip = out.allow_skip === '1';
  return out;
}

/** URL publique du site : réglage de l'admin, sinon l'hôte de la requête. */
function publicBaseUrl(req) {
  const b = (getSettings().base_url || '').trim().replace(/\/+$/, '');
  return b || `${req.protocol}://${req.get('host')}`;
}

function setSetting(key, value) {
  if (typeof value === 'boolean') value = value ? '1' : '0';
  stmtSetSetting.run(key, value == null ? '' : String(value));
}

/* ----------  Seed initial  ---------- */
function seedIfEmpty() {
  const seedQuestions = require('./seed/questions');
  const { profiles, pairAdvice } = require('./seed/profiles');

  const tx = db.transaction(() => {
    // Questions
    if (db.prepare('SELECT COUNT(*) AS n FROM blocks').get().n === 0) {
      const insBlock = db.prepare('INSERT INTO blocks (sort_order, active) VALUES (?, 1)');
      const insItem = db.prepare('INSERT INTO items (block_id, text, dimension, sort_order) VALUES (?, ?, ?, ?)');
      seedQuestions.forEach((block, i) => {
        const blockId = insBlock.run(i + 1).lastInsertRowid;
        ['D', 'I', 'S', 'C'].forEach((dim, j) => insItem.run(blockId, block[dim], dim, j + 1));
      });
      console.log(`✓ ${seedQuestions.length} blocs de questions insérés`);
    }

    // Profils (insère ceux qui manquent, sans écraser les modifications)
    const insProfile = db.prepare(`INSERT OR IGNORE INTO profiles
      (key, name, tagline, description, strengths, watchouts, communication, how_to_work, keywords)
      VALUES (@key, @name, @tagline, @description, @strengths, @watchouts, @communication, @how_to_work, @keywords)`);
    for (const [key, p] of Object.entries(profiles)) insProfile.run({ key, ...p });

    const insPair = db.prepare('INSERT OR IGNORE INTO pair_advice (key, text) VALUES (?, ?)');
    for (const [key, text] of Object.entries(pairAdvice)) insPair.run(key, text);

    // Réglages par défaut
    const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) insSetting.run(key, value);
  });
  tx();

  // Admin initial
  const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  if (adminCount === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
    db.prepare(`INSERT INTO users (email, first_name, last_name, role, password_hash, show_in_team)
                VALUES (?, 'Admin', '', 'admin', ?, 0)`)
      .run(email, bcrypt.hashSync(password, 10));
    console.log('');
    console.log('👤 Compte administrateur créé :');
    console.log(`   Email        : ${email}`);
    console.log(`   Mot de passe : ${password}`);
    console.log('');
  }
}

/* ----------  Helpers utilisateurs  ---------- */
const stmtUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtAttemptByUser = db.prepare('SELECT * FROM attempts WHERE user_id = ?');

function getUserById(id) { return stmtUserById.get(id); }
function getUserByEmail(email) { return stmtUserByEmail.get(String(email || '').trim().toLowerCase()); }
function getAttemptByUser(userId) { return stmtAttemptByUser.get(userId); }

function parseJSON(text, fallback) {
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function newInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

const INVITE_TTL_MS = 14 * 24 * 3600 * 1000;

module.exports = {
  db, DATA_DIR, UPLOAD_DIR, INVITE_TTL_MS,
  getSettings, publicBaseUrl, setSetting, seedIfEmpty,
  getUserById, getUserByEmail, getAttemptByUser, parseJSON, newInviteToken,
};
