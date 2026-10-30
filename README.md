# dartzn

dartzn is a self-hosted dart scorer for a tablet. Tap the on-screen board to score.

- Games: X01 (301/501/701, double-in, straight/double/master-out, legs, sets and deciding-set tie-break), Cricket, Around the Clock
- Checkout suggestions, 3-dart average, 180 counter, undo
- Match history and per-player stats (stored in SQLite on the server)
- Installable PWA, current game survives reloads

Stack: Angular 20 (`client/`) and Node + Express + `node:sqlite` (`server/`).

## Run with Docker

```sh
docker compose up -d --build
```

Open `http://<server-ip>:8080` on the tablet. Data lives in the `dartboard-data` volume.

## Develop

```sh
cd server && npm install && npm start          # API on :8080 (needs Node >= 22.13)
cd client && npm install && npx ng serve --proxy-config proxy.conf.json
```

## Notes

- No authentication: anyone who can reach the port can read and delete history. Keep it on the LAN or put it behind your reverse proxy with auth.
- Service worker / "Add to Home Screen" install needs HTTPS (or localhost). Plain `http://<ip>:8080` works as a normal web app; for the installable PWA put it behind a TLS-terminating proxy.
- Game state is a log of darts; scores are recomputed by replay (`client/src/app/game-logic.ts`). Undo = drop the last dart.
