# The Rusko Files — v0.1 Playable

## Setup

Drop these three files directly into your project root, next to your existing `images` folder:

```
C:\Users\Russ B\JSgames\RuskosFiles\
  index.html
  style.css
  game.js
  images\            <- already there, no changes needed
```

Then just double-click `index.html` to open it in a browser. No server, no build step, no dependencies.

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

## Known rough edges (v0.1, not bugs so much as "not done yet")

- No save/load — closing the tab resets progress. Easy to add via `localStorage` if you want it.
- Corkboard evidence slots are laid out in a fixed grid in the order clues are found, not hand-placed per item — works fine but isn't hand-tuned for visual composition.
- Bluff dialogue is static flavor text, not conditional on what you've already found. Noted above as a deliberate scope cut, not an oversight.
- Mobile layout is functional but not polished — corkboard especially could use tuning on narrow screens.

Take it for a spin and tell me what feels off — happy to adjust pacing, add the missing location art hooks, or rebalance how much evidence it takes to close the case clean vs. messy.
