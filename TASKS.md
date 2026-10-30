# Tasks

Status: `[ ]` open, `[~]` in progress, `[x]` done.

| #   | Status | Task                                                                                                         |
| --- | ------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | [x]    | Make the UI completely responsive (phone, tablet portrait/landscape, desktop; no overflow, board always fits) |
| 2   | [x]    | Make the player points area smaller                                                                          |
| 3   | [ ]    | Move Undo and Miss buttons to the bottom of the player points area                                           |
| 4   | [ ]    | Dartboard keeps a minimum size so small segments stay touchable                                              |
| 5   | [ ]    | Game history (all thrown darts/actions) behind a small icon button next to Undo/Miss; drop the current-player / last-result text above the board |
| 6   | [ ]    | Move the three-throw value display from the top right into the player card; keep it until that player's next move |

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
