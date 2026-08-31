---
icon: terminal
---

# rundot CLI Reference

`rundot` is the command-line tool for shipping and operating a RUN.world title:
deploy builds, generate game assets and 3D models, inspect and repair live player
data, moderate leaderboards, and run growth (paid ads, organic launch packets,
competitive intel). This page is a workflow-oriented tour of the whole CLI. For
the exhaustive flag list on any command, append `--help`:

```bash
rundot <command> --help
rundot game update-tag --help
```

Two areas have their own deep-dive pages, cross-linked below:
[Deploying Your Game](deploying-your-game.md) and
[Marketing Your Game](marketing-your-game.md).

## Install & update

```bash
# macOS / Linux
curl -fsSL https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.sh | bash

# Windows (PowerShell)
irm https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.ps1 | iex

rundot update          # update to the latest stable release
rundot update --beta   # switch to the beta channel
rundot update --stable # switch back to stable
```

## Beta-gated commands

Most commands are generally available. A few groups are **hidden** from `--help`
until you opt into beta features for the shell session:

```bash
export RUNDOT_BETA_FEATURES=1
```

Beta-gated groups: `marketing`, `ugc`, `stats`,
`collectibles`, and the `image` utility group (`image depth` / `remove-bg` /
`upscale` / `turnaround`). The `image` utilities additionally run **prod-only**
and require an interactive `rundot login` — they reject `rk_` API-key sessions.
The `analytics` group is shown to everyone (not gated behind
`RUNDOT_BETA_FEATURES`) but is still labeled **(beta)**.

`generate`, `storage`, `files`, `leaderboard`, `intel`, `jam`, `credits`, and the
3D pipeline under `game` are **not** gated.

## Quick reference

| Command | What it does |
|---|---|
| `rundot login` | Authenticate (browser, `--api-key`, or `--refresh-token`) |
| `rundot init` | Create a new game + local `game.config.prod.json` |
| `rundot deploy` | Ship a new version |
| `rundot pack …` | Compile, submit, and check native packs (beta) |
| `rundot list-games` | List your games |
| `rundot game …` | Metadata, versions, tags, editors, API keys, 3D |
| `rundot generate …` | Sprites, images, audio, video, TTS, text completions |
| `rundot image …` | Post-process images (remove-bg, upscale, depth, turnaround) — beta |
| `rundot storage …` | Read/write player key-value storage (debug/admin) |
| `rundot files …` | Read/write player file storage (debug/admin) |
| `rundot leaderboard …` | Inspect scores, moderate, shadow-ban |
| `rundot stats …` | Player stats (beta) |
| `rundot collectibles …` | Collectible grants (beta) |
| `rundot ugc …` | User-generated content (beta) |
| `rundot marketing …` | Paid ad campaigns (beta) — see [Marketing Your Game](marketing-your-game.md) |
| `rundot socials …` | Organic launch packets — see [Marketing Your Game](marketing-your-game.md#share-an-update-launch-packet) |
| `rundot intel …` | Competitive market intelligence (credit-priced) |
| `rundot jam …` | Scaffold jam kits, get promo links |
| `rundot credits` | Credit balance and usage breakdown |
| `rundot profile search` | Find creator profiles by username |
| `rundot migrate-config` | Migrate legacy config into the visible `rundot/` folder |

---

## Auth & setup

```bash
rundot login                        # browser-based (default)
rundot login --api-key rk_…         # per-game key, for CI/CD
```

`init` creates a new game and writes `game.config.prod.json` (game ID + build
path), which every later command reads when you omit `--game-id`:

```bash
rundot init \
  --name "Bricktide" \
  --description "Auto-sweep tower defense" \
  --build-path ./dist \
  --keywords "tower-defense,idle,auto,strategy"
```

Per-game `rk_` deploy keys for headless CI are managed under
[`game api-keys`](deploying-your-game.md#cicd-authentication). Key management
requires an interactive owner login — it's blocked when you're authenticated with
an `rk_` key.

---

## Shipping a game

See [Deploying Your Game](deploying-your-game.md) for the full deploy, publish,
versioning, and release-notes workflow. The essentials:

```bash
rundot deploy                 # deploy from config, bump minor by default
rundot deploy --bump patch    # hotfix
rundot deploy --public        # also make visible on Explore
```

Version bump is `minor` by default (`major` / `minor` / `patch`).

### Tags: managing live vs. dev builds

Tags point a named label (e.g. `prod`, `staging`) at a specific version, so you
can promote builds without redeploying:

```bash
rundot game list-versions
rundot game list-tags
rundot game update-tag prod --version 1.4.0
rundot game copy-tag staging prod        # promote staging → prod in one shot
rundot game delete-tag staging
```

You can also pin a server or runtime config to a tag:

```bash
rundot game update-tag prod --version 1.4.0 \
  --server-config-id <id> --runtime-config-id <id>
rundot game list-server-configs
rundot game upload-server-config
```

Metadata, visibility, editors, and keywords all live under `game` —
`rundot game --help`. **Always set keywords** (see
[Deploying Your Game](deploying-your-game.md#game-set-keywords)).

### LiveOps config — `liveops`

Change live values in a deployed game without a full redeploy: push just the
LiveOps config from `rundot/liveops.config.json`, inspect version history, and
roll back. LiveOps push does a **scoped** read-modify-write — it fetches the
target tag's current server config, replaces only the `liveops` key, uploads a
new immutable snapshot, and repoints the tag; sibling config (leaderboard, shop,
simulation, …) is left byte-for-byte unchanged. See the
[LiveOps Config API](api/LIVEOPS.md) for the file format, resolution semantics,
and how games read the values at runtime.

```bash
rundot liveops push                        # validate the local file, then push to the private tag
rundot liveops push --tag review --message "summer event"
rundot liveops history                      # list snapshots newest-first with tag markers
rundot liveops show                         # print the deployed liveops config + active override ids
rundot liveops diff                         # compare local file to the deployed tag (scriptable exit code)
rundot liveops rollback --to-server-id <id> # restore an older snapshot's liveops onto the current config
```

- **`push [--game-id <id>] [--tag private|review] [--message <text>]`** — validates
  `rundot/liveops.config.json` locally first (exits non-zero with a path-precise
  error on failure, making zero network calls), then performs the scoped
  read-modify-write. Default tag: `private`. `--tag public` is **rejected** —
  LiveOps reaches `public` via the normal review→public promotion of the
  snapshot, not a direct push.
- **`history [--game-id <id>] [--limit <n>]`** — lists snapshots newest-first with
  id, createdAt, uploader, message, and which of `private`/`review`/`public` each
  snapshot is currently tagged as. Default limit 20.
- **`show [--game-id <id>] [--tag <t> | --server-id <id>]`** — prints the resolved
  snapshot's stored `liveops` config as pretty JSON, plus a line listing the
  override ids currently active by local (UTC) schedule evaluation. Default
  `--tag private`. A snapshot with no LiveOps config prints `(no liveops config)`
  and exits 0.
- **`diff [--game-id <id>] [--tag <t>]`** — compares the local
  `rundot/liveops.config.json` against the deployed tag's `liveops` and prints
  added/removed/changed JSON paths. **Exits 0 when identical, 1 when different**,
  so it's safe to script in CI (`rundot liveops diff && echo "up to date"`).
- **`rollback --to-server-id <id> [--game-id <id>] [--tag private|review] [--message <text>]`** —
  takes the `liveops` key from an older snapshot and re-applies it via the same
  scoped read-modify-write (a new snapshot + tag repoint; it never repoints the
  tag to the old snapshot wholesale). Same tag restriction as push. Rolling back
  to a pre-LiveOps snapshot faithfully produces a new snapshot with the `liveops`
  key removed.

---

## Generating assets

All `generate` commands accept `--game-id` and `--out`; if you omit `--out` a
filename is derived from the prompt. Every command writes a `<output>.json`
sidecar with the generation ID, prompt, and model, and supports `--json` for
scripting.

### Sprites

The workhorse for 2D game art. The canonical pattern for rarity/tier variants is
**generate a base, then reskin it** with `--edit-file` rather than starting over:

```bash
# 1. Canonical base
rundot generate sprite \
  --prompt "stone tower, medieval, clean silhouette, top-down 45° angle" \
  --width 64 --height 64 --bg transparent \
  --out tower-basic.png

# 2. Epic reskin from the base (structure-preserving edit)
rundot generate sprite \
  --prompt "same stone tower structure, Epic tier — gold trim, glowing blue rune carvings" \
  --edit-file ./tower-basic.png \
  --out tower-epic.png

# 3. Legendary reskin from the Epic
rundot generate sprite \
  --prompt "same tower, Legendary tier — celestial gold, radiant divine aura, angelic filigree" \
  --edit-file ./tower-epic.png \
  --out tower-legendary.png
```

Key flags:

- **Edit slot** (image-to-image reskin anchor, choose one): `--edit-file`, `--edit-file-key` (creator-storage key), or `--edit-asset-id`. It encourages structural consistency but does not guarantee pixel-for-pixel geometry preservation.
- **Reference slot** (style guide only, choose one): `--reference-file`, `--reference-file-key`, or `--reference-asset-id`. The edit and reference slots can be combined.
- `--pixel` enables pixel-art mode; `--pixel-perfect` (default `true`) snaps to grid; `--smart-crop` (default `true`) crops to content bounds. Use `--smart-crop false` or `--no-smart-crop` for exact dimensions.
- `--colors "#1a1a2e,#16213e,…"` sends a palette constraint (max 8 hex); `--palette-file ./game.hex` reuses the same comma- or whitespace-separated palette across calls. The CLI does not post-quantize output, so this is not an independently enforced hard-palette guarantee.
- `--tileable` requests texture-oriented output (equivalent to `--mode texture`); verify seams after generation.
- `--style "16-bit SNES"`, `--theme "dark fantasy"`, `--width` / `--height`, `--bg transparent`.

Animate a sprite into a spritesheet:

```bash
rundot generate animate-sprite \
  --prompt "walk cycle, side view, smooth loop" \
  --source-file-key "sprites/character-base.png" \
  --pixel --palette-size 16 --frames 8 --remove-bg Pro \
  --out assets/character-walk.png
```

Source is exactly one of `--source-generation-id`, `--source-file-key`, or
`--source-url`. `--remove-bg`: `None` | `Basic` (default) | `Pro`. SpriteCook's
animation API supports a palette size, not a fixed hex palette; it does not
expose the static generator's `style` or `pixel-perfect` controls.

### Images (backgrounds, UI, concept art)

Preflight the credit charge without running a model:

```bash
rundot generate estimate image --model gemini-3-pro-image-preview --image-size 4K
rundot generate estimate sprite --quantity 4
rundot generate estimate text --model claude-sonnet-4-6 --messages-file ./messages.json --max-tokens 2000
```

The quote comes from the canonical `/v1/credits/estimate` server endpoint. It is
labeled exact when RUN controls the final charge; variable text generation shows
a low–high range, percentage variance, and the reason the final charge can
differ. Add `--json` for structured output.

```bash
rundot generate image \
  --prompt "medieval village, top-down, painterly, warm golden hour, cozy" \
  --aspect-ratio 16:9 \
  --out assets/bg-village.png

# Background removal on the result
rundot generate image --prompt "ornate wooden chest, game icon" \
  --remove-background --out assets/icon-chest.png

# High-res (Pro model only) + reference images (up to 10)
rundot generate image --prompt "hero portrait, dramatic lighting" \
  --model gemini-3-pro-image-preview --image-size 2K \
  --reference-image ./assets/character.png \
  --out assets/hero.png
```

Default model is `gemini-3.1-flash-image-preview`. `--image-size` (`1K`/`2K`/`4K`)
is only supported by `gemini-3-pro-image-preview`. Background removal models:
`bria` (fast, default) or `birefnet` (high quality; tune with
`--remove-background-variant` and `--remove-background-resolution`).

### Audio & speech

```bash
rundot generate sfx --description "heavy stone door slamming, dungeon reverb" --duration 2.5 --out sfx/door.mp3
rundot generate music --prompt "tense dungeon-crawler loop, minor key, seamless" --duration 60 --out music/dungeon.mp3

rundot generate list-voices                       # discover voice IDs
rundot generate tts --text "Welcome, commander." --voice-id <id> --stability 0.4 --out vo/welcome.mp3

# Design a reusable custom voice
rundot generate design-voice --description "A gruff dwarf blacksmith, low and gravelly"
rundot generate save-voice --generated-voice-id <temp-id> --voice-name "Blacksmith Gruff"
```

`sfx` duration is 0.5–30s (use `--description`, not the deprecated `--prompt`);
`music` is 3–300s. TTS `--stability` 0–1 (lower = more expressive), `--speed`
0.5–2.0, `--model` `eleven_v3` (default) or `eleven_multilingual_v2`.

### Video

```bash
rundot generate video --prompt "tower-defense montage, cinematic wide shot" \
  --provider seedance-2.0 --duration 10 --aspect-ratio 16:9 --out promo.mp4

rundot generate video --prompt "camera slowly zooms toward the tower" \
  --mode image-to-video --start-image-url https://… --duration 5 --out intro.mp4
```

Providers: `seedance-2.0` (default), `seedance-2.0-fast`, `seedance-2.0-v2-fast` (enterprise/v2 fast tier), `kling-3.0-standard`.
Modes: `text-to-video` (default), `image-to-video` (requires `--start-image-url`),
`reference-to-video`. Resolution/aspect support varies by provider — see `--help`.

### Text / LLM completions

```bash
rundot generate text-models                        # list available models
rundot generate text \
  --model claude-sonnet-4-5 \
  --messages-file ./prompts/npc-dialog.json \
  --system "You are a gruff dwarf blacksmith NPC." \
  --temperature 0.8

# Structured JSON output
rundot generate text --model claude-sonnet-4-5 \
  --messages-file ./prompts/item.json \
  --response-format json_schema --schema-file ./schemas/item.json --strict-schema
```

The messages file is a JSON `AiMessage[]` array. `--system` takes a literal
string or `@path/to/file.txt`. Output goes to **stdout** (no `--out`); use
`--stream` for incremental SSE output. Completions are billed to the resolved
game.

### Image utilities (beta, prod-only)

Post-process an existing image — `--input` accepts a local path, HTTPS URL, or
creator-storage key. Requires `RUNDOT_BETA_FEATURES=1` and an interactive login.

```bash
rundot image remove-bg --input ./asset.png --model birefnet --variant heavy --out ./asset-nobg.png --force
rundot image upscale  --input ./character.png --scale 4 --model high-fidelity-v2 --face-enhancement --out ./4x.png
rundot image depth    --input ./scene.png --steps 20 --out ./scene_depth.png
rundot image turnaround --input ./hero.png --horizontal-angle 90 --out ./hero_right.png
```

`upscale` models: `standard-v2` (default), `low-resolution-v2`, `cgi`,
`high-fidelity-v2`, `recovery-v2`; scale 1–4. `turnaround` bills per-megapixel ×
`--num-images`.

### 3D pipeline

Generate → remesh → rig → animate, all under `game`. Each step downloads a GLB
and refuses to overwrite without `--force`.

```bash
# Image-to-3D (default) or text-to-3D
rundot game generate-3d --image-url https://… --quality standard --out model.glb
rundot game generate-3d --mode text-to-3d --prompt "weathered medieval tower, low poly" --out tower.glb

# Multi-view for accuracy (Hunyuan)
rundot game generate-3d --image-url https://…/front.png \
  --back-image-url https://…/back.png --left-image-url https://…/left.png \
  --provider hunyuan3d-v3.1-pro --out character.glb --force

# Reduce poly count, then rig + animate
rundot game remesh-3d --model-url https://…/model.glb --target-preset character --out remeshed.glb
rundot game rig-3d --model-url https://…/remeshed.glb --height 1.8 --out rigged.glb   # prints a Rig ID
rundot game animate-3d --rig-id <rig-id> --animations "walk,run,idle,attack" --out-dir ./animations/ --force
```

Providers: `hunyuan3d-v3.1-pro` (default), `pixal3d`, `trellis-2`, `meshy`.
Quality: `draft` / `standard` / `high`. Remesh presets: `character` (~5000 faces),
`prop` (~1000 faces), or an exact `--target-faces`.

---

## Player data (debug & admin)

These commands read and mutate **live player data** — handle with care. Most
clear/reset operations are irreversible.

### Key-value storage

Every command takes `--scope` (`app` default, or `owner` — the bucket shared
across all games the creator owns).

```bash
rundot storage data <profile-id> --format json --save ./debug/player.json   # full bucket
rundot storage keys <profile-id>
rundot storage get  <profile-id> gold
rundot storage set  <profile-id> gold 5000        # value stored as a string
rundot storage remove <profile-id> gold           # not confirmation-gated
rundot storage clear <profile-id> --yes           # DESTRUCTIVE — wipes the bucket
rundot storage usage <profile-id>
```

For safe snapshot/restore (including reading a past state via Firestore
Point-In-Time Recovery), use `export` / `import`:

```bash
rundot storage export <profile-id> --as-of 2026-06-01T12:00:00Z --save ./snap.json
rundot storage export --username alice --save ./snap.json      # look up the player by username instead
rundot storage import <profile-id> --file ./snap.json --yes    # DESTRUCTIVE — replaces app bucket
```

`import` requires the app **owner** role, only accepts `app`-scope snapshots, and
refuses to cross games or environments. Snapshots contain player PII — keep them
gitignored. PITR reaches back ~1 hour (or up to 7 days where PITR is enabled).
**Do not use `import` to undo a player's data erasure.**

### File storage

```bash
rundot files list <profile-id>
rundot files get  <profile-id> <file-key>          # metadata + signed URL
rundot files usage [<profile-id>]                  # per-player, or app-wide if omitted
rundot files quota                                 # your creator storage quota
rundot files upload ./asset.png --key sprites/tower.png --visibility public
rundot files visibility sprites/tower.png public   # public | private
rundot files delete <profile-id> <file-key>        # DESTRUCTIVE (confirms)
rundot files clear  <profile-id> --yes             # DESTRUCTIVE (confirms)
```

Server-side media processing via `files transform <op>` (ops: `concat`, `trim`,
`thumbnail`, `audioTrim`, `fade`, `split`, `audioMix`, `copy`, `frameExtract`,
`upscale`):

```bash
rundot files transform trim -i video-key --start-ms 0 --end-ms 5000 -o trimmed-key
rundot files transform thumbnail -i video-key --at-ms 2000 --width 640 --height 360 -o thumb-key
```

### Leaderboards

Discover IDs, inspect scores, and moderate. Not beta-gated.

```bash
rundot leaderboard config                          # discover leaderboard IDs
rundot leaderboard scores <leaderboard-id> --limit 100
rundot leaderboard player <leaderboard-id> <profile-id>
rundot leaderboard stats  <leaderboard-id>

rundot leaderboard remove <leaderboard-id> <profile-id>   # remove one score (runs immediately)
rundot leaderboard reset  <leaderboard-id> --yes         # DESTRUCTIVE — wipe all scores (--confirm alias)

# Shadow bans (player still sees their own score; invisible to others)
rundot leaderboard ban <profile-id> --reason "score manipulation"
rundot leaderboard unban <profile-id>
rundot leaderboard shadowbanned
```

`reset` is interactive — it requires typing `RESET` to confirm, or `--confirm` in
non-interactive shells. `ban` applies across **all** leaderboard instances and
requires `--reason`.

### Stats, Collectibles, UGC (beta)

```bash
rundot stats list <profile-id>
rundot stats set  <profile-id> <stat-id> 42        # admin override (parsed as a float)
rundot stats reset <profile-id> --confirm          # DESTRUCTIVE — type "yes" to confirm

rundot collectibles cards                          # deployed card catalog
rundot collectibles grants <profile-id>
rundot collectibles evaluate <profile-id>          # re-run rules against current stats
rundot collectibles revoke <profile-id> <rule-id>  # revoke grant + entitlement

rundot ugc list --mine
rundot ugc publish --content-type level --title "The Frozen Keep" --data-file ./level.json --tags "puzzle,ice" --public
rundot ugc update <entry-id> --set title="The Frozen Keep v2" --data-file ./level.json
rundot ugc members add <entry-id> --profile <profile-id>
```

`ugc update --data` is a **shallow** (top-level) merge: keys you send replace
existing values, omitted top-level keys are preserved, and nested objects/arrays
are replaced wholesale (not deep-merged) — to patch a nested object, read the
entry first and send the full intended top-level value. (`stats config` reports
the deployed collectibles/stats config; the two share a config endpoint.)

---

## Growth

### Paid ads — `marketing`

Full lifecycle (prepare → generate → submit → track) in
[Marketing Your Game](marketing-your-game.md). Two things worth repeating here:

- **Ad copy is campaign-level**, authored once in `campaign.json` (`headlines` /
  `primaryTexts`). Meta accepts 1–5 of each (headline ≤ 40 chars, primary text ≤
  125); Google requires exactly 5 of each, with headline ≤ 30 chars and
  description/`primaryText` ≤ 90 chars. The per-creative sidecars carry
  prompt/seed/refs only — there is **no `marketing copy` command**.
- **`submit` is irreversible** and campaign names are single-use. To revise, run
  `marketing cancel` and resubmit under a new `--name`.

### Organic launch packets — `socials`

Platform-ready posts (X, Reddit, TikTok, Instagram, Discord) with tracked links
when you ship an update — see
[Share an update](marketing-your-game.md#share-an-update-launch-packet).

```bash
rundot socials profile set --discord-webhook <url>   # one-time, per-creator (enables Discord auto-post)
rundot socials prepare           # drafts + tracked links (auto-posts Discord if configured)
rundot socials next              # walk the checklist one platform at a time
rundot socials open x            # caption + prefilled composer URL
rundot socials promo --platform x --model gpt-image-2   # grounded promo with a model override
rundot socials mark-posted x --url https://x.com/you/status/123
rundot socials verify            # which steps are posted AND clicked by someone other than you
```

### Competitive intel — `intel`

Market intelligence for paid creators, priced in RUN.world credits. Free actions
are rate-limited; paid actions never charge without an explicit flag.

```bash
rundot intel search "Slay the Spire"          # free
rundot intel snapshot 553834731               # free headline metrics
rundot intel dossier "Slay the Spire"         # free within your weekly allowance
rundot intel dossier "Slay the Spire" --confirm-spend   # authorize the overage
rundot intel dossier "Slay the Spire" --generate        # build one that doesn't exist yet
rundot intel whats-hot                         # global market digest
rundot intel balance                           # credits + free dossiers left this week
```

Without `--confirm-spend` an overage prints the cost and exits non-zero; without
`--generate` a missing dossier prints the generation cost and exits non-zero.
Every subcommand supports `--json`.

### Jam kits — `jam`

```bash
rundot jam init <kit-name> ./my-project        # scaffold from a jam kit (kit list fetched at runtime)
rundot jam init <kit-name> . --ref develop     # into the current dir, from a specific branch/tag
rundot jam promo                               # shareable vote/play links + social share URLs
```

### Credits

```bash
rundot credits                                 # this month, grouped by service
rundot credits --period all_time --group-by model
rundot credits --game-id <id> --consumer cli
```

`--period`: `today` | `this_week` | `this_month` (default) | `last_month` |
`all_time`. `--group-by`: `service` (default) | `model` | `app` | `consumer`.

### Other

- `rundot profile search <username>` — find creator profiles.
- `rundot analytics export <query> [--game-id <id>]` / `rundot analytics queries` — pre-approved creator analytics exports (beta; shown to everyone, `--game-id` auto-detected from the local game config when omitted).
- `rundot offerwall …` — offerwall admin; internal, requires `VENUS_INTERNAL_API_KEY`.

---

## Common workflows

**New game from scratch**

```bash
rundot login
rundot init --name "My Game" --build-path ./dist --keywords "idle,clicker"
rundot deploy
rundot game set-public
```

**Tier-variant sprite session** — generate a base, reskin per tier with
`--edit-file` (see [Sprites](#sprites)).

**Promote staging → prod**

```bash
rundot game copy-tag staging prod
```

**Inspect a player's save data**

```bash
rundot storage data <profile-id> --format json | jq .
```

**Check what you've spent this month**

```bash
rundot credits --period this_month --group-by service
```

## Kinetix native packs (beta)

Compile your committed game source into a signed, data-only
[native pack](native-packs.md). This beta builds and catalogs packs; iOS mounting
is a separate follow-up. Three commands:

| Command | What it does |
| --- | --- |
| `rundot pack preflight` | Compile locally, report unmatched branches, change nothing server-side |
| `rundot pack submit` | Upload a source snapshot at a commit and enqueue a pack build |
| `rundot pack status` | Per-platform eligibility, plus diagnostics when a build failed |

**Preflight (local, CI-friendly)** — exits non-zero on unmatched branches:

```bash
rundot pack preflight
rundot pack preflight --commit <sha> --json
```

**Submit** — pass the `rk_` deploy key on stdin, never on the command line:

```bash
rundot login --api-key-stdin < key.txt
rundot pack submit --version <versionId> --commit <sha>
rundot pack submit --version <versionId> --json
```

**Status**:

```bash
rundot pack status --version <versionId>
rundot pack status --version <versionId> --json
```

The numeric profile is not a submit argument: the built product declares its
own. See [Kinetix Native Packs](native-packs.md) for what compiles, exact
JSON fields, commit-only ZIP behavior, the build state machine,
signature/runtime checks, and key rotation. Git, Node.js 22+, and a project-local
`@series-inc/rundot-syncplay` install are required. `--commit` defaults to `HEAD`;
dirty or untracked files are reported but never uploaded.
