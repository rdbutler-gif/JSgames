# HANDOFF — RUSKO'S PLANET (RUN.world build)

## What's here

This folder now has two things side by side:

- `ruskos_descent.html` — your original single-file game. **Untouched.**
  Your GitHub Pages site still points at this file; nothing about it changed.
- Everything else (`index.html`, `src/main.js`, `package.json`,
  `vite.config.js`) — a real Vite project that builds a deployable RUN.world
  version of the same game. `index.html` here is the new entry point, not a
  rename of your original file.

`src/main.js` is your original inline `<script>` block, moved out of the
HTML file verbatim, with five edits — nothing else touched:

1. `import RundotGameAPI from '@series-inc/rundot-game-sdk/api'` at the top.
2. A `window.addEventListener('unhandledrejection', ...)` safety net, because
   on RUN.world an unhandled promise rejection is treated as fatal and
   crashes the game back to the catalog.
3. `loadScores()` / `saveScores()` rewritten from `localStorage` to
   `RundotGameAPI.appStorage` (async). **This one's not cosmetic** —
   `localStorage`, `sessionStorage`, and `IndexedDB` are not available inside
   the RUN.world game iframe at all. Left as `localStorage`, your high-score
   table would have silently done nothing on the platform.
4. `highScores` starts from `DEFAULT_SCORES` synchronously (so the title
   screen has something to show immediately) and gets corrected once the
   async `appStorage` read resolves — same pattern the original code used,
   just non-blocking now.
5. An `onSleep` hook that calls `saveScores()`. RUN.world can suspend or
   tear down the host at any time and `onQuit` isn't guaranteed to fire, so
   this is the platform's recommended persistence point on top of the
   save-on-new-high-score you already had.

Everything else — the renderer, the enemy AI, the boss fight, the synthesized
Web Audio SFX, gamepad/touch/mouse input, the minimap — is byte-for-byte what
you wrote. None of it touches an API the RUN.world sandbox blocks.

## New: telemetry, profile avatar, global leaderboard (this round)

`rundot-analytics` (the coach's routed skill for this) isn't installed on
your account, so this is built straight from the SDK's own bundled
`ANALYTICS.md`/`PROFILE.md`/`LEADERBOARD.md` docs rather than that skill's
conventions — functionally the same either way, just worth knowing if you
later install `rundot-analytics` and its guidance uses different naming.

**Telemetry** (`RundotGameAPI.analytics`) — three funnels, defined once near
the top of `src/main.js` so step numbers stay consistent:

- `boot` (order 1): `load_started` (fires as the very first line of the
  module) -> `load_finished` (title screen is up) -> `first_tap` (the
  player's first click/tap/keypress anywhere, not specifically INSERT COIN).
- `core_loop` (order 2): `run_started` -> `first_enemy_kill` ->
  `hive_node_destroyed` -> `apex_boss_defeated`. Tracked **per run** (reset
  in `reset()`), so the dashboard shows how far a typical playthrough gets,
  not just a one-time lifetime funnel.
- `leaderboard` (order 3): `leaderboard_opened` -> `leaderboard_scrolled` ->
  `score_submitted`.

Plus custom events: `run_completed` (result, score, elapsed time, gems,
nodes destroyed — fired on every death/win) and `game_error`, wired to both
`window.onerror` and the existing `unhandledrejection` handler, so a spike in
crashes shows up on your dashboard instead of only in a player's console.

**Profile avatar** — `RundotGameAPI.getProfile()` (username + `avatarUrl`)
now renders as a small badge (avatar circle + name) on the title screen and
inside the new leaderboard panel. Falls back to a colored initial-letter
circle when `avatarUrl` is `null` (no avatar set) or the image fails to
load — plenty of players won't have one, so I didn't assume it's always
there. Read after a short retry loop, since `getProfile()` throws until the
SDK's handshake finishes and there's no ready-callback for it (same
constraint as `getDevice()`/`getEnvironment()`).

**Global leaderboard** (`RundotGameAPI.leaderboard`) — new "GLOBAL
LEADERBOARD" button on the title screen and on both the game-over/win
screens, opening a scrollable panel with up to 100 entries
(`getPagedScores({limit:100})`), each row showing rank, avatar, username,
score, with your own row highlighted. This is **additive**, not a
replacement: your existing local top-10 table (appStorage, initials entry,
export/import) is untouched and still runs exactly as before. Separately,
every run's score now also submits to the real cross-player board
(`leaderboard.submitScore`) the moment a run ends, and the over/win screens
show a `GLOBAL RANK #X` line once that resolves. Configured in "simple mode"
(`rundot/leaderboard.config.json`, `{"requiresToken": false}`) — no
anti-cheat token/sealing, appropriate for a casual game; the config
reference doc covers tightening this later if it ever matters.

Two things worth knowing about the design call here:
- I did **not** remove the arcade-style 3-letter initials entry screen. It
  still works exactly as before, feeding the separate local table. The real
  leaderboard identifies you by your actual RUN.world username automatically
  (server-side, not from anything typed in-game) — the two systems just run
  side by side rather than one replacing the other.
- Score submission and the local high-score check are independent. If the
  network hiccups and the global submit fails, you still get your local
  high-score entry normally (and vice versa) — one failing doesn't block the
  other.

## New: responsive layout + gamepad rework (this round)

You asked for two things: make the game resize to fit whatever device it's
running on (vertical on a phone held upright, horizontal on a phone turned
sideways), and verify every input path — touch, gamepad, keyboard, mouse —
is actually correct rather than just "seems to work on my desktop."

**Responsive canvas.** The canvas was hardcoded to 640×640 with no CSS
sizing at all, so on any screen narrower than 640 CSS pixels — i.e. every
phone — it would have overflowed and gotten clipped by `overflow:hidden`.
There was no resize handling whatsoever before this round. Now:

- `VW`/`VH` (the game's internal drawing-coordinate width/height) are
  computed from the actual available screen space every time the window
  resizes, rotates, or the mobile browser's UI chrome shows/hides —
  `resizeCanvas()` in `src/main.js`, debounced so it doesn't thrash. On a
  tall phone you get a tall/narrow view; on a phone turned sideways (or a
  wide desktop window) you get a short/wide one. Bounded between 320 and
  960px per side so a huge monitor can't reveal an absurd chunk of the
  game world, and a small/old phone still gets a workable view.
- This isn't a CSS stretch — the canvas's actual drawing resolution
  changes, backed by devicePixelRatio scaling (capped at 2x) so it stays
  crisp on retina/mobile screens without ballooning memory use.
- I didn't have to touch the renderer, camera, or HUD-positioning code to
  make this work: everything in `draw()`/`update()` already read `VW`/`VH`
  live (right edge = `VW-something`, center = `VW/2`, camera clamped to
  `[0, WORLD-VW]`, etc.) rather than the literal number 640, so it all
  repositions itself automatically. The one thing I did adjust is the
  minimap — it now scales mildly with screen width (was a fixed 120px,
  which would've eaten a third of a narrow phone's screen).
- Added `RundotGameAPI.system.getSafeArea()` (retried the same way
  `getProfile()` already was, since it throws until the SDK's ready) so
  on the real RUN.world host, the game leaves room for the platform's own
  toolbar/chrome, not just the phone's notch. A CSS
  `env(safe-area-inset-*)` rule on `<body>` covers the phone-notch part
  immediately in every browser, even before that SDK call resolves.
- Mobile hygiene that's easy to miss and was entirely absent before:
  `touch-action:none` on the canvas (belt-and-suspenders alongside the
  existing `preventDefault()` calls, so the browser never even considers
  starting a scroll/zoom gesture there), pinch-zoom disabled via the
  viewport meta tag (an accidental pinch mid-fight would otherwise be
  jarring — standard for this genre of game), tap-highlight/selection
  suppressed, and every button bumped to a 44px-minimum touch target
  (`.btn` wasn't quite there before; the entry-screen D-pad buttons
  already were).

**Gamepad — this one was a real bug, not just a mobile nicety.** Your
original code read the raw browser `navigator.getGamepads()` API
directly. That works fine in an ordinary desktop browser tab, but
RUN.world runs your game inside a sandboxed iframe, and on several of
their supported surfaces — Steam Deck, and mobile hardware controllers
like Backbone on iOS/Android — the raw browser Gamepad API either isn't
reliably available inside that iframe or doesn't exist at all. That's
the entire reason `RundotGameAPI.gamepad` exists: same button/stick
names, works identically everywhere, funneled through the host on
surfaces that need it. `readPad()` now tries that normalized API first
and only falls back to your original raw-browser code if the SDK layer
reports it isn't supported (e.g. an older host build, or the case
below). Every existing call site (`entryPadPoll`, `padMenuPoll`, the
movement/aim/fire logic) is untouched — same output shape, so nothing
downstream had to change. One nuance worth knowing: in **local `npm run
dev` testing**, the SDK's dev-mode mock doesn't implement the gamepad
namespace, so you'll always exercise the legacy fallback path locally
(that's fine — it's your original, already-correct desktop code, and I
verified it still runs error-free) — the SDK path only lights up once
you're actually inside RUN.world's host, so a real controller test still
needs a deploy or the Playground backend.

## Testing locally — no deploy, no RUN.world account needed

None of this requires the game to be live on RUN.world. But it also can't be
opened the way `ruskos_descent.html` could — **don't double-click `index.html`
or point Live Server at the project root.** Both will show the title screen
(that part's plain HTML/CSS) and then do nothing when you click INSERT COIN.

The reason: `src/main.js` now has `import RundotGameAPI from
'@series-inc/rundot-game-sdk/api'` — a bare package import, not a file path.
Browsers can't resolve that on their own; only Vite knows how to turn it into
a real file. Opened directly (`file://`) or through a plain static server
like Live Server, the browser throws this in the console (F12) and stops
before any of your click handlers get wired up:

```
TypeError: Failed to resolve module specifier "@series-inc/rundot-game-sdk/api".
Relative references must start with either "/", "./", or "../".
```

That's almost certainly what you hit. Two ways to actually run it locally:

**Option A — `npm run dev` (recommended):**
```powershell
npm install   # first time only
npm run dev
```
Open the localhost URL it prints. This is Vite's own dev server — live
reload like Live Server gave you, plus it resolves the SDK import and mocks
every `RundotGameAPI` call (storage, etc.) since you're not inside the actual
RUN.world host. I ran exactly this (headlessly) before handing this off:
SDK mock initializes, INSERT COIN correctly moves `title` -> `play`, zero
console errors.

**Option B — if you specifically want Live Server:**
```powershell
npm install     # first time only
npm run build   # bundles everything into ./dist -- no bare imports left in the output
```
Then point Live Server (or any static server) at **`dist/index.html`**, not
the one in the project root. I verified this path too, same clean result.
Downside: no live reload — you rebuild after every code change before
refreshing.

Either way, this is 100% local and mocked. Nothing touches RUN.world's
servers or needs you to be logged in — that only matters for `rundot deploy`
itself, later, whenever you're ready to go beyond local testing.

## What I verified

- `npm run build` — clean, no errors, no warnings.
- Isolated calls to `analytics.trackFunnelStep`/`recordCustomEvent`,
  `leaderboard.submitScore`/`getPagedScores`, and `getProfile()` against the
  SDK's mock backend — all resolve with the shapes the docs describe, no
  exceptions.
- **Full run, driven headlessly through the actual built game:** clicked
  INSERT COIN, moved the player into danger until it died, accepted the
  local high-score entry. Result: `#globalRankOver`/`#globalRankWin` both
  correctly showed `GLOBAL RANK #1` (mock backend, first submission) —
  confirming `run_completed`, `submitRunScore()`, and the local high-score
  flow all fire correctly together on a real death, not just in isolation.
  Zero page errors, zero unhandled rejections throughout.
- Title screen and leaderboard panel both correctly render the mock
  profile's avatar badge; opening/closing the leaderboard panel and
  returning to the right screen (title vs. over vs. win) all work.
- **Responsive resize, this round:** headlessly checked the built game at
  five viewport sizes — a 1280×800 desktop window, a 2000×1000 ultra-wide
  window, a 390×844 phone in portrait, an 844×390 phone in landscape, and
  a 360×640 small/older phone. In every case the canvas correctly took a
  vertical shape on portrait, a horizontal shape on landscape, stayed
  within the screen with no clipping, and INSERT COIN worked cleanly. I
  then flipped orientation *mid-game* (both directions, more than once)
  and drove a full playthrough with keyboard movement + mouse fire and
  simulated dual-stick touch taps at the same time, through death, the
  global leaderboard submit (`GLOBAL RANK #1` showed correctly again),
  and the local high-score entry screen — zero console errors or
  exceptions anywhere in that run, on both the dev server and the `dist/`
  build.
- Confirmed the gamepad fallback: with the SDK's gamepad namespace absent
  (as it is in local dev), `readPad()` correctly falls through to the
  original raw-browser code with no error, and the page loads and plays
  normally. I don't have a way to exercise the actual
  `RundotGameAPI.gamepad` code path from here — that only activates
  inside RUN.world's real host or Playground backend — so that specific
  branch is verified by careful reading and matching the SDK's documented
  `GamepadSnapshot` shape exactly, not by a live controller test. Worth
  plugging in an actual controller once you deploy.

What I *didn't* trigger in this pass: `first_enemy_kill`, `hive_node_destroyed`,
and `apex_boss_defeated` specifically (the quick test run died before landing
a kill) — these are the same `trackFunnelStep` call already proven not to
throw, just at different call sites, so I'm confident in them but haven't
watched them fire in situ. Worth a real playthrough to eyeball once you're
testing.

I did **not** run any of this against a real RUN.world login, a real
leaderboard with real other players, or the Playground backend — all of the
above used the SDK's local mock (deterministic, not the real cloud service).
That's the honest limit of what's testable without your account or a deploy.

## What I didn't touch / didn't verify

- **Export/Import `.dat` buttons** (title screen). These use
  `Blob` + a synthetic `<a download>` click, and a `<input type=file>` +
  `FileReader`. RUN.world's docs don't explicitly say whether file downloads
  work from inside the game iframe. It's plausible they're sandboxed the
  same way browser storage is. **Test this on an actual deploy** before you
  rely on it — if it's broken, it's a small, self-contained fix (the
  Files API is the documented alternative for binary I/O).
- **Pinch-zoom is disabled** (`user-scalable=no` in the viewport meta tag),
  on purpose — an accidental pinch mid-fight would otherwise throw off the
  touch controls, and it's standard for this kind of full-screen arcade
  game. Worth knowing since it's a (minor, common) accessibility
  trade-off if that ever matters for your audience.
- **Gamepad rumble/haptics** (`rumble()`) only has an effect when the
  underlying controller is a real browser-visible gamepad (desktop web,
  or RUN.world's `web-gamepad` source) — there's no documented haptics
  call in `RundotGameAPI.gamepad` yet, so on Steam Deck/mobile-controller
  sources it silently no-ops, same as it always would have if a call
  failed. Not a regression, just a ceiling on what's possible right now.
- I did not add a preloader (`RundotGameAPI.preloader`). The game is ~90KB
  and loads instantly; `usesPreloader` defaults to `false` and I left it
  there.
- The profile badge (avatar + name) only shows on the title screen and the
  leaderboard panel, not during actual play — didn't want it competing with
  the canvas-drawn HUD (score/health/etc. render at fixed pixel coordinates
  in the top-left, same corner). Easy to add elsewhere if you want it more
  persistent.
- `rundot/leaderboard.config.json` is set to "simple mode" (no anti-cheat
  token). Fine for a casual arcade game; if cheating ever becomes a real
  problem, `LEADERBOARD.md`'s token/score-sealing modes are a config change,
  not a rewrite.

## What's left — needs you, not me

I don't have your RUN.world login, and `rundot login` opens a browser and
authenticates against your Google account — that has to happen on your
machine. From this folder, in order:

```powershell
# one-time, if you haven't already
irm https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.ps1 | iex
# restart PowerShell, then:
rundot --help

npm install          # pulls in vite + the SDK from package.json
rundot login         # opens a browser, log in with Google
rundot init          # interactive -- names the game, writes game.config.prod.json
npm run build        # -> ./dist
rundot deploy        # unlisted link, playable anywhere
```

`rundot init` writes `game.config.prod.json` in this folder with your real
game ID — I didn't fake one. This step alone doesn't make anything public;
`rundot deploy` (no flags) produces an **unlisted** link only you can reach
with the URL. Nothing goes public/searchable unless you separately run
`rundot deploy --public` or `rundot game set-public`.

`npm run dev` / a `dist/` build (see "Testing locally" above) both use
*mocked* SDK calls, including a mocked `appStorage` — good enough to confirm
the game boots and plays, not proof the real cloud-synced high-score storage
round-trips correctly. To test against RUN.world's actual Playground backend
before deploying, add `rundotGamePlaygroundPlugin()` to `vite.config.js` per
their docs — left out of this first pass to keep the scaffold minimal; say
the word if you want it wired up.

## Repo note

`JSgames` is a git repo and this folder now has a `node_modules/` and
`dist/` — both are in the `.gitignore` I added here so they won't get
tracked. `rundot/docs/` (created if you ever run `npx rundot-sdk-setup`) is
ignored too.
