'use strict';

/**
 * Serveur MCP distant (transport « Streamable HTTP ») monté sur /mcp.
 *
 * À ajouter directement dans Claude comme connecteur par URL :
 *   https://seminaire.kleekr.com/mcp?key=LE_JETON
 *
 * L'accès est protégé par MCP_TOKEN (variable d'environnement), accepté soit dans l'URL
 * (?key=…), soit en en-tête « Authorization: Bearer … ». Sans MCP_TOKEN défini, l'endpoint
 * répond 503 : le MCP est donc désactivé par défaut.
 *
 * Tourne dans le process de l'app : les outils lisent la base directement et pilotent la même
 * instance de présentation que les écrans connectés (voir src/live.js).
 *
 * Le SDK MCP est en ESM ; on le charge par import() dynamique depuis ce module CommonJS.
 */

const express = require('express');
const crypto = require('crypto');
const {
  db, getUserById, getAttemptByUser, parseJSON, getSettings,
} = require('../db');
const disc = require('../disc');
const live = require('../live');
const { ACTIONS } = require('../deck');

const router = express.Router();

/* ----------  Authentification par jeton (URL ?key= ou en-tête Bearer)  ---------- */
function tokenValid(req) {
  const expected = Buffer.from(process.env.MCP_TOKEN || '');
  const fromHeader = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const given = Buffer.from(String(req.query.key || req.query.token || fromHeader || ''));
  return expected.length > 0 && expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/* ----------  Données (lecture)  ---------- */
const stmtProfile = db.prepare('SELECT * FROM profiles WHERE key = ?');
const stmtPair = db.prepare('SELECT text FROM pair_advice WHERE key = ?');

function profileSummary(p) {
  if (!p) return null;
  return {
    key: p.key, name: p.name, tagline: p.tagline,
    keywords: String(p.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
  };
}

function resultOf(user) {
  const attempt = getAttemptByUser(user.id);
  if (!attempt || attempt.status !== 'completed') return null;
  const scores = parseJSON(attempt.scores_json, null);
  if (!scores) return null;
  const profile = stmtProfile.get(attempt.profile_key) || stmtProfile.get('EQ');
  const dims = disc.orderedDims(scores.norm);
  return {
    completedAt: attempt.completed_at,
    primary: dims[0],
    order: dims,
    scores: Object.fromEntries(disc.ORDER.map((d) => [d, Math.round(scores.norm[d])])),
    profile: profileSummary(profile),
  };
}

function listCollaborators() {
  const rows = db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.show_in_team,
           u.password_hash IS NOT NULL AS active, u.invite_token, u.invite_expires_at,
           a.status, a.profile_key, a.completed_at
    FROM users u LEFT JOIN attempts a ON a.user_id = u.id
    ORDER BY u.role DESC, u.first_name COLLATE NOCASE, u.last_name COLLATE NOCASE
  `).all();
  const base = (getSettings().base_url || `http://localhost:${process.env.PORT || 3020}`).replace(/\/+$/, '');
  return rows.map((u) => ({
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    role: u.role,
    showInTeam: !!u.show_in_team,
    active: !!u.active,
    testStatus: u.status || 'none',
    profileKey: u.status === 'completed' ? u.profile_key : null,
    completedAt: u.completed_at || null,
    inviteLink: (!u.active && u.invite_token && u.invite_expires_at > Date.now())
      ? `${base}/invite/${u.invite_token}` : null,
  }));
}

function compareUsers(idA, idB) {
  const a = getUserById(idA);
  const b = getUserById(idB);
  if (!a || !b) throw new Error('Collaborateur introuvable.');
  const ra = resultOf(a);
  const rb = resultOf(b);
  if (!ra || !rb) throw new Error('Les deux personnes doivent avoir terminé le test.');
  const key = disc.pairKey(ra.primary, rb.primary);
  return {
    a: { id: a.id, firstName: a.first_name, ...ra },
    b: { id: b.id, firstName: b.first_name, ...rb },
    pairKey: key,
    advice: (stmtPair.get(key) || {}).text || '',
  };
}

function liveSnapshot() {
  const snap = live.snapshot();
  return {
    state: snap.state,
    counts: snap.counts,
    groups: snap.groups.map((g) => ({ id: g.id, name: g.name, members: g.members })),
    alone: snap.alone,
    feed: snap.feed,
  };
}

/* ----------  Construction du serveur MCP (SDK ESM chargé à la volée)  ---------- */
let sdkPromise = null;
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const [{ McpServer }, { StreamableHTTPServerTransport }, zod] = await Promise.all([
        import('@modelcontextprotocol/sdk/server/mcp.js'),
        import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
        import('zod'),
      ]);
      return { McpServer, StreamableHTTPServerTransport, z: zod.z };
    })();
  }
  return sdkPromise;
}

const asJson = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const asError = (e) => ({ isError: true, content: [{ type: 'text', text: `Erreur : ${e.message}` }] });

/** Un serveur neuf par requête : recommandé pour le mode « stateless » du transport HTTP. */
function buildServer({ McpServer, z }) {
  const server = new McpServer({ name: 'wmg-personality', version: '1.2.0' });

  server.registerTool('list_collaborators', {
    title: 'Lister les collaborateurs',
    description: "Liste tous les comptes : état du compte, avancement du test, profil, et lien d'invitation encore valide le cas échéant.",
    inputSchema: {},
  }, async () => { try { return asJson(listCollaborators()); } catch (e) { return asError(e); } });

  server.registerTool('get_result', {
    title: "Résultat d'un collaborateur",
    description: 'Résultat DISC (profil, dimension dominante, scores) pour un collaborateur identifié par son id.',
    inputSchema: { id: z.number().int().positive().describe('Identifiant du collaborateur') },
  }, async ({ id }) => {
    try {
      const user = getUserById(id);
      if (!user) throw new Error('Collaborateur introuvable.');
      return asJson({
        user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email },
        completed: !!resultOf(user), result: resultOf(user),
      });
    } catch (e) { return asError(e); }
  });

  server.registerTool('compare_collaborators', {
    title: 'Comparer deux collaborateurs',
    description: 'Compare deux personnes ayant terminé le test : profils, couple de dimensions et conseil de collaboration.',
    inputSchema: {
      idA: z.number().int().positive().describe('Identifiant de la 1re personne'),
      idB: z.number().int().positive().describe('Identifiant de la 2e personne'),
    },
  }, async ({ idA, idB }) => { try { return asJson(compareUsers(idA, idB)); } catch (e) { return asError(e); } });

  server.registerTool('live_snapshot', {
    title: 'Photo du live',
    description: 'État de la session en direct : avancement (counts), groupes et membres, personnes seules, dernières réponses.',
    inputSchema: {},
  }, async () => { try { return asJson(liveSnapshot()); } catch (e) { return asError(e); } });

  server.registerTool('presentation_state', {
    title: 'État de la présentation',
    description: "Indique si la présentation est active et, si oui, la diapositive courante.",
    inputSchema: {},
  }, async () => { try { return asJson(live.deck.view()); } catch (e) { return asError(e); } });

  server.registerTool('presentation_control', {
    title: 'Piloter la présentation',
    description: "Pilote la présentation projetée. `start` démarre, `next`/`prev` changent de diapositive, `stop` revient à la carte.",
    inputSchema: { action: z.enum(['start', 'next', 'prev', 'stop']).describe('Commande à exécuter') },
  }, async ({ action }) => {
    try {
      if (!ACTIONS.includes(action)) throw new Error(`Commande inconnue. Attendu : ${ACTIONS.join(', ')}.`);
      live.deck[action]();
      return asJson(live.deck.view());
    } catch (e) { return asError(e); }
  });

  return server;
}

/* ----------  Endpoint HTTP  ---------- */
const jsonRpcError = (code, message) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

router.use((req, res, next) => {
  if (!process.env.MCP_TOKEN) return res.status(503).json(jsonRpcError(-32000, 'MCP désactivé : définir MCP_TOKEN côté serveur.'));
  if (!tokenValid(req)) return res.status(401).json(jsonRpcError(-32001, 'Jeton MCP invalide.'));
  return next();
});

router.post('/', async (req, res) => {
  try {
    const sdk = await loadSdk();
    const server = buildServer(sdk);
    const transport = new sdk.StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) res.status(500).json(jsonRpcError(-32603, `Erreur interne : ${e.message}`));
  }
});

// En mode stateless, pas de flux serveur->client hors réponse : GET/DELETE non supportés.
router.get('/', (req, res) => res.status(405).json(jsonRpcError(-32000, 'Method Not Allowed.')));
router.delete('/', (req, res) => res.status(405).json(jsonRpcError(-32000, 'Method Not Allowed.')));

module.exports = router;
