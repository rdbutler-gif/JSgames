---
icon: cloud-arrow-up
---

# Deploying Your Game

This page covers everything about getting your game live on RUN.world: logging in, deploying builds, publishing, versioning, and managing visibility.

## Log into RUN.world

You'll need to log in before you can deploy. From your Terminal:

```bash
rundot login
```

This opens a browser window where you can log in with your Google account. Any command that requires authentication will alert you if you aren't logged in.

**To force a new login session:**

```bash
rundot login --force
```

Your session info is stored locally in `~/.rundot/` (macOS/Linux) or `%USERPROFILE%\.rundot\` (Windows).

## CI/CD Authentication

For automated pipelines (GitHub Actions, GitLab CI, etc.), use a per-game API key instead of interactive login.

### Managing keys with the CLI

API keys are scoped to a single game and can only be managed by the game owner. The easiest way is the CLI (run from a normal interactive `rundot login`):

```bash
rundot game api-keys create --label "GitHub Actions" --expires-in-days 90
rundot game api-keys list
rundot game api-keys regenerate --key-id <KEY_ID>
rundot game api-keys revoke --key-id <KEY_ID>
```

`create` and `regenerate` print the `secret` (an opaque `rk_`-prefixed string) **once** — save it immediately. Key management is intentionally unavailable when you are authenticated with an `rk_` key; it requires an interactive owner login.

For moderating live leaderboard data from the CLI (view scores, remove entries, shadow-ban cheaters), see [Leaderboard Moderation (CLI)](api/LEADERBOARD.md#leaderboard-moderation-cli).

### Generating an API key (REST)

If you prefer to script it directly, the same operation over the REST API:

```bash
curl -X POST https://api.run.world/v1/games/<GAME_ID>/api-keys \
  -H "Authorization: Bearer <YOUR_FIREBASE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"label": "GitHub Actions", "expiresInDays": 90}'
```

The response includes a `secret` field (an opaque `rk_`-prefixed string), **save it immediately**, it is shown only once.

### Using the key

```bash
rundot login --api-key rk_your_game_id_abcdef...
rundot deploy
```

Or set it as an environment variable in your CI config and pass it inline:

```bash
rundot login --api-key "$RUNDOT_API_KEY"
```

### Headless playground login (use a playground key)

For headless **playground** login — no Google Sign-In, nothing embedded
in `vite.config` — do **not** reuse the deploy key above. Mint a dedicated
**playground key** (a `pk_…` key — a distinct type from your `rk_` deploy key)
instead: it can *only* open a playground session and is rejected (403) by every
deploy, marketing, content-generation, and spend endpoint, so it's low-risk to
keep on disk. The one-command way:

```bash
rundot playground grant-access                        # 365-day CLI default
rundot playground grant-access --expires-in-days 14   # shorter TTL (1–365)
```

This writes a git-ignored, `0600` `.env.local` containing `RUNDOT_PLAYGROUND_KEY=pk_…`
(read by the SDK playground plugin — distinct from the deploy key `RUNDOT_API_KEY`
above); then `npm run dev` signs in headlessly. Clean up with
`rundot playground revoke-access`. The key validates against RUN.world, so it
keeps working across playground's periodic data resets. This applies to the
playground environment only.

See [Testing Locally With Playground](playground.md#headless-playground-login)
for the full flow, how the key is handled (it never reaches the browser), and
the CI / secret-manager variant.

### Key properties

| Property | Detail |
| --- | --- |
| Game scope | Single game only |
| Key type | Two distinct, prefix-typed credentials: **deploy** (`rk_`, minted by `api-keys create` / this REST endpoint — full game access) and **playground** (`pk_`, minted by `rundot playground grant-access` — playground-login only, rejected by every mutation/spend route). The type is intrinsic to the key's prefix. |
| Who can create | Game owner |
| Expiration | 1–365 days (default **365** for both `api-keys create` and `playground grant-access`; override with `--expires-in-days`) |
| Revocation | Instant: `DELETE /v1/games/<gameId>/api-keys/<keyId>` |
| Regeneration | `POST /v1/games/<gameId>/api-keys/<keyId>/regenerate` (revokes old, issues new) |
| Max per game | 10 **active** keys (unrevoked and unexpired; expired keys no longer consume a slot) |

### Security notes

- Keys are stored as SHA-256 hashes server-side; a database breach does not expose raw keys.
- If a key leaks, revoke it immediately via the API. The old key stops working instantly.
- Keys cannot create or manage other keys (prevents leaked-key self-replication).

## Build your game

Don't forget to create a new build before deploying. If you're using our templates:

```bash
npm run build
```

This compiles your game into the `./dist` folder.

{% hint style="info" %}
Experienced developers: build your game any way you wish. You can specify a custom build path with `--build-path`.
{% endhint %}

## Deploy

_**Deploy**_ means your game is playable by anyone you share a link with, but it won't appear on the platform or in search results. Think of it as "unlisted" by default.

```bash
rundot deploy
```

When done, you'll get a shareable link playable in any desktop browser or in the RUN.world app.

## Publish your game

When you're ready for your game to appear in search results on the RUN.world platform:

```bash
rundot deploy --public
```

Or set visibility separately after deploying:

```bash
rundot game set-public --version latest
```

## Managing visibility

Your game can be:

* **Public**: Visible on the RUN.world **Explore** page
* **Private**: Hidden from Explore, but still accessible via OneLink. Great for sharing with testers.

**Make the game private (hide from Explore):**

```bash
rundot game set-private
```

To see all visibility options:

```bash
rundot game set-public --help
rundot game set-private --help
```

## Controlling version numbers

`rundot deploy` increments your game's version automatically.

Use `--bump` to control versioning:

* `major`: 1.0.0 → 2.0.0 (breaking changes)
* `minor`: 1.0.0 → 1.1.0 (new features) **(default)**
* `patch`: 1.0.0 → 1.0.1 (bug fixes)

```bash
rundot deploy --bump patch
```

## Release notes

> **Beta.** `--changelog` and `--announce` are currently beta features. They're
> hidden unless you opt in by setting `RUNDOT_BETA_FEATURES=1` in your
> environment; without it the CLI rejects these flags and every deploy is a
> minor release.

Tell your players what changed in an update. Pass `--changelog` on deploy to
attach release notes to the version:

```bash
rundot deploy --public --changelog "## What's new
- New boss fight in level 3
- Faster load times
- Fixed a save-game crash"
```

Release notes are written in **Markdown** and render on your game's **About**
tab, newest version first. Players can read the full history there.

### Announced vs. quiet releases

By default a deploy is a **quiet** release: the changelog shows up on the About
tab, but nobody is actively notified. When you ship something worth shouting
about, add `--announce`:

```bash
rundot deploy --public --announce --changelog "## Season 2 is here!
A brand-new campaign, 12 levels, and online co-op."
```

An **announced public** release notifies your existing fans — players who liked
your game get a message in their in-app inbox, and dormant players may receive a
push notification (subject to a per-game weekly cap so they're never spammed).
A quiet release only updates the release-notes display.

{% hint style="info" %}
Only **announced** releases that are **public** notify fans. An `--announce`
deploy without `--public`, or on an unlisted build, updates the release notes
but does not notify anyone.
{% endhint %}

### Images in release notes

You can embed images in your Markdown changelog, but they **must be hosted in
your game's own CDN bucket** (the same bucket your build uploads to). Images
from other origins are rejected by moderation and won't render. All release
notes — text and images — pass through content moderation before they're shown
to players.

### Muting (for players)

Players who don't want update notifications for a specific game can tap **Mute
updates** in the game's Release Notes section. They'll still see the release
notes if they visit the page, but they won't get inbox or push notifications
for that game's future releases.

## Advanced options

**Deploy command options:**

* `--game-id`: The game ID to deploy (reads from `game.config.prod.json` if not provided)
* `--build-path`: Path to your game's distribution/build folder
* `--bump`: Version bump type: `major`, `minor`, or `patch` (default: `minor`)
* `--uses-preloader`: Whether the game uses the RUN.world SDK preloader
* `--public`: Make this version visible on the Explore page
* `--changelog`: Markdown release notes for this version (shown on the About tab)
* `--announce`: Announce this release to fans — an announced **public** release notifies fans via inbox + dormant push; default is a quiet release that only updates the release notes

**What happens under the hood:**

1. Zips the build from your game distribution folder
2. Uploads the new version to RUN.world storage
3. Creates a new version entry for your game
4. Updates the `dev` tag to point to the new version
5. Optionally sets the version as public (visible on Explore)
6. Returns OneLink URLs for both public and unlisted access

## Build Size Limits

| Limit | Default |
| --- | --- |
| Game bundle (zipped `dist/` output) | 100 MB |
| Server bundle (server-authoritative simulation code) | 5 MB |

The 100 MB game-bundle cap is the server-side default and is the binding constraint at upload; contact RUN.world ops if you need it raised. The 5 MB server-bundle cap is enforced by the Vite multiplayer plugin and is overridable via its `maxBundleSize` option. To stay under the limits:

- Tree-shake and minify your client build.
- Compress and dedupe assets (textures, audio, fonts).
- Keep server-authoritative code lean; it ships separately from the client bundle.

## Advanced game configuration

For more granular control, use `rundot game ...` subcommands:

```bash
rundot game --help
```

### game set-name

```bash
rundot game set-name "New Game Name"
```

### game set-description

```bash
rundot game set-description "New description"
```

### game set-keywords

**Always set keywords on your game.** Keywords (a.k.a. tags) are the single biggest lever you control for visibility and discoverability on RUN.world. They:

* Power **in-app recommendations**: the recs engine uses tags to decide which players see your game.
* Drive **in-app search**: players who search "cozy" or "puzzle" only find games tagged that way.
* Generate a public **SEO slug page** at `https://run.world/tags/<keyword>` for every keyword, listing every game with that tag: free organic traffic from Google.

A game with no keywords is effectively invisible to the recs engine and to search.

```bash
rundot game set-keywords "cozy,puzzle,enemies-to-lovers"
```

Keywords are comma-separated and replace the full list each time. Running `set-keywords` again with a new list overwrites the previous one.

### game delete-keyword

Remove a single keyword from your game without touching the others.

```bash
rundot game delete-keyword "puzzle"
```

### game list-versions

```bash
rundot game list-versions
```

### game add-editors

```bash
rundot game add-editors "teammate@example.com"

# Add multiple editors
rundot game add-editors "dev1@example.com dev2@example.com"
```

### game remove-editors

```bash
rundot game remove-editors "former-teammate@example.com"
```

All `game` subcommands accept `--game-id` to target a specific game (reads from `game.config.prod.json` if not provided).
