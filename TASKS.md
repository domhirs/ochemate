# Tasks

Status: `[ ]` open, `[~]` in progress, `[x]` done.

| #   | Status | Task                                                                                                         |
| --- | ------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | [x]    | Make the UI completely responsive (phone, tablet portrait/landscape, desktop; no overflow, board always fits) |
| 2   | [x]    | Make the player points area smaller                                                                          |
| 3   | [x]    | Move Undo and Miss buttons to the bottom of the player points area                                           |
| 4   | [x]    | Dartboard keeps a minimum size so small segments stay touchable                                              |
| 5   | [x]    | Game history (all thrown darts/actions) behind a small icon button next to Undo/Miss; drop the current-player / last-result text above the board |
| 6   | [x]    | Move the three-throw value display from the top right into the player card; keep it until that player's next move |
| 7   | [x]    | Show a list of possible checkout paths when a player is in range                                             |
| 8   | [x]    | Add sets to game setup (set/leg modes like the PDC World Championship)                                        |
| 9   | [x]    | TV-style match overview graphic under the players, reflecting the game setup (e.g. first to 3 sets, 3 legs per set) |
| 10  | [x]    | Optional deciding-set tie-break (two clear legs, sudden death at 5-5) like the PDC World Championship        |
| 11  | [x]    | "ONE HUNDRED AND EIGHTY!" celebration animation when a player hits a 180                                    |
| 12  | [x]    | Sound on/off toggle and Ross Bray voice pack: play the 180 call with the 180 animation                       |
| 13  | [x]    | Use the project name dartzn in the app instead of plain Darts                                                  |
| 14  | [x]    | Make the double and triple rings bigger so they are easier to tap                                              |
| 15  | [x]    | Make the bullseye (single and double bull) bigger                                                              |
| 16  | [x]    | Permanent players: saved player profiles, pick them in setup, link matches to them                              |
| 17  | [x]    | Player stats: matches, wins, notable visits (180 / 140+ / 100+), averages, sortable Players overview             |
| 18  | [x]    | Theming: dark (existing) and light theme, switch in the header, remembered per device                         |
| 19  | [x]    | Cancel a running game early (discard, nothing saved)                                                           |

## Details

### 1. Responsive UI

Acceptance:

- Game view fits the viewport without page scroll on phone portrait (360x740), phone landscape (740x360), tablet portrait (820x1180), tablet landscape (1180x820) and desktop (1920x1080).
- Dartboard is always fully visible and stays square; touch targets at least 44px.
- Scoreboard stays readable with up to 8 players (scrolls inside its own area).
- Setup and History views usable at 360px width (no horizontal page scroll).
- Winner dialog fits small screens.

### 2. Smaller player points area

- Reduce the height/font footprint of the scoreboard so the board gets more room.
- Must still be readable with up to 8 players (see #1).

### 3. Undo and Miss at the bottom of the player points area

- Buttons live directly below the scoreboard, not beside or above the board.
- Keep touch targets at least 44px.

### 4. Minimum dartboard size

- Board must not shrink below a size where the smallest segments (doubles, triples, bull) are reliably tappable on a tablet.
- Supersedes the "always fits without scroll" rule of #1 when the viewport is too small: allow scrolling instead of shrinking the board.
- Note: `game.ts` sizes the board via container query (`min(100cqw, 100cqh)`); add a `min-width`/`min-height` floor.
- Pick the minimum by testing real touch accuracy on the tablet.

### 5. Game history behind an icon button

- New small icon button next to Undo and Miss opens a history of all thrown darts/actions of the current game (player, dart, score, bust/miss/undo).
- Source: the dart log in `game.service.ts`; derive entries via `replay`, no new stored state.
- Remove the text above the board showing the current player name and the previous throw result of the last player.

### 6. Throw display in the player card

- Move the three-throw value display (currently top right) into the player card.
- Throws stay visible until that player's next move (first dart of their next turn), not cleared when the turn switches.
- Depends on #2 (card layout) and #5 (replaces the top text).

### 7. Checkout path list

- When the active x01 player is in checkout range, list several routes (best first), not just one.
- Respect darts left in the turn and the out mode (straight / double / master) and double-in.
- Routes stay human-looking (cost-weighted, see `checkoutRoute()`); no permutation duplicates (T20 T18 vs T18 T20).
- Re-verify checkouts after touching `game-logic.ts` (e.g. 170, 167, 100, 40, 3, 2, bogeys like 169).

### 8. Sets and legs

- Setup (x01 only): "Sets to win" next to "Legs per set". Sets = 1 keeps today's legs-only behaviour.
- A set is won by the first player to reach the legs-per-set target; the match by the first to the sets target.
- Leg starter alternates each leg inside a set; the first leg of each new set is started by the player who did not start the previous set (PDC style).
- Scoreboard shows sets and legs; History row shows the format; winner dialog shows sets.
- Old saved matches without `sets` count as 1 set.
- Not included: PDC final-set two-clear-legs rule / tiebreaks.

### 9. TV-style match overview

- Panel directly under the player cards (x01 with sets or legs > 1; hidden for single-leg x01, cricket, atc).
- Header states the format: "First to 3 sets · 3 legs per set" plus start score and out mode.
- Sets mode: one column per completed set with the legs each player won, a highlighted live column for the current set, and a Sets total. Legs-only mode: a single Legs column.
- Marks who throws first in the current leg; highlights the active player.
- Data: `setLog` in game state (legs per player of each completed set); no new stored data.
- Must stay compact on phone portrait and with up to 8 players.

### 10. Deciding-set tie-break

- Setup (x01, sets > 1): option "Deciding set: win by 2 legs". Off by default; remembered like other options.
- Deciding set = 2-player match where both players are one set from winning. Not applied with 3+ players.
- In the deciding set a player needs the legs target **and** a 2-leg lead. Cap: at (2L-1)-(2L-1) the next leg wins (first to 3 legs: 5-5, max 6-5).
- Normal sets unchanged (3-2 wins a first-to-3 set).
- Overview and History show the tie-break in the format text; the set winner is the higher leg count in each set column.
- Re-verify legs/sets logic (see #8) after touching game-logic.ts.

### 11. 180 celebration

- Full-screen animation "ONE HUNDRED AND EIGHTY!" with the player name when a throw completes a 180 (x01 turn total).
- Fired only by a live throw: not on undo, replay, page reload or history view.
- Must not block input: next player can already throw while it plays (pointer-events: none). About 3 s.
- Respects `prefers-reduced-motion` (plain fade, no rotation/confetti).
- Pure CSS animation, no assets and no new dependencies. Sound is not included.

### 12. Sound and voice packs

- Voice packs in `client/public/sounds/<voice>/` with a `voice.json` that maps events to clip files (`{ "events": { "180": ["180.wav"] } }`). Adding a voice = adding a folder.
- First pack: `ross-bray`. Only the `180` event is wired; other clips (scores, 1st/2nd/3rd) are for later tasks.
- Sound toggle (🔊/🔇) in the header, remembered in localStorage, off by default.
- 180 animation plays the clip and lasts at least as long as the clip. Undo or leaving the game stops it.
- Web Audio so it works after the first tap on tablets; clips are preloaded; voice files are cached by the service worker.
- Known issue: `gameon.wav` is Microsoft ADPCM and does not play in browsers; re-export as PCM WAV or mp3 before using it.

### 13. dartzn branding

- Browser tab title, PWA name and short name, header logo and doc titles say `dartzn`.
- Not renamed on purpose: Docker service/image/volume (`dartboard`, `dartboard-data`) and `/data/dartboard.db`. Renaming would orphan the existing match database.
- Not changed: app icons (PNG files).

### 14. Bigger double and triple rings

- Double and triple rings are 24 units wide instead of 8 (regulation) and the bull is slightly bigger. Still looks like a dartboard; numbers keep their ring.
- Hit areas are the drawn shapes, so what you see is what you tap.

### 15. Bigger bullseye

- Inner bull radius 8 -> 11, outer bull radius 19 -> 25 (viewBox units; regulation is 6.35 / 15.9).
- Single areas inside the triple ring stay wide (25 to 86).

### 16. Permanent players (profiles)

- Server: `players` table (id, unique case-insensitive name, 1-30 chars) with GET/POST/PATCH/DELETE `/api/players`. POST is idempotent by id. Deleting a profile keeps played matches.
- Matches carry `config.playerIds` (profile id or null per player, same order as `players`); the server validates it; old matches without ids stay valid.
- Setup: saved players are picked from a list, guests stay free-text and can be saved with a 💾 button. Linked rows show the profile name. Last game's linked players are restored.
- New Players view (nav): add, rename, delete. Offline: last known list from localStorage.
- Not included: profile avatars/colours, merging profiles, linking old matches to profiles by name.

### 17. Player stats

- Per profile, from all matches that link it: matches played, wins, win rate.
- Notable visits, largest first: 180, 140-179, 100-139 (counted per visit/turn).
- Averages (x01): 3-dart average, first-9 average, checkout % (visits started in checkout range that finished the leg), highest checkout, best leg (fewest darts), average darts per leg won.
- Players overview sortable by matches, wins, win %, 180s, average.
- Stats are derived by replaying match darts, nothing new is stored.
- Limits: stats use the 500 most recent matches the server returns; guests and matches played before profiles are not counted. Cricket and Around the Clock only count matches and wins.

### 18. Theming

- The existing look is the `dark` theme. `light` is new. Colors are CSS tokens (`--bg`, `--surface`, `--text`, `--text-strong` (big scores and player names), `--muted`, `--accent`, `--on-accent`, `--control`, `--fill`, `--fill-strong`, `--line`, `--ghost-border`, `--warn`, `--danger`, `--scrim`) in `styles.css`; components use only tokens, no hex.
- `Theme` service (`theme.ts`) sets `data-theme` on `<html>` and the `theme-color` meta, saved in localStorage `dartboard.theme`. An inline script in `index.html` applies it before first paint.
- Header button shows the current theme icon and switches to the next one. Add a theme = one entry in `THEMES` + one token block in `styles.css`.
- The dartboard keeps its real-board colors in every theme. The 180 celebration keeps its own colors.

### 19. Cancel game

- "✕ Cancel game" sits at the top of the game history dialog (☰), away from the Undo/Miss buttons so it is not tapped by accident. A second step asks for confirmation.
- Cancelling discards the game: it is not saved to the server or the offline queue, the stored running game is removed, and the app returns to New game. The last used setup stays as the default.
- Finished games have no cancel: they are already saved, use New game or Rematch.
