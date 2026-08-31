---
icon: gamepad
---

# Testing Locally With Playground

Playground lets you run your game on a local Vite dev server while SDK calls use the RUN.world playground backend. Use it to test storage, profiles, leaderboards, purchases, multiplayer, simulation, and other SDK APIs before you deploy a build.

The local page gets a RUN.world toolbar for sign-in, player switching, and environment status. Playground is separate from production data and may be reset periodically.

## Install dependencies

From your game project directory:

```bash
npm install @series-inc/rundot-game-sdk@latest
npm install --save-dev vite typescript firebase@^12.12.1
```

If you test IAP or subscription APIs in Playground, also install RevenueCat's web package:

```bash
npm install --save-dev @revenuecat/purchases-js@^1.39.1
```

Install `firebase` as a `devDependency` only when the project enables `rundotGamePlaygroundPlugin()`. It is the SDK's client for RUN.world-owned Playground authentication and Firestore; your game should not initialize it or supply a separate Firebase project. A build-only project that does not enable the Playground plugin does not need Firebase.

Install `@revenuecat/purchases-js` as a `devDependency` only when testing IAP or subscription APIs in Playground. The Playground plugin injects its host only during `vite dev`, so neither package is part of the deployed RUN.world build.

## Add the Vite plugins

Most RUN.world templates already include `rundotGameLibrariesPlugin()`, `base: './'`, `server.allowedHosts: true`, and an ES2022 build target. Add `rundotGamePlaygroundPlugin()` next to the existing libraries plugin.

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import {
  rundotGameLibrariesPlugin,
  rundotGamePlaygroundPlugin,
} from '@series-inc/rundot-game-sdk/vite'

export default defineConfig({
  plugins: [
    rundotGameLibrariesPlugin(),
    rundotGamePlaygroundPlugin(),
  ],
  base: './',
  server: {
    allowedHosts: true,
  },
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    target: 'es2022',
  },
})
```

> The former name `rundotGameSandboxPlugin` still works as a deprecated alias (it logs a one-time rename hint).

`rundotGamePlaygroundPlugin()` defaults to `target: 'playground'`. You can write it explicitly if you prefer:

```typescript
rundotGamePlaygroundPlugin({
  target: 'playground',
})
```

For React templates, keep `react()` first so JSX transforms still run before the RUN.world plugins:

```typescript
plugins: [
  react(),
  rundotGameLibrariesPlugin(),
  rundotGamePlaygroundPlugin(),
]
```

## Add scripts

Your `package.json` should have a Vite dev script and a deploy script:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "deploy": "npm run build && rundot deploy"
  }
}
```

## Install and log in to the CLI

If you already installed the RUN.world CLI, skip to `rundot login`.

**macOS / Linux**

```bash
curl -fsSL https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.sh | bash
```

Restart your terminal, then verify the CLI:

```bash
rundot --help
```

**Windows**

```powershell
irm https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.ps1 | iex
```

Open a new PowerShell window, then verify the CLI:

```powershell
rundot --help
```

Log in:

```bash
rundot login
```

## Initialize a game for deploys

From your game project directory:

```bash
rundot init
```

This creates `game.config.prod.json`, which stores the production game ID and build settings used by `rundot deploy`.

Playground uses `game.config.playground.json` when that file exists. If it does not exist, the first interactive Playground login can auto-create a playground game and write `game.config.playground.json` for you.

## Start Playground

Run the dev server:

```bash
npm run dev
```

Open the localhost URL printed by Vite. The page shows the RUN.world toolbar. For the first interactive tab, sign in with Google from the toolbar. If `RUNDOT_PLAYGROUND_KEY` is set, Playground signs in headlessly instead and skips the Google button.

After sign-in:

- SDK APIs use the playground backend.
- The toolbar shows the active environment and player profile.
- If this project did not have a playground game ID yet, Playground creates one and writes `game.config.playground.json`.
- Vite reloads after game creation so the new game ID is active.

## Use an existing playground game ID

If you already have a playground game ID, put it in `game.config.playground.json`:

```json
{
  "gameId": "your-game-id"
}
```

Or pass it directly in `vite.config.ts`:

```typescript
rundotGamePlaygroundPlugin({
  target: 'playground',
  gameId: 'your-game-id',
})
```

Use one approach per project. `game.config.playground.json` is easier for teams because everyone uses the same local playground target without editing Vite config.

## Test multiple players

To test player-specific flows, open the local Vite URL in multiple browser tabs **of the same browser window**. Open them one at a time — let each tab finish loading before opening the next, so the coordinator assigns each a distinct slot.

This works the same whether the first tab signs in with Google (interactive) or Playground signs it in headlessly from a `pk_` key (see [Headless Playground login](#headless-playground-login)). The first tab is the primary player; secondary tabs use tab-local synthetic player profiles such as `player1`, `player2`, and `player3`. The toolbar also includes an `Anonymous` test profile. Use the toolbar's player selector to switch profiles; switching re-authenticates and reloads the page.

This is useful for testing leaderboards, profile-specific storage, invites, multiplayer rooms, and social flows.

To run a player in a **separate browser, browser profile, Incognito window, or automation context** (anything with its own `localStorage`), pin its identity in the URL instead:

```
http://localhost:5173/?rundotPlayer=player2
```

The value becomes a synthetic profile derived from the same base identity (`{baseUid}_sandbox_player2`), exactly like a coordinator-assigned secondary tab. Rules:

- The value must match `[a-zA-Z0-9_]{1,32}`; `anonymous` is also accepted. You are not limited to `player1`–`player3` — any valid value works (e.g. `?rundotPlayer=agent_two`).
- Every concurrent browser instance that shares a base identity (one Google account or one `pk_` key) needs a **distinct** value. Two instances with the same value collide on one synthetic uid, just like two with no value collide on the base identity. The one exception is `anonymous`: each tab always signs in as its own fresh random anonymous user, so same-value tabs do not collide.
- The param overrides the coordinator for that tab. Using the toolbar's player selector strips the param from the URL and reloads, so manual switching still works.
- With no param, behavior is unchanged: the first tab/browser is the base identity and same-browser secondary tabs get coordinator-assigned players.

### How distinct players are assigned (and why the tabs must share a browser)

There is only ever **one** base identity — the one Google account, or the single `pk_` key's base user. Distinct players are **synthetic profiles derived from it**: `player1`/`player2`/`player3` become the uids `{baseUid}_sandbox_player1`, and so on, minted on the fly via custom-token exchange.

Which tab gets which profile is decided by a **cross-tab coordinator that lives in `localStorage`**. The first tab to load claims slot 0 and stays on the bare base identity; each subsequent tab reads the shared registry, sees the slots already taken, and claims the next one (`player1`, then `player2`, …). This coordination only works because tabs in the same browser window **share the same `localStorage`**.

That has one important consequence:

> ⚠️ **By default, every player must be a tab in the same ordinary browser window.** Without a URL override, do **not** open the second player in an Incognito window, a separate browser profile, or a separate automation browser context. Each of those has its **own isolated `localStorage`**, so its coordinator starts from scratch, claims slot 0, and lands on the **same base identity** as your first client. Two clients on the same identity can't share a leaderboard sensibly and **cannot form a multiplayer room** — the room server rejects the second one with a duplicate-session error (WebSocket close code `4001`). If you see `DUPLICATE_SESSION` / `4001`, this is almost always the cause. To run players in separate browsers or contexts on purpose, give each one a distinct `?rundotPlayer=` value (see above).

### Two players in an automated (Playwright) harness

The single-`localStorage` rule is the usual trip-up in headless `pk_` runs. Playwright isolates each **browser context**, so two contexts behave like two Incognito windows — both grab slot 0. Drive **two pages inside one `BrowserContext` instead**, opened sequentially:

```typescript
const context = await browser.newContext();

// Player 1 (base identity). Wait for it to fully load first.
const p1 = await context.newPage();
await p1.goto(devUrl);
await p1.waitForSelector('...'); // let the toolbar finish signing in

// Player 2 — SAME context, so it shares localStorage and the coordinator
// hands it slot 1 → the synthetic `player1` profile automatically.
const p2 = await context.newPage();
await p2.goto(devUrl);
```

No manual profile switch is needed — the second page is assigned a distinct synthetic player just by being the second tab in a context that already has one. Reserve the toolbar's player selector (or `window.__RUNDOT_GAME_PLAYGROUND_SWITCH_PLAYER__`) for *changing* which profile an already-running tab uses, not for spawning a second player from a fresh isolated context.

Two isolated contexts (closer to real multi-device conditions — separate storage, caches, and service workers) work too, as long as each context is pinned to a distinct identity with `?rundotPlayer=`:

```typescript
// Player 1 — base identity (no param).
const c1 = await browser.newContext();
const p1 = await c1.newPage();
await p1.goto(devUrl);

// Player 2 — isolated context, pinned to a distinct synthetic player.
const c2 = await browser.newContext();
const p2 = await c2.newPage();
await p2.goto(`${devUrl}?rundotPlayer=player2`);
```

Pick the style that matches the test: one context exercises the coordinator's automatic slot assignment; two contexts with `?rundotPlayer=` exercise fully isolated clients. Either way, both players derive from the one `pk_` base identity.

Because every synthetic player derives from the one `pk_` base identity, two developers (or two CI jobs) sharing the same `pk_` key still collide on those synthetic uids — give each concurrent runner its own game/`pk_` key.

## Test on a phone or LAN device

To exercise touch input, mobile layout, or device-specific behavior, load Playground from a phone or tablet on your local network instead of your desktop browser.

### Start the dev server on your LAN

Bind Vite to all interfaces so other devices can reach it:

```bash
npm run dev -- --host
```

Or set it in `vite.config.ts`:

```typescript
export default defineConfig({
  // ...
  server: {
    allowedHosts: true,
    host: '0.0.0.0',
  },
})
```

Vite prints both a `localhost` URL and a **Network** URL (your machine's LAN IP). Open the Network URL on the phone — both devices must be on the same Wi-Fi.

### What happens on the phone

Google Sign-In only works from a `localhost` origin (Firebase authorized domains). A phone loading `http://192.168.x.x:5173` cannot complete OAuth, so Playground would otherwise hang forever on "signing in".

When the dev server is LAN-bound and you have no headless `pk_` key configured, the SDK automatically signs the primary tab in **anonymously** instead. The game loads and SDK APIs work against the playground backend. The dev server also logs a one-time console hint explaining this mode.

This fallback applies only to local `vite serve` on a non-loopback bind. The hosted Playground at run.world still requires Google Sign-In.

### Limitations in LAN mode

- You get an **anonymous** session, not your creator Google profile.
- **Toolbar player switching does not work** from a LAN origin. Synthetic profiles (`player1`, `player2`, …) are derived from a Google session via custom-token exchange; without Google, the toolbar cannot switch identities. Multi-tab player testing (see [Test multiple players](#test-multiple-players)) is a localhost/Google feature.
- **Headless login is incompatible** with a LAN bind — the plugin refuses to start if `RUNDOT_PLAYGROUND_KEY` is set while binding a non-loopback host (see [Headless Playground login](#headless-playground-login)).

LAN mode is for loading the game on a real device and exercising mobile-specific behavior. Use localhost when you need your real profile, player switching, or headless CI flows.

### Get your real Google profile on a device

If you need Google Sign-In from a physical device, make the phone treat your dev server as `localhost`:

**Android (USB debugging)**

```bash
adb reverse tcp:5173 tcp:5173   # use your Vite port
```

Then open `http://localhost:5173` on the phone. `adb reverse` tunnels the port so the browser origin is loopback and the normal Google toolbar flow works — even though the dev server is bound to `0.0.0.0`.

Loading `http://localhost:5173` on your desktop (with or without `--host`) also keeps the normal Google flow. Only a genuinely non-loopback origin (the LAN IP in the phone's browser) triggers anonymous sign-in.

## Headless Playground login

Use a headless key when you want Playground to start without clicking Google Sign-In — for example in a bot, CI job, or repeatable local smoke test. The interactive Google Sign-In needs no key at all and is the safer default; reach for a headless key only when you specifically need unattended login.

Headless keys support the same multi-tab player switching as interactive mode (see [Test multiple players](#test-multiple-players)) — open the URL in several tabs to get `player1`, `player2`, `player3`, and an `Anonymous` profile alongside the base player. Note that all of these synthetic players derive from the single `pk_` base identity, so two developers sharing the same `pk_` key also share those synthetic player uids.

### Recommended: `rundot playground grant-access`

From your game directory, run:

```bash
rundot login
rundot playground grant-access
```

This mints a **playground key** (a `pk_…` key — a distinct credential type from your `rk_` deploy key) for the current game and writes it to a git-ignored `.env.local` (chmod 0600) as `RUNDOT_PLAYGROUND_KEY`. The CLI default TTL is **365 days** (same as `game api-keys create`); override with `--expires-in-days` (1–365) for a shorter-lived key. Then just:

```bash
npm run dev
```

No `vite.config.ts` editing is needed — the playground plugin reads `RUNDOT_PLAYGROUND_KEY` from `.env` / `.env.local` automatically.

To clean up, revoke the key server-side and strip it from `.env.local`:

```bash
rundot playground revoke-access
```

### Two key types: `pk_` (playground) vs `rk_` (deploy)

A **playground key** (`pk_…`) is a distinct credential type from your **deploy key** (`rk_…`). A `pk_` key can **only** open a Playground login session — it is rejected (403) by every deploy, marketing, content-generation, and game-mutation endpoint, and the playground sign-in endpoint accepts **only** `pk_` keys (a deploy key is refused). So even if a `pk_` key leaks, it cannot deploy your game or spend money — the worst case is a throwaway playground login. That is why it is safe to keep on disk for headless dev. The two never share an env var: `RUNDOT_PLAYGROUND_KEY` holds the `pk_` key; `RUNDOT_API_KEY` holds the `rk_` deploy key (and the plugin reads only the former).

### How the key is handled

- The key is read **dev-server-side only**. It is **never** serialized to the browser. The SDK obtains a short-lived custom token from a localhost-only dev-server endpoint; the raw key never leaves your machine.
- The dev server must stay bound to localhost. The plugin refuses to start if a key is configured while binding a non-loopback host (override with `RUNDOT_ALLOW_INSECURE_KEY_BIND=1` only if you understand the risk).
- Keep `.env.local` git-ignored and never commit a key. The RUN.world templates ship a `.gitleaks.toml` you can wire into a pre-commit hook or CI to catch committed `rk_`/`pk_` keys.

### CI / secret manager

`grant-access` is the only way to mint a playground key, and it writes `.env.local`. For CI, mint once locally (default TTL is 365 days) and copy the `pk_…` value into your CI secret store:

```bash
rundot login
rundot playground grant-access      # writes RUNDOT_PLAYGROUND_KEY=pk_… to .env.local (365-day default)
# copy the pk_… value from .env.local into your CI secret as RUNDOT_PLAYGROUND_KEY
```

Then in CI, expose it to the dev server:

```bash
export RUNDOT_PLAYGROUND_KEY=pk_your_game_id_abcdef...
npm run dev
```

Do not expose a dev server that has `RUNDOT_PLAYGROUND_KEY` configured. Keep it private to your machine or trusted CI runner.

## Iterate on LiveOps config

You can tune LiveOps values live while Playground runs. Edit `rundot/liveops.config.json` with the dev server up: the Vite plugin re-uploads the config, repoints the `private` tag, and clears the SDK's LiveOps rule cache, so the next `RundotGameAPI.liveops.getConfigAsync()` returns your new values with no CLI deploy. See the [LiveOps Config API](api/LIVEOPS.md) for the file format, scheduled overrides, and the runtime read methods.

### Testing experiment variants

Experiment assignment is deterministic per profile, so you can't reroll it by reloading. Two ways to see the other side of an A/B test:

- **In mock mode**, add `"forceVariant": "<variantId>"` to the experiment in your local `rundot/liveops.config.json` to pin yourself to one variant. Both push-time validators reject `forceVariant`, so it can never ship — `rundot liveops push` fails with a "mock-only" error until you remove it.
- **In Playground**, the bucketing unit is the signed-in profile id. Use the player switcher to sign in as a different test player and you'll land in a different bucket.

Either way, check which variant you actually got:

```typescript
const { assignments } = await RundotGameAPI.liveops.getConfigAsync()
// [{ experimentId: 'reward-multiplier-test', variantId: 'generous' }]
```

Exposure events (`liveops_experiment_exposure`) fire only in production. Mock and Playground exposures are console-only and never reach the warehouse, so dev iteration can't pollute your results.

## Shop and entitlements in Playground

Playground's shop is real, not a mock. `RundotGameAPI.shop` serves the catalog from your game's `rundot/shop.config.json` (uploaded with the rest of your server config under the game's `private` tag), and `RundotGameAPI.entitlements` reads and consumes the same backend records your deployed game uses. Purchases made in Playground are real on the target environment: they create persistent orders, debit the signed-in tester's wallet, and grant real entitlements — the exact flow your players get in production.

- If a purchase fails with `insufficient_funds`, fund the test wallet through the in-playground store (`RundotGameAPI.iap.openStore()`), which runs against the RevenueCat sandbox.
- If the storefront fails with `config-not-found`, the game has no shop config yet: add `rundot/shop.config.json` and reload. See the [Shop API](api/SHOP.md) for the file format.

Shop and entitlement errors carry a machine-readable `err.code` (`insufficient_funds`, `stale_catalog`, `config-not-found`, `insufficient-quantity`, …). Treat codes as best-effort in production: older RUN.world client versions deliver `err.code === 'UNKNOWN'`, and `err.status` is only populated in Playground (production calls travel over the app bridge, which reports status `0`). Always keep a fallback path for an unrecognized code.

## Build and deploy after local testing

When the game works in Playground, build and deploy the production version:

```bash
npm run build
rundot deploy
```

`npm run dev` runs local Playground. `npm run build && rundot deploy` creates and uploads a production build.

## Troubleshooting

### Playground says Firebase is missing

Install Firebase as a dev dependency:

```bash
npm install --save-dev firebase@^12.12.1
```

### IAP or subscription methods say RevenueCat is missing

Install RevenueCat as a dev dependency:

```bash
npm install --save-dev @revenuecat/purchases-js@^1.39.1
```

This package is optional unless you call subscription or IAP APIs in Playground.

### The wrong game opens

Check `game.config.playground.json`. Playground reads that file for local testing. Production deploys use `game.config.prod.json`.

### The page is blank after adding the plugins

Make sure your Vite config targets ES2022:

```typescript
export default defineConfig({
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    target: 'es2022',
  },
})
```

### CLI commands cannot find your game

Run CLI commands from the directory that contains `game.config.prod.json`, or pass `--game-id` to commands that support it.

### Playground hangs on "signing in" from a phone

If you opened Playground via your machine's LAN IP (`http://192.168.x.x:…`) before SDK support for LAN testing, Google OAuth could not complete and the page spun forever.

Update to a recent `@series-inc/rundot-game-sdk` and start the dev server with `--host` (see [Test on a phone or LAN device](#test-on-a-phone-or-lan-device)). The game should load with anonymous auth automatically.

If it still hangs, check that `RUNDOT_PLAYGROUND_KEY` is **not** set — a headless key blocks non-loopback binds. For your real creator profile on a phone, use `adb reverse` and load `http://localhost:<port>` instead of the LAN IP.
