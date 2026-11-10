#!/usr/bin/env node
/**
 * Serveur MCP « WMG Personality ».
 *
 * Client HTTP léger : il ne touche PAS directement la base. Il parle à l'app en cours d'exécution
 * via le routeur /mcp (jeton Bearer). C'est indispensable pour le live, dont l'état et les écrans
 * connectés vivent dans la mémoire du serveur web.
 *
 * Configuration par variables d'environnement :
 *   APP_URL    URL de base de l'app      (défaut : http://localhost:3020)
 *   MCP_TOKEN  jeton partagé avec le serveur (obligatoire ; = MCP_TOKEN côté app)
 *
 * Portée : LECTURE SEULE pour les données + pilotage de la présentation (start/next/prev/stop).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const APP_URL = (process.env.APP_URL || 'http://localhost:3020').replace(/\/+$/, '');
const MCP_TOKEN = process.env.MCP_TOKEN || '';

if (!MCP_TOKEN) {
  console.error('[wmg-personality-mcp] MCP_TOKEN manquant : définis-le (identique côté serveur).');
  process.exit(1);
}

/** Appelle le routeur /mcp de l'app et renvoie le JSON, ou lève une erreur lisible. */
async function call(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${APP_URL}/mcp${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${MCP_TOKEN}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(`App injoignable sur ${APP_URL} (le serveur est-il démarré ?) : ${e.message}`);
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Enveloppe une réponse JSON pour un outil MCP. */
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: `Erreur : ${e.message}` }] });

const server = new McpServer({ name: 'wmg-personality', version: '1.0.0' });

/* ----------  Lecture : collaborateurs  ---------- */
server.registerTool(
  'list_collaborators',
  {
    title: 'Lister les collaborateurs',
    description: "Liste tous les comptes (admin + collaborateurs) : état du compte, avancement du test, profil, et lien d'invitation encore valide le cas échéant.",
    inputSchema: {},
  },
  async () => {
    try { return ok(await call('/collaborators')); } catch (e) { return fail(e); }
  },
);

/* ----------  Lecture : résultat d'une personne  ---------- */
server.registerTool(
  'get_result',
  {
    title: "Résultat d'un collaborateur",
    description: "Résultat DISC d'un collaborateur (profil, dimension dominante, scores). `id` = identifiant renvoyé par list_collaborators.",
    inputSchema: { id: z.number().int().positive().describe('Identifiant du collaborateur') },
  },
  async ({ id }) => {
    try { return ok(await call(`/result/${id}`)); } catch (e) { return fail(e); }
  },
);

/* ----------  Lecture : comparaison  ---------- */
server.registerTool(
  'compare_collaborators',
  {
    title: 'Comparer deux collaborateurs',
    description: 'Compare deux personnes ayant terminé le test : profils, couple de dimensions et conseil de collaboration associé.',
    inputSchema: {
      idA: z.number().int().positive().describe('Identifiant de la 1re personne'),
      idB: z.number().int().positive().describe('Identifiant de la 2e personne'),
    },
  },
  async ({ idA, idB }) => {
    try { return ok(await call(`/compare/${idA}/${idB}`)); } catch (e) { return fail(e); }
  },
);

/* ----------  Lecture : photo du live + groupes  ---------- */
server.registerTool(
  'live_snapshot',
  {
    title: 'Photo du live',
    description: "État de la session en direct : avancement global (counts), groupes formés et leurs membres, personnes seules, et flux des dernières réponses.",
    inputSchema: {},
  },
  async () => {
    try { return ok(await call('/live')); } catch (e) { return fail(e); }
  },
);

/* ----------  Action : pilotage de la présentation  ---------- */
server.registerTool(
  'presentation_state',
  {
    title: 'État de la présentation',
    description: "Indique si la présentation (« Démarrer l'explication ») est active et, si oui, la diapositive courante.",
    inputSchema: {},
  },
  async () => {
    try { return ok(await call('/presentation')); } catch (e) { return fail(e); }
  },
);

server.registerTool(
  'presentation_control',
  {
    title: 'Piloter la présentation',
    description: "Pilote la présentation projetée sur les écrans connectés. `start` la démarre, `next`/`prev` changent de diapositive (avancer au-delà de la dernière la termine), `stop` revient à la carte.",
    inputSchema: {
      action: z.enum(['start', 'next', 'prev', 'stop']).describe('Commande à exécuter'),
    },
  },
  async ({ action }) => {
    try { return ok(await call('/presentation', { method: 'POST', body: { action } })); } catch (e) { return fail(e); }
  },
);

/* ----------  Démarrage  ---------- */
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[wmg-personality-mcp] prêt — app : ${APP_URL}`);
