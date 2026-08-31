# The Rusko Files — v0.2, packaged for RUN.world

## Setup (npm + Vite)

The game is now an npm/Vite project so it can ship on RUN.world through the
`@series-inc/rundot-game-sdk`. It is no longer a double-click-`index.html`
static page — `game.js` and the old root `style.css` are retired in favor of
`src/main.js` and `src/style.css`. **You can delete `game.js` from the project
root** (it's dead weight now — left in place rather than deleted from here
since this tool can't delete files on your drive); everything it did now
lives in `src/main.js`, with the RUN SDK wiring added on top.

From the project folder (`C:\Users\Russ B\JSgames\RuskosFiles`), with
[Node.js 20+](https://nodejs.org/en/download) installed:

```
npm install
npm run dev
```

`npm run dev` starts a local Vite dev server (it prints a `http://localhost`
URL — open that in a browser). SDK calls run against deterministic mocks
locally, so you can play through the whole case normally.

When you're ready to publish, see **Deploying to RUN.world** below.

It's currently wired to the exact filenames from your folder listing:

- `Julius Voss Headshot.jpg`
- `Marcus Cole Headshot.jpg`
- `Eleanor Pratt Mugshot.jpg`
- `Delia Voss Mugshot.jpg`
- `Julius_Voss_Office.png`
- `Corkboard.png`
- `tornphoto.png`
- `gun.png`

If you rename any of those files, update the matching filename string in `game.js` (search for it — they're all in the `SUSPECTS`, `VICTIM`, `CLUES`, and `LOCATIONS` objects near the top).

## What's playable right now

- Full navigation: Study → 3 clues unlock the 3 suspect locations → talk to each suspect with 3 approaches (Hardball / Sympathy / Bluff) → visual corkboard where you pin evidence to suspects → Confront screen to make your accusation.
- The corkboard is fully interactive: click an evidence card, then click a suspect portrait to string them together. Click the same pair again to remove the connection.
- Confront logic actually reads your board: it checks whether you've connected motive, means, and opportunity evidence to the suspect you're accusing — not just whether you picked the right name.

## Design decisions I made so there'd be something to play

**Eleanor Pratt is the culprit.** She killed Voss after he told her the affair was over and that he intended to be transparent with the board and his daughter about it — a combination of humiliation and financial desperation (she'd already been quietly pawning things). The murder weapon is her late husband's revolver, which she'd claimed was lost.

If you'd rather it be Cole or Delia, that's a straightforward swap:
1. In `SUSPECTS`, move `guilty: true` to the suspect you want.
2. In `CLUES`, change the relevant `points:` fields so the motive/means/opportunity evidence points at your new culprit instead of Eleanor.
3. In `attemptConfront()` in `game.js`, change the `suspectId === 'eleanor'` checks to your new culprit's id.
4. Rewrite the ending text in `ENDINGS` to match the new solution.

**Failed accusations don't end the game.** Per your note, accusing the wrong suspect (or accusing Eleanor without enough evidence pinned) drops you back into investigation with an in-fiction rebuff line, rather than a hard game-over. You can always go back and dig more. This means the only way to actually end the game is to build a real case against Eleanor and present it.

**Two real endings for now:** "Clean" (all three evidence categories connected) and "Messy" (at least one connected, but thin). I didn't build separate terminal "wrongly accused" endings, since that would contradict the "always allowed to go back" behavior above — happy to add a distinct rare-fail state if you want one, but it'd need its own trigger condition (e.g., a limited number of attempts) rather than just picking the wrong name.

**Dialogue trade-off is implemented, lightly.** Choosing Hardball with a suspect locks their Sympathy option for the rest of the game (button disables with a tooltip). Sympathy doesn't lock Hardball. Bluff isn't gated on anything yet — it's flavor-only for now, doesn't affect scoring, since I didn't want to invent a hidden success/fail mechanic without checking with you first.

**Suspect and location art:** only Study and the 4 portraits have images right now, since that's what you've generated. Every other location (The Anchor, Cole's Office, Eleanor's Flat, Delia's Apartment) currently runs on text description only — that's intentional per the "nice-to-have" list, not a bug. Drop a background image in later and set `image: 'filename.jpg'` on that location object in `game.js` to add it.

## Known rough edges (not bugs so much as "not done yet")

- Corkboard evidence slots are laid out in a fixed grid in the order clues are found, not hand-placed per item — works fine but isn't hand-tuned for visual composition.
- Bluff dialogue is static flavor text, not conditional on what you've already found. Noted above as a deliberate scope cut, not an oversight.
- Mobile layout is functional but not polished — corkboard especially could use tuning on narrow screens.

Take it for a spin and tell me what feels off — happy to adjust pacing, add the missing location art hooks, or rebalance how much evidence it takes to close the case clean vs. messy.

## Deploying to RUN.world

This uses your own RUN.world account and the `rundot` CLI, both of which
you already have set up on this machine.

1. **Log in (once):**
   ```
   rundot login
   ```
2. **Initialize the game (once, first deploy only):**
   ```
   rundot init
   ```
   This walks you through naming the game and writes a `game.config.prod.json`
   with your game ID and build folder (`./dist`). Skip this on later deploys —
   it's already configured after the first run.
3. **Build:**
   ```
   npm run build
   ```
   This produces the `dist/` folder rundot deploys from. Run this before every
   deploy — `rundot deploy` ships whatever's currently in `dist/`, not your
   source files.
4. **Deploy:**
   ```
   rundot deploy
   ```
   Ships an unlisted, shareable link by default. Add `--public` to make it
   discoverable in RUN's Explore/search, `--changelog "notes"` to attach
   player-facing patch notes, and `--bump major|minor|patch` to control
   versioning (defaults to minor). `rundot game set-keywords "noir,mystery,detective"`
   (or similar tags) helps with discoverability once you publish.

Useful checks: `rundot list-games` lists everything you've deployed;
`rundot game info` prints details for whichever game is configured in the
current folder.

## What was added for RUN.world (v0.2)

- **`@series-inc/rundot-game-sdk` integration** in `src/main.js`: the SDK
  auto-initializes on import, with a global `unhandledrejection`/`error`
  safety net that logs to analytics instead of letting a stray SDK rejection
  crash the game back to the RUN catalog.
- **Analytics**: every meaningful action (examining a clue, talking to a
  suspect, asking Sal something, pinning/unpinning a board connection,
  attempting a confrontation, reaching an ending) fires a custom event. Two
  funnels are registered on top of that — a boot funnel
  (`load_started` → `load_finished` → `first_tap`) and a 5-step investigation
  funnel (`case_started` → `first_clue_found` → `all_suspects_visited` →
  `board_connection_made` → `case_closed`) — so the RUN dashboard can show
  where players drop off, not just raw event counts.
- **Save/restore via `appStorage`**: the game iframe on RUN.world can't use
  `localStorage`, so progress now saves through the SDK's cloud-synced
  `appStorage` on `onSleep`/`onPause` (backgrounding or closing the game) and
  restores automatically on the next launch, dropping you back at the map
  instead of the intro if you'd already started a case. "Start Over" clears
  the save.
- **Vite project structure**: `index.html` now loads `src/main.js` as a
  module; `vite.config.js` sets `base: './'` (required since RUN serves games
  from a subdirectory) and points `publicDir` at the existing `images/`
  folder so none of the art had to move.
