import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { voiceRouter } from './voices.js';

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
  CREATE TABLE IF NOT EXISTS players (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
`);

const insertMatch = db.prepare('INSERT OR IGNORE INTO matches (id, finished_at, payload) VALUES (?, ?, ?)');
const listMatches = db.prepare('SELECT id, finished_at, payload FROM matches ORDER BY finished_at DESC LIMIT 500');
const deleteMatch = db.prepare('DELETE FROM matches WHERE id = ?');

const listPlayers = db.prepare('SELECT id, name, created_at FROM players ORDER BY name');
const insertPlayer = db.prepare('INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)');
const getPlayer = db.prepare('SELECT id, name, created_at FROM players WHERE id = ?');
const renamePlayer = db.prepare('UPDATE players SET name = ? WHERE id = ?');
const deletePlayer = db.prepare('DELETE FROM players WHERE id = ?');

const MODES = new Set(['x01', 'cricket', 'atc']);

const toPlayer = (r) => ({ id: r.id, name: r.name, createdAt: r.created_at });
const cleanName = (v) => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null);
const isUnique = (e) => /UNIQUE/i.test(String(e?.message));

function validMatch(body) {
  if (!body || typeof body !== 'object') return false;
  const { config, darts } = body;
  if (!config || !MODES.has(config.mode)) return false;
  if (!Array.isArray(config.players) || config.players.length < 1 || config.players.length > 8) return false;
  if (!config.players.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 30)) return false;
  // Optional link to saved player profiles, same length and order as players; null = guest.
  if (config.playerIds !== undefined) {
    const ids = config.playerIds;
    if (!Array.isArray(ids) || ids.length !== config.players.length) return false;
    if (!ids.every((id) => id === null || (typeof id === 'string' && id.length > 0 && id.length <= 64))) return false;
  }
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

// Saved player profiles. Stats are never stored: clients derive them by replaying matches.
app.get('/api/players', (_req, res) => res.json(listPlayers.all().map(toPlayer)));

// Idempotent by id, like matches: a retry with the same id and name returns the existing profile.
app.post('/api/players', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'invalid name' });
  const id = typeof req.body.id === 'string' && req.body.id.length > 0 && req.body.id.length <= 64 ? req.body.id : randomUUID();
  const existing = getPlayer.get(id);
  if (existing) return res.status(existing.name.toLowerCase() === name.toLowerCase() ? 200 : 409).json(toPlayer(existing));
  try {
    insertPlayer.run(id, name, new Date().toISOString());
  } catch (e) {
    if (isUnique(e)) return res.status(409).json({ error: 'name taken' });
    throw e;
  }
  res.status(201).json(toPlayer(getPlayer.get(id)));
});

app.patch('/api/players/:id', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'invalid name' });
  if (!getPlayer.get(req.params.id)) return res.status(404).json({ error: 'not found' });
  try {
    renamePlayer.run(name, req.params.id);
  } catch (e) {
    if (isUnique(e)) return res.status(409).json({ error: 'name taken' });
    throw e;
  }
  res.json(toPlayer(getPlayer.get(req.params.id)));
});

// Removes the profile only. Played matches keep their names and ids.
app.delete('/api/players/:id', (req, res) => {
  deletePlayer.run(req.params.id);
  res.status(204).end();
});

app.use('/api/voices', voiceRouter(db));

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

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
