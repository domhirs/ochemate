import express from 'express';
import { uploadsSetting } from './voices.js';

// Export/import of players and match history as one JSON file. Voices and device settings are not part of it.
// Import replaces everything and is destructive without auth, so it is bounded: body size, item counts, full
// validation before the first write, one transaction, and an env switch (DATA_IMPORT=off) that disables it.
const FORMAT = 'ochemate-export';
const VERSION = 1;
const MAX_BODY = '10mb';
const MAX_PLAYERS = 1000;
const MAX_MATCHES = 20000;

/** Same on/off parsing as VOICE_UPLOADS: unset means on (LAN default), anything unclear counts as off. */
export const importSetting = (raw = process.env.DATA_IMPORT) => uploadsSetting(raw);

const validId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;
const validDate = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** Returns an error text, or null when the file can be imported as is. */
function check(file, { validMatch, cleanName }) {
  if (!file || typeof file !== 'object' || file.format !== FORMAT) return 'not an export file';
  if (file.version !== VERSION) return `unsupported version ${file.version}`;
  if (!Array.isArray(file.players) || file.players.length > MAX_PLAYERS) return 'invalid players';
  if (!Array.isArray(file.matches) || file.matches.length > MAX_MATCHES) return 'invalid matches';

  const ids = new Set();
  const names = new Set();
  for (const p of file.players) {
    if (!p || !validId(p.id) || !cleanName(p.name) || !validDate(p.createdAt)) return 'invalid player';
    const name = p.name.trim().toLowerCase();
    if (ids.has(p.id) || names.has(name)) return 'duplicate player';
    ids.add(p.id);
    names.add(name);
  }
  const matchIds = new Set();
  for (const m of file.matches) {
    if (!m || !validId(m.id) || !validDate(m.finishedAt) || !validMatch(m)) return 'invalid match';
    if (matchIds.has(m.id)) return 'duplicate match';
    matchIds.add(m.id);
  }
  return null;
}

export function transferRouter(db, helpers) {
  const allPlayers = db.prepare('SELECT id, name, created_at FROM players ORDER BY name');
  const allMatches = db.prepare('SELECT id, finished_at, payload FROM matches ORDER BY finished_at DESC');
  const insertPlayer = db.prepare('INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)');
  const insertMatch = db.prepare('INSERT INTO matches (id, finished_at, payload) VALUES (?, ?, ?)');

  const router = express.Router();

  router.get('/', (_req, res) => res.json({ importEnabled: importSetting().enabled }));

  router.get('/export', (_req, res) => {
    const exportedAt = new Date().toISOString();
    res.set({
      'Content-Disposition': `attachment; filename="ochemate-export-${exportedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    });
    res.json({
      format: FORMAT,
      version: VERSION,
      exportedAt,
      players: allPlayers.all().map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })),
      matches: allMatches.all().map((r) => {
        const { config, darts } = JSON.parse(r.payload);
        return { id: r.id, finishedAt: r.finished_at, config, darts };
      }),
    });
  });

  router.post('/import', (req, res, next) => {
    if (!importSetting().enabled) return res.status(403).json({ error: 'import disabled' });
    return express.json({ limit: MAX_BODY })(req, res, next);
  }, (req, res) => {
    const problem = check(req.body, helpers);
    if (problem) return res.status(400).json({ error: problem });
    const { players, matches } = req.body;
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM matches; DELETE FROM players;');
      for (const p of players) insertPlayer.run(p.id, p.name.trim(), p.createdAt);
      for (const m of matches) insertMatch.run(m.id, m.finishedAt, JSON.stringify({ config: m.config, darts: m.darts }));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ players: players.length, matches: matches.length });
  });

  // Body-parser errors (too large, bad JSON) would otherwise be answered with an HTML page.
  router.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'file too large' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'not an export file' });
    return next(err);
  });

  return router;
}
