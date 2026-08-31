# LiveOps Config API

Change live values in a deployed game — flip an event flag, tune a multiplier, schedule a weekend boost — without shipping a new build. LiveOps config is a small bundle of key/value pairs your game reads at runtime, with optional time-windowed overrides that turn on and off on a schedule.

***

## What LiveOps Config is

Games often need remote-config values: a banner you can switch on for an event, a reward multiplier you can bump for a weekend, a feature you can dark-launch. LiveOps gives you exactly that: a file of client-visible values you push separately from your build, plus scheduled overrides evaluated at read time.

- Values are **non-secret display config** — a cheating client could already fake them. Do **not** put anything security-sensitive (economy multipliers the server must trust, drop tables) in the `client` section. The `server` section is reserved for that and is never sent to game code in v1.
- Reads are **cheap and cached**. Call `getConfigAsync()` at natural boundaries (screen load, round start); you do not need a timer — `nextChangeAt` tells you when a re-call would observe the next scheduled flip.

***

## `rundot/liveops.config.json`

Place your LiveOps config at `rundot/liveops.config.json`. The file contains the configuration **directly** (no wrapping key):

```json
{
  "client": {
    "values": { "eventBannerVisible": false, "dailyRewardMultiplier": 1 },
    "overrides": [
      {
        "id": "summer-event",
        "activeAt": "2026-07-10T00:00:00Z",
        "expiresAt": "2026-07-20T00:00:00Z",
        "values": { "eventBannerVisible": true, "dailyRewardMultiplier": 2 }
      }
    ]
  },
  "server": {
    "values": {},
    "overrides": []
  }
}
```

- Only `client` and `server` top-level keys are allowed; both are optional. Unknown keys are a validation error.
- Each section has an optional `values` (object) and optional `overrides` (array). The `client` section may also carry an optional `experiments` (array) — see [Experiments](#experiments-ab-testing).
- An override needs a non-empty `id` (unique within its section) and a `values` object. `activeAt`/`expiresAt` are optional and must be **full ISO 8601 date-time strings with a timezone** — e.g. `2026-07-10T00:00:00Z` or `2026-07-10T00:00:00.5+02:00`. Date-only strings like `"2026-07-10"` are **rejected** (JS and C# disagree on their timezone, which would desync the CLI preview from server resolution). When both are present, `activeAt` must be strictly before `expiresAt`.
- No directly-nested arrays anywhere inside `values` (a Firestore limitation).
- The `server` section is stored and validated but **never** returned to game code — reserved for server-side consumption in a future release. Don't rely on reading it from the client.

> Commit `rundot/` to your repo; it's project config, not a build artifact, and it's env-agnostic.

***

## Resolution semantics

The config your game receives is **resolved**: the base `values`, with every currently-active override shallow-merged on top.

1. Start from `client.values`.
2. For each override whose window contains "now", in array order, shallow-merge its `values` over the result (top-level keys only; **later overrides win**).
3. An override is active when `activeAt <= now < expiresAt`. A missing `activeAt` means "always started"; a missing `expiresAt` means "never ends". `expiresAt` is **exclusive** — the moment `now` reaches it, the override turns off.

Resolution happens **client-side** against a **server-anchored clock** — the SDK anchors absolute time to the server's clock at fetch and advances it with the local clock, so a skewed device clock never shifts a scheduled flip. Because of this, **scheduled on/off is immediate**: the instant a window opens or closes, the next `getConfigAsync()` reflects it, even if the underlying rules are still cached.

***

## Experiments (A/B testing)

An experiment splits your players into variants and gives each variant different `values`. Assignment is deterministic and per-player: the same player always lands in the same variant, on every device and every session, with no server round-trip to decide.

Add an `experiments` array to the `client` section:

```json
{
  "client": {
    "values": { "dailyRewardMultiplier": 1, "shopBannerStyle": "classic" },
    "experiments": [
      {
        "id": "reward-multiplier-test",
        "variants": [
          { "id": "control", "weight": 1, "values": {} },
          { "id": "generous", "weight": 1, "values": { "dailyRewardMultiplier": 2 } }
        ]
      },
      {
        "id": "shop-banner",
        "salt": "shop-banner-v2",
        "activeAt": "2026-08-01T00:00:00Z",
        "expiresAt": "2026-09-01T00:00:00Z",
        "variants": [
          { "id": "classic", "weight": 3, "values": {} },
          { "id": "bold", "weight": 1, "values": { "shopBannerStyle": "bold" } }
        ]
      }
    ]
  }
}
```

- `id` — non-empty, unique within the section. Identifies the experiment in your results.
- `variants` — **at least 2**. Each needs a unique non-empty `id`, an integer `weight` of 1 or more, and a `values` object (same no-nested-arrays rule as everywhere else).
- `weight` — an integer proportion, not a percentage. `3` and `1` means a 75/25 split; `1` and `1` means 50/50. The weights in one experiment must **sum to at most 10,000** (they're proportions scaled into a fixed bucket space, so use small numbers like percentages, not player counts).
- `salt` — optional. Defaults to the experiment's `id`. See the stability rule below.
- `activeAt` / `expiresAt` — optional, same strict ISO 8601 rule as overrides. Outside its window an experiment assigns nobody and contributes no values.
- Experiments are **client-only**. An `experiments` key on the `server` section is a validation error.

### How assignment works

Assignment is a pure function of the experiment and the player's profile id: a hash of `salt` (or the experiment `id`) plus the player's profile id places the player into one of 10,000 buckets, and each variant owns a contiguous slice of buckets sized by its weight. No randomness, no state, no network. The same player and the same experiment definition always produce the same variant, on every device and every session — and two different experiments split players **independently**, so you can run several at once without them lining up.

{% hint style="warning" %}
**Stability holds only while the definition is unchanged.** Editing `salt`, adding or removing a variant, changing a weight, or reordering the variants **reshuffles every player's assignment**. Treat a running experiment's variants and weights as immutable. To deliberately restart an experiment with a fresh split, change its `salt`.
{% endhint %}

### Reading your variant

Resolved variant `values` are merged **after** overrides, so an assigned variant wins over a scheduled override on the same key. The assignments themselves come back alongside the values:

```typescript
const { values, assignments } = await RundotGameAPI.liveops.getConfigAsync()

const multiplier = (values.dailyRewardMultiplier as number) ?? 1
// assignments: [{ experimentId: 'reward-multiplier-test', variantId: 'generous' }]
```

Most games never need to read `assignments` — just read `values` and let the variant change your behavior. `assignments` is there for debugging, and for tagging your own analytics events.

If the player has no profile id yet (the SDK is still establishing identity), experiments are skipped: `values` is base + overrides, and `assignments` is `[]`. Read config after your first `await` rather than at module top level.

`getRawConfigAsync()` returns the unresolved `experiments` rules alongside `overrides`, if you want to inspect the full split yourself.

### Exposure events

The first time a player resolves into a variant, the SDK automatically records one `liveops_experiment_exposure` analytics event for them:

| Field | Meaning |
| --- | --- |
| `experiment_id` | the experiment's `id` |
| `variant_id` | the assigned variant's `id` |
| `variant_weight` | the assigned variant's configured weight |
| `total_weight` | the experiment's total weight (so the intended split is `variant_weight / total_weight`) |
| `config_version` | the snapshot the rules came from |

**"Exposed" means the config was loaded, not that the player saw your change.** The event fires when your game reads LiveOps config, which is usually at startup — well before the player reaches whatever the variant affects. If your change is deep in the game, many "exposed" players never actually saw it, so the measured effect looks smaller than the real one.

It fires once per `(player, experiment, variant)` for the life of the SDK instance — repeated `getConfigAsync()` calls do not re-log. If a player's identity changes mid-session (anonymous → signed in), the new profile logs a fresh exposure, so unique-player counts stay correct.

You don't need to log anything yourself. Exposures fire **only in production** — mock and playground exposures are console-only and never reach the warehouse.

### Measuring results

Two pre-approved queries surface variant-level results through the CLI:

```bash
rundot analytics export experiment_exposures_30d      # exposures, unique players, observed vs expected split (per config version)
rundot analytics export experiment_variant_kpis_30d   # exposed players, D1 retention, sessions/player, median session length, multi_variant_player_pct
```

These are descriptive counts and rates — they do not run a significance test. **Read the health columns first** (next section); if they look wrong, the data is unreliable and the KPIs don't mean anything yet.

### Running a trustworthy experiment

A/B testing has a few foot-guns that quietly ruin results. In order of how often they bite:

- **Don't edit a running experiment.** Changing variants, weights, or `salt` re-deals players between groups, and changing what a variant *delivers* mixes two different treatments into one number. Either way the results become meaningless. `rundot liveops push` will warn and ask you to confirm if it detects this. To genuinely start over, change the `salt` (everyone is re-dealt and measurement restarts) or give the experiment a new `id`.
- **The one safe live edit is ramping up.** To release to 10% first and grow it: keep the **total weight constant**, list the treatment variant **first**, and only ever **increase** its weight — e.g. `[{ id: "treatment", weight: 10 }, { id: "control", weight: 90 }]` → `[{ id: "treatment", weight: 50 }, { id: "control", weight: 50 }]`. Players already in treatment stay in treatment; nobody gets yanked back. Any other weight edit re-deals people.
- **Check the health columns before the results.** In `experiment_exposures_30d`, `observed_share` should be close to `expected_share` (on the newest `config_version` rows). In `experiment_variant_kpis_30d`, `multi_variant_player_pct` should be near zero. If either looks off, fix the cause — don't read the numbers.
- **Peeking early is fine; deciding early is not.** With few players the numbers wobble a lot and early leads flip often. Decide when each variant has at least a few thousand players and the gap has held for several days — not the first morning one bar is taller.
- **Anonymous players who sign in get re-dealt** (their profile id changes), which shows up as a small `multi_variant_player_pct`. A large value means something else is wrong.

### Testing variants locally

In **mock mode only**, add `forceVariant` to an experiment to skip hashing and pin yourself to one variant:

```json
{ "id": "reward-multiplier-test", "forceVariant": "generous", "variants": [ … ] }
```

Both push-time validators **reject** `forceVariant`, so it can never reach a deployed game — `rundot liveops push` fails with a "mock-only" error. Remove it before you push.

***

## Reading config: `RundotGameAPI.liveops`

Two always-asynchronous methods. Both share one cache and one resolver.

### `getConfigAsync(options?)` — the default

Returns the **resolved** config. This is the foot-gun-free path most games should use.

```typescript
const config = await RundotGameAPI.liveops.getConfigAsync()

if (config.values.eventBannerVisible) {
  showEventBanner()
}
const multiplier = (config.values.dailyRewardMultiplier as number) ?? 1
```

The result type:

```typescript
import type { LiveOpsConfigResult } from '@series-inc/rundot-game-sdk'

// {
//   values: Record<string, unknown>   // base + active overrides + assigned variants
//   activeOverrideIds: string[]       // ids of overrides active right now
//   assignments: ExperimentAssignment[]  // { experimentId, variantId } per active experiment
//   configVersion: string             // snapshot id the rules came from; quote in bug reports
//   nextChangeAt: number | null       // epoch-ms of the next scheduled flip, or null
// }
```

Use `nextChangeAt` to avoid polling — schedule a single re-read at that timestamp instead of checking every frame.

### `getRawConfigAsync(options?)` — advanced escape hatch

Returns the **unresolved** rules plus the server clock, so you can inspect the schedule or resolve on your own terms.

```typescript
import type { LiveOpsRawConfig, LiveOpsOverride } from '@series-inc/rundot-game-sdk'

const raw: LiveOpsRawConfig = await RundotGameAPI.liveops.getRawConfigAsync()
// {
//   values: Record<string, unknown>
//   overrides: LiveOpsOverride[]
//   experiments: LiveOpsExperiment[]   // the unresolved variant/weight rules
//   configVersion: string
//   serverTimeMs: number   // authoritative server clock at fetch
// }
const upcoming: LiveOpsOverride[] = raw.overrides
```

### `maxAgeMs` and propagation latency

Both methods accept `{ maxAgeMs?: number }` (default `60_000`; `0` forces a network fetch). `maxAgeMs` governs how fresh the underlying **rules** are — i.e. **how fast a *push* propagates** — not schedule correctness.

- **Scheduled on/off is always immediate** — `getConfigAsync()` re-resolves on every call against the server-anchored clock, so a long `maxAgeMs` can never mask a scheduled flip.
- **A push takes up to ~2 minutes** to reach all players (a 60s server cache + a 60s client rule cache). This is documented, not a bug — plan pushes accordingly.

***

## Mock mode (no backend, no sign-in)

You don't need the playground to build against LiveOps. When your game runs in **mock mode** — the SDK's `MockHost`, used whenever the `rundotGamePlaygroundPlugin` is **not** in your Vite config — the SDK reads your local `rundot/liveops.config.json` directly and serves it through the exact same resolver as production. No `pk_` key, no Firebase, no network.

1. Add `rundot/liveops.config.json` to your project (the format above).
2. Run `npm run dev` and open the game. `RundotGameAPI.liveops.getConfigAsync()` returns your file's resolved config (base values + currently-active scheduled overrides), with `configVersion: "mock"`.
3. Edit the file — the dev server reloads the page and the next `getConfigAsync()` reflects your change.

Because the same pure resolver runs in mock, playground, and production, scheduled overrides (`activeAt`/`expiresAt`) behave identically — you can test a timed event locally by setting a window around "now". The `server` section is ignored in mock, exactly as it is everywhere else in v1.

> The on-disk file is auto-loaded by `rundotGameLibrariesPlugin` (from `@series-inc/rundot-game-sdk/vite`), which RUN.world templates already include — so mock mode works out of the box as long as you haven't added the playground plugin. When the playground plugin **is** present, LiveOps goes through its normal deploy/playground path instead (see below), and the file is not auto-injected. Either way you can set values programmatically with `window.RundotGameAPI._mock.liveops = { client: { values: { … }, overrides: [ … ] } }` before the game reads config.

***

## Playground iteration

You can iterate on LiveOps values live in the playground with no CLI deploy:

1. Run the playground (`npm run dev` in your game project) and sign in.
2. Call `RundotGameAPI.liveops.getConfigAsync()` from your game.
3. Edit `rundot/liveops.config.json`.
4. The playground's HMR re-uploads the config, repoints the `private` tag, and clears the SDK's rule cache.
5. Reload; the next `getConfigAsync()` returns your new values.

For pushing to a deployed game and managing history/rollback, see the `rundot liveops` commands in the [CLI reference](../cli-reference.md).
