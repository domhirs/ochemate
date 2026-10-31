import { randomUUID } from 'node:crypto';
import express from 'express';

// Voice packs: named sets of short audio clips, one per playable event. Clips are stored as blobs in SQLite
// (no filesystem paths to validate). There is no auth, so every write is bounded: clip size, clip count,
// voice count, a format check on the bytes and an env switch (VOICE_UPLOADS=off) that makes the API read-only.
const EVENTS = new Set(['180']);
const MAX_CLIP_BYTES = 1024 * 1024;
const MIN_CLIP_BYTES = 64;
const MAX_VOICES = 20;

const ON = new Set(['on', 'true', '1', 'yes']);
const OFF = new Set(['off', 'false', '0', 'no']);

/**
 * VOICE_UPLOADS switch: unset or empty means on (LAN default). Any value that is not clearly on or off counts as off,
 * so a typo can never open uploads on a public server.
 */
export function uploadsSetting(raw = process.env.VOICE_UPLOADS) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === '' || ON.has(value)) return { enabled: true, invalid: false };
  return { enabled: false, invalid: !OFF.has(value) };
}

const uploadsEnabled = () => uploadsSetting().enabled;
const cleanName = (v) => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null);
const isUnique = (e) => /UNIQUE/i.test(String(e?.message));

/** Detects the container from the first bytes, so the client-declared content type is never trusted. */
export function sniffAudio(buf) {
  if (buf.length < MIN_CLIP_BYTES) return null;
  const ascii = (from, to) => buf.toString('latin1', from, to);
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(4, 8) === 'ftyp') return 'audio/mp4';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  return null;
}

export function voiceRouter(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voices (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_clips (
      voice_id   TEXT NOT NULL,
      event      TEXT NOT NULL,
      mime       TEXT NOT NULL,
      data       BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (voice_id, event)
    );
  `);

  const listVoices = db.prepare('SELECT id, name, created_at FROM voices ORDER BY name');
  const listClips = db.prepare('SELECT voice_id, event, mime, length(data) AS size, updated_at FROM voice_clips');
  const countVoices = db.prepare('SELECT count(*) AS n FROM voices');
  const getVoice = db.prepare('SELECT id, name, created_at FROM voices WHERE id = ?');
  const insertVoice = db.prepare('INSERT INTO voices (id, name, created_at) VALUES (?, ?, ?)');
  const renameVoice = db.prepare('UPDATE voices SET name = ? WHERE id = ?');
  const deleteVoice = db.prepare('DELETE FROM voices WHERE id = ?');
  const deleteClips = db.prepare('DELETE FROM voice_clips WHERE voice_id = ?');
  const putClip = db.prepare('INSERT OR REPLACE INTO voice_clips (voice_id, event, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)');
  const getClip = db.prepare('SELECT mime, data, updated_at FROM voice_clips WHERE voice_id = ? AND event = ?');
  const deleteClip = db.prepare('DELETE FROM voice_clips WHERE voice_id = ? AND event = ?');

  const toVoice = (r, clips) => ({ id: r.id, name: r.name, createdAt: r.created_at, clips });
  const readOnly = (_req, res, next) => (uploadsEnabled() ? next() : res.status(403).json({ error: 'uploads disabled' }));
  const validEvent = (req, res, next) => (EVENTS.has(req.params.event) ? next() : res.status(404).json({ error: 'unknown event' }));
  const existing = (req, res, next) => (getVoice.get(req.params.id) ? next() : res.status(404).json({ error: 'not found' }));

  const router = express.Router();

  router.get('/', (_req, res) => {
    const clips = {};
    for (const c of listClips.all()) (clips[c.voice_id] ??= {})[c.event] = { mime: c.mime, size: c.size, updatedAt: c.updated_at };
    res.json({
      uploads: uploadsEnabled(),
      events: [...EVENTS],
      maxClipBytes: MAX_CLIP_BYTES,
      voices: listVoices.all().map((r) => toVoice(r, clips[r.id] ?? {})),
    });
  });

  // Idempotent by client-generated id, like players.
  router.post('/', readOnly, (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'invalid name' });
    const id = typeof req.body.id === 'string' && req.body.id.length > 0 && req.body.id.length <= 64 ? req.body.id : randomUUID();
    const found = getVoice.get(id);
    if (found) return res.status(found.name.toLowerCase() === name.toLowerCase() ? 200 : 409).json(toVoice(found, {}));
    if (countVoices.get().n >= MAX_VOICES) return res.status(409).json({ error: 'limit' });
    try {
      insertVoice.run(id, name, new Date().toISOString());
    } catch (e) {
      if (isUnique(e)) return res.status(409).json({ error: 'name taken' });
      throw e;
    }
    res.status(201).json(toVoice(getVoice.get(id), {}));
  });

  router.patch('/:id', readOnly, existing, (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'invalid name' });
    try {
      renameVoice.run(name, req.params.id);
    } catch (e) {
      if (isUnique(e)) return res.status(409).json({ error: 'name taken' });
      throw e;
    }
    res.json(toVoice(getVoice.get(req.params.id), {}));
  });

  router.delete('/:id', readOnly, (req, res) => {
    deleteClips.run(req.params.id);
    deleteVoice.run(req.params.id);
    res.status(204).end();
  });

  router.put('/:id/clips/:event', readOnly, validEvent, existing, express.raw({ type: () => true, limit: MAX_CLIP_BYTES }), (req, res) => {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'empty body' });
    const mime = sniffAudio(req.body);
    if (!mime) return res.status(415).json({ error: 'unsupported audio format' });
    const updatedAt = new Date().toISOString();
    putClip.run(req.params.id, req.params.event, mime, req.body, updatedAt);
    res.json({ event: req.params.event, mime, size: req.body.length, updatedAt });
  });

  router.delete('/:id/clips/:event', readOnly, validEvent, (req, res) => {
    deleteClip.run(req.params.id, req.params.event);
    res.status(204).end();
  });

  router.get('/:id/clips/:event', validEvent, (req, res) => {
    const clip = getClip.get(req.params.id, req.params.event);
    if (!clip) return res.status(404).json({ error: 'not found' });
    const data = Buffer.from(clip.data);
    res.set({
      'Content-Type': clip.mime,
      'Content-Length': String(data.length),
      'X-Content-Type-Options': 'nosniff',
      // The client asks with ?v=<updatedAt>, so a replaced clip gets a new URL.
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.send(data);
  });

  // Body-parser errors (too large) would otherwise be answered with an HTML page.
  router.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'clip too large' });
    return next(err);
  });

  return router;
}
