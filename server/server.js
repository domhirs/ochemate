import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? './data/dartboard.db';
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'public'));

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS matches (
    id          TEXT PRIMARY KEY,
    finished_at TEXT NOT NULL,
    payload     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_matches_finished ON matches (finished_at DESC);
`);

const insertMatch = db.prepare('INSERT OR IGNORE INTO matches (id, finished_at, payload) VALUES (?, ?, ?)');
const listMatches = db.prepare('SELECT id, finished_at, payload FROM matches ORDER BY finished_at DESC LIMIT 500');
const deleteMatch = db.prepare('DELETE FROM matches WHERE id = ?');

const MODES = new Set(['x01', 'cricket', 'atc']);

function validMatch(body) {
  if (!body || typeof body !== 'object') return false;
  const { config, darts } = body;
  if (!config || !MODES.has(config.mode)) return false;
  if (!Array.isArray(config.players) || config.players.length < 1 || config.players.length > 8) return false;
  if (!config.players.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 30)) return false;
  if (!Array.isArray(darts) || darts.length > 5000) return false;
  return darts.every(
    (d) => d && Number.isInteger(d.n) && Number.isInteger(d.m) && d.m >= 0 && d.m <= 3 && d.n >= 0 && d.n <= 25,
  );
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/matches', (_req, res) => {
  const rows = listMatches.all().map((r) => ({ ...JSON.parse(r.payload), id: r.id, finishedAt: r.finished_at }));
  res.json(rows);
});

// Idempotent: client supplies the id, retries after network failure are harmless.
app.post('/api/matches', (req, res) => {
  if (!validMatch(req.body)) return res.status(400).json({ error: 'invalid match' });
  const id = typeof req.body.id === 'string' && req.body.id.length <= 64 ? req.body.id : randomUUID();
  const finishedAt = new Date().toISOString();
  const { config, darts } = req.body;
  insertMatch.run(id, finishedAt, JSON.stringify({ config, darts }));
  res.status(201).json({ id, finishedAt });
});

app.delete('/api/matches/:id', (req, res) => {
  deleteMatch.run(req.params.id);
  res.status(204).end();
});

app.use(express.static(STATIC_DIR, { index: 'index.html', setHeaders: (res, path) => {
  // Service worker + manifest must never be cached stale, or updates never reach the tablet.
  if (/(ngsw\.json|ngsw-worker\.js|safety-worker\.js|manifest\.webmanifest|index\.html)$/.test(path)) {
    res.setHeader('Cache-Control', 'no-cache');
  }
} }));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(join(STATIC_DIR, 'index.html'));
});

app.listen(PORT, () => console.log(`dartboard listening on :${PORT}, db ${DB_PATH}`));
