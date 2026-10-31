# Ochemate (local dart scoring)

Self-hosted dart scorer, used on a tablet at the board. Tap the SVG dartboard to score. Remote: `https://github.com/domhirs/ochemate.git`, branch `main`. Open work is tracked in [TASKS.md](TASKS.md).

## Stack

| Part   | Path      | Tech                                                              |
| ------ | --------- | ----------------------------------------------------------------- |
| Client | `client/` | Angular 20 (standalone, signals, OnPush), `@angular/pwa`, plain CSS |
| Server | `server/` | Node + Express 5, `node:sqlite` (no native deps), plain JS ESM    |
| Deploy | root      | Multi-stage `Dockerfile`, `docker-compose.yml`, DB in `/data` volume |

Angular 20 on purpose: the installed Node (v24.11) is too old for the Angular 21 CLI.

## Commands

```sh
cd client && npm install && npx ng build            # output: client/dist/client/browser
cd server && npm install && npm start               # API + static files on :8080
cd client && npx ng serve --proxy-config proxy.conf.json   # dev, proxies /api to :8080
docker compose up -d --build
```

Local test run of the built app: `STATIC_DIR=../client/dist/client/browser PORT=8099 DB_PATH=<tmp>/x.db node server.js` from `server/`.

## Architecture

- **Game state is a dart log.** `client/src/app/game-logic.ts` holds pure functions: `replay(config, darts)` rebuilds the full state (X01, Cricket, Around the Clock). Undo = drop the last dart and replay. Never mutate state outside `applyDart`.
- `game.service.ts`: signals for view, config, darts; persists the running game to localStorage; on win saves via `api.ts`.
- `api.ts`: failed saves go to a localStorage queue and are retried on next load. `POST /api/matches` is idempotent by client-generated `id`.
- Server stores `{config, darts}` as JSON per match; the History view replays each record to compute stats. No stats are stored.
- Saved players: `players` table (id, unique name) on the server, `Profiles` service on the client. A match links a player via `config.playerIds` (same order as `players`, `null` = guest); older matches have no ids. Stats are never stored, they are derived by replaying matches per profile id.
- Components: `setup.ts`, `game.ts`, `history.ts`, `players.ts` (manage saved players), `dartboard.ts` (SVG board, emits `Dart`), `settings.ts` (theme, sound, voices), `app.ts` (nav shell: header with New/Game and a burger menu for History, Players, Settings).
- Voices: `sound.ts` plays the active voice, `voices.ts` talks to `/api/voices`. The built-in `default` voice is the pack in `public/sounds/default/` (voice.json + clips); custom voices and their clips live on the server (`server/voices.js`, blobs in SQLite) and fall back to the default clip per event. The active voice, volume and sound on/off are per device (`dartboard.voice`, `dartboard.volume`, `dartboard.sound`). A new playable event goes into `VOICE_EVENTS` (`voices.ts`) and `EVENTS` (`server/voices.js`).
- Checkout suggestions: `checkoutRoute()` in `game-logic.ts`, cost-weighted so routes look human (T20 D16 over T13 D1).

## Conventions and gotchas

- UI text is English. Code comments only where the why is not obvious.
- Colors come from CSS tokens in `client/src/styles.css` (dark default, `:root[data-theme=...]` overrides). No hex colors in components except the dartboard and the 180 celebration.
- Responsive CSS in `game.ts`: the `@media` overrides must stay at the **end** of the styles block. They have the same specificity as the base rules, so earlier placement silently loses.
- The board is sized with a container query (`.board` + `min(100cqw, 100cqh)`); do not give it fixed heights.
- Production builds register a service worker. When checking a rebuild in a browser, unregister the worker and clear caches first, or you see the old build.
- Keep every Docker service within the hosting conventions (`no-new-privileges`, `cap_drop: ALL`, limits, healthcheck, log rotation).
- No auth by design (LAN use). Do not add endpoints that expose more than match history, saved player names and voice recordings. The voice API is the one unauthenticated upload surface, so it stays bounded: clips up to 1 MB whose type is sniffed from the bytes (never trust the content type), at most 20 voices, fixed event names, blobs in SQLite (no file paths), and `VOICE_UPLOADS=off` makes it read-only. Keep these limits when touching it.
- No Python on this machine; use Node or shell for scripts.
- No test suite yet. Scoring rules were verified with a throwaway Node script; if you touch `game-logic.ts`, re-verify bust, double-in/out, legs, cricket close/score, and checkouts.

## Renaming

The in-app name, wordmark and tagline live in `client/src/app/brand.ts`. Everything else that carries the name must be changed by hand:

- `client/src/index.html` (`<title>`), `client/public/manifest.webmanifest` (`name`, `short_name`)
- Logo and icons: `client/public/brand/mark.png`, `client/public/icons/*`, `client/public/favicon.ico`, `client/public/favicon.svg`
- README title, banners in `docs/brand/` (regenerate; the lettering is outlined paths) and the heading line of this file
- Source links: `BRAND.source` in `brand.ts` (repository and licence URLs), shown by `legal.ts` on the landing page and in Settings > About. AGPL section 13 asks a modified copy that runs as a network service to offer its own source, so a fork that hosts one points these at its own repository.
- Wordmark font if the lettering changes (`client/public/fonts/`, credit in README)
- Do not rename the internal identifiers: `dartboard.*` localStorage keys, the `dartboard` Docker service, image and `dartboard-data` volume, `dartboard.db`. They are a generic namespace, not the product name, and changing them orphans stored data (browser state, the match history in the Docker volume).

## Git

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Commit or push only when asked.
