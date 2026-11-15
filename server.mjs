// Serveur local du jeu : fichiers statiques + conversation libre avec les PNJ (Claude).
//   npm start  →  http://localhost:5173
// La clé API reste sur ce serveur (variable ANTHROPIC_API_KEY), jamais dans le navigateur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const PORT = process.env.PORT || 5173;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// ---------- Conversation avec un PNJ ----------
const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });

const SYSTEM = `Tu incarnes un personnage non joueur (PNJ) dans « World », une simulation de vie qui se déroule dans le Marais, à Paris (vraies rues, commerces aux noms inventés).

Règles :
- Reste toujours dans ton personnage. Ne mentionne jamais un jeu, une IA, des règles ou des « actions ».
- Réponds en français parlé, naturel et vivant : 1 à 3 phrases courtes, comme un vrai dialogue de rue ou de travail.
- Tu ne sais que ce que ta fiche indique (ton métier, ta situation, ce que tu vois autour de toi).
- Ton ton dépend de ta relation avec la personne (inconnue, connaissance, amie, proche), de ton humeur et de ta situation (faim, fatigue, argent, travail en cours).
- Pour agir dans le monde, utilise uniquement le champ "actions", et seulement avec les actions marquées possibles dans la fiche. Si on te demande quelque chose d'impossible, refuse ou propose autre chose, dans ton rôle.
- Ne prête de l'argent que si vous êtes proches et que ta situation le permet ; la somme ne dépasse jamais le maximum indiqué.
- Si on t'insulte ou te manque de respect, la relation baisse (relation_moins). Si l'échange est agréable, elle peut monter (relation_plus).
- Une action "aller_quelque_part" n'a de sens que si tu décides vraiment de partir maintenant.
- Pour les actions sans somme, mets amount à 0 ; sans lieu, mets place à "aucun".
- Si la fiche indique un "sujet_choisi_par_le_joueur", réponds sur ce sujet.
- Dans "suggestions", propose 2 ou 3 réponses courtes et variées que le joueur pourrait te dire ensuite.`;

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Ce que dit le PNJ, en français.' },
    emotion: { type: 'string', enum: ['joyeux', 'neutre', 'triste', 'agace', 'surpris', 'gene'] },
    suggestions: {
      type: 'array',
      description: '2 ou 3 réponses courtes (moins de 8 mots) que le joueur pourrait dire ensuite, à la première personne.',
      items: { type: 'string' },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['relation_plus', 'relation_moins', 'donner_tuyau', 'preter_argent', 'recommander', 'inviter_dejeuner', 'aller_quelque_part'],
          },
          amount: { type: 'integer' },
          place: { type: 'string', enum: ['aucun', 'cafe', 'boulangerie', 'superette', 'maison', 'travail', 'parc'] },
        },
        required: ['type', 'amount', 'place'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'emotion', 'suggestions', 'actions'],
  additionalProperties: false,
};

function buildPrompt({ card, history, message }) {
  const lines = (history || []).slice(-10).map(h => `${h.from === 'player' ? card.joueur : card.nom} : ${h.text}`);
  return `FICHE DE TON PERSONNAGE
${JSON.stringify(card, null, 2)}

CONVERSATION JUSQU'ICI
${lines.length ? lines.join('\n') : '(début de la conversation)'}

${card.joueur} te dit maintenant : « ${message} »

Réponds en tant que ${card.nom}.`;
}

async function chat(body) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(body) }],
  });
  if (response.stop_reason === 'refusal') {
    return { reply: 'Euh… je préfère qu’on parle d’autre chose.', emotion: 'gene', actions: [] };
  }
  const text = response.content.find(b => b.type === 'text');
  if (!text) throw new Error('Réponse vide');
  return JSON.parse(text.text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 50_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  let body;
  try { body = await readJson(req); } catch { return send(400, { error: 'bad_request' }); }
  if (!body || !body.card || typeof body.message !== 'string' || body.message.length > 500) return send(400, { error: 'bad_request' });
  try {
    send(200, await chat(body));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || /api key|credentials|auth/i.test(String(err && err.message))) {
      return send(503, { error: 'no_key' }); // pas de clé : le jeu bascule sur les réponses intégrées
    }
    if (err instanceof Anthropic.RateLimitError) return send(429, { error: 'rate_limited' });
    if (err instanceof Anthropic.APIError) return send(502, { error: 'api_error', status: err.status });
    console.error('Conversation PNJ :', err);
    return send(500, { error: 'server_error' });
  }
}

// ---------- Fichiers statiques ----------
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || file.includes('node_modules')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`World -> http://localhost:${PORT}`));
