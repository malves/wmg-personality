'use strict';

/**
 * Export et import de toute la base (comptes, avatars, questions, profils, réglages, passations).
 * L'import remplace le contenu table par table, sur la connexion ouverte : le serveur n'a pas à redémarrer.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { db, DATA_DIR } = require('./db');

/* Ordre d'insertion compatible avec les clés étrangères (l'effacement se fait à l'envers). */
const TABLES = ['users', 'blocks', 'items', 'attempts', 'answers', 'profiles', 'pair_advice', 'settings'];
const REQUIRED = ['users', 'blocks', 'items', 'profiles', 'settings'];
/* Propres à chaque installation : l'adresse du site, le lien secret de la carte et le fichier du logo. */
const KEEP_SETTINGS = ['base_url', 'live_token', 'logo_path'];

const stamp = () => new Date().toISOString().slice(0, 19).replace(/:/g, '-');

/** Copie cohérente de la base, sans les sessions de connexion. Renvoie le chemin du fichier temporaire. */
async function exportDatabase() {
  const file = path.join(DATA_DIR, `export-${stamp()}-${process.pid}.db`);
  await db.backup(file);
  const copy = new Database(file);
  try {
    copy.exec('DELETE FROM sessions; VACUUM;');
    copy.pragma('journal_mode = DELETE');
  } finally {
    copy.close();
  }
  return file;
}

/** Vérifie qu'un fichier est une base de cette application. Renvoie un message d'erreur, ou null. */
function checkImportFile(file) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (head.toString('latin1') !== 'SQLite format 3\0') return 'Ce fichier n\'est pas une base exportée depuis l\'application.';
  let src;
  try {
    src = new Database(file, { readonly: true, fileMustExist: true });
    if (src.pragma('quick_check', { simple: true }) !== 'ok') return 'Ce fichier est endommagé.';
    const tables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));
    const missing = REQUIRED.filter((t) => !tables.has(t));
    if (missing.length) return 'Ce fichier n\'est pas une base exportée depuis l\'application.';
    if (!src.prepare('SELECT COUNT(*) AS n FROM blocks').get().n) return 'Cette base ne contient aucune question.';
    return null;
  } catch (e) {
    return 'Ce fichier n\'a pas pu être lu.';
  } finally {
    if (src) src.close();
  }
}

const columnsOf = (schema, table) => db.prepare(`PRAGMA ${schema}.table_info(${table})`).all().map((c) => c.name);

/**
 * Remplace le contenu de la base par celui du fichier, après en avoir gardé une sauvegarde.
 * L'admin qui importe garde son accès (email et mot de passe actuels) ; les autres comptes admin
 * importés perdent leur mot de passe, pour ne pas ouvrir la production avec des identifiants locaux.
 * Toutes les sessions sont fermées.
 * @returns {{ backup: string, adminId: number, counts: object }}
 */
async function importDatabase(file, importer) {
  const error = checkImportFile(file);
  if (error) throw Object.assign(new Error(error), { userMessage: error });

  const backup = path.join(DATA_DIR, `personality-avant-import-${stamp()}.db`);
  await db.backup(backup);

  const me = db.prepare('SELECT email, first_name, last_name, password_hash FROM users WHERE id = ?').get(importer.id);
  const kept = db.prepare(`SELECT key, value FROM settings WHERE key IN (${KEEP_SETTINGS.map(() => '?').join(',')})`).all(...KEEP_SETTINGS);

  db.prepare('ATTACH DATABASE ? AS src').run(file);
  db.pragma('foreign_keys = OFF');
  try {
    const srcTables = new Set(db.prepare("SELECT name FROM src.sqlite_master WHERE type = 'table'").all().map((t) => t.name));
    const counts = {};
    db.transaction(() => {
      for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM main.${t}`).run();
      db.prepare('DELETE FROM main.sessions').run();
      for (const t of TABLES) {
        if (!srcTables.has(t)) continue;
        const src = new Set(columnsOf('src', t));
        const cols = columnsOf('main', t).filter((c) => src.has(c)).map((c) => `"${c}"`).join(', ');
        counts[t] = db.prepare(`INSERT INTO main.${t} (${cols}) SELECT ${cols} FROM src.${t}`).run().changes;
      }
      const setKept = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const s of kept) setKept.run(s.key, s.value);

      db.prepare("UPDATE users SET password_hash = NULL WHERE role = 'admin' AND email <> ?").run(me.email);
      const same = db.prepare('SELECT id FROM users WHERE email = ?').get(me.email);
      if (same) db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?").run(me.password_hash, same.id);
      else {
        db.prepare("INSERT INTO users (email, first_name, last_name, role, password_hash, show_in_team) VALUES (?, ?, ?, 'admin', ?, 0)")
          .run(me.email, me.first_name, me.last_name, me.password_hash);
      }
      const bad = db.pragma('foreign_key_check');
      if (bad.length) throw Object.assign(new Error('foreign keys'), { userMessage: 'Cette base contient des données incohérentes : import annulé.' });
    })();
    const adminId = db.prepare('SELECT id FROM users WHERE email = ?').get(me.email).id;
    return { backup, adminId, counts };
  } finally {
    db.pragma('foreign_keys = ON');
    db.prepare('DETACH DATABASE src').run();
  }
}

module.exports = { exportDatabase, importDatabase, checkImportFile };
