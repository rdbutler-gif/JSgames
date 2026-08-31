# Kinetix Native Packs (BETA)

A **native pack** is a compiled, signed, **data-only** build of your game intended
for RUN's native player. The current beta implements compilation, validation,
signing, immutable storage, and catalog selection. Mounting packs in the iOS
client is a separate follow-up and is not available yet.

The single rule that makes this safe: **a pack is data, never code.** It carries
your game's compiled world — entities, systems, and payloads — and nothing that
executes. This is enforced, not assumed (see [The data-only rule](#the-data-only-rule)).

Native packs are in beta. Your game keeps running exactly as it does today while
the client mounting layer is built.

## What a pack contains

A pack is a small, closed set of JSON files produced by the Kinetix compiler:

| File | What it is |
|------|------------|
| `meta.json` | Format version, source digest, signed runtime identity, artifact bindings, and exact product table |
| `manifest.json` | The compiled scene manifest — systems, entities, and each payload's SHA-256 |
| `simulation.payload.json` | The authoritative simulation data |
| `presentation.payload.json` | Presentation-layer data |
| `binding.payload.json` | Binding data |
| `signature.json` | The Ed25519 signature over the pack (added at build time) |

Nothing else is permitted. The pack format is a closed allowlist: an unexpected
file, an archive, a shader, an executable, or anything the scanner cannot
positively classify as one of the data files above is rejected.

## The data-only rule

Every pack passes a scanner before it is signed, and the scanner **defaults to
deny**:

- JavaScript, bytecode, WebAssembly, shader source, and native executables are
  rejected — by content, not by file extension.
- Archives (`.zip`, `.gz`, …) are rejected outright and **never opened**.
- Anything the scanner cannot classify as an allowed data type is a violation.

A pack that fails the scan is never signed and never distributed. This is what
lets the native player trust a pack without re-vetting your game's logic.

The signed runtime identity contains the ABI version, tick rate, input and state
schema IDs, deterministic-runtime version, and engine identity hash derived from
the exact simulation product. It cannot be supplied or overridden by the caller.
The signed artifact bindings also name the game, version, numeric profile, and
all three payload digests and byte lengths.

Before frame 0, a client must reject a catalog pack unless its signature is
trusted, its game/version/profile bindings match the requested catalog entry,
and its runtime identity exactly matches both the loaded runtime and the
Syncplay session. Missing, malformed, or tampered identity metadata is never a
legacy-compatible pack.

## What compiles today

The compiler turns your **authored game source** into a pack. It is deliberately
strict: it only accepts games whose authoritative behavior it can fully account
for. When it cannot, it does not guess — it reports exactly which branches it did
not match, so you can bring them into a supported shape.

The numeric profile — whether the game's authoritative math runs on IEEE
doubles or on fixed-point integers — is declared by the built product, not by
you. There is no profile argument to preflight or submit.

Not every game compiles yet. A game that does not compile gets a precise
diagnostic, not a pack.

## The CLI

Native packs are driven by three `rundot` commands. See the
[CLI Reference](cli-reference.md#kinetix-native-packs-beta) for full syntax.

### `rundot pack preflight`

Compiles your game **locally** and reports unmatched branches. It changes nothing
on the server — run it as often as you like.

The project must install `@series-inc/rundot-syncplay`, and Node.js 22+ and Git
must be on `PATH`. Preflight resolves that installed package's `/preflight`
entrypoint; the CLI does not carry a second compiler.

```bash
rundot pack preflight
```

Output is a to-do list, not a wall of errors — each entry is
`file:line (member): what didn't match`:

```
src/ArenaRuntime.ts:212 (onFixedTick): authoritative branch not matched by any installed system
src/ArenaRuntime.ts:274 (resolveCollision): authoritative branch not matched by any installed system
… 93 more
```

Preflight exits non-zero when there are unmatched branches, so it fits in CI.

### `rundot pack submit`

Resolves `--commit` (or `HEAD`) to a full SHA, streams `git archive --format=zip`
for exactly that committed tree, and enqueues a pack build. Modified and untracked
files never enter the upload; a dirty worktree is reported explicitly. The private
temporary ZIP is removed after success or failure.

```bash
rundot login --api-key-stdin < key.txt
rundot pack submit --version <versionId> --commit <sha>
```

Pass your `rk_` deploy key on stdin with `--api-key-stdin` — never `--api-key`
(which lands in shell history).

### `rundot pack status`

Reports, per platform, whether a servable pack exists — and, when a build failed,
the same diagnostics `preflight` prints.

```bash
rundot pack status --version <versionId>
```

Build state is durable: `queued` → `running` → `succeeded` or `failed`. Status
includes attempt count and a stable failure code. A successful catalog result
also includes immutable artifact/content digests, signed runtime identity,
storage path, and trust-manifest version.

All three commands accept `--json`. JSON mode writes one compact object to stdout;
errors and progress stay on stderr. Preflight reports `ok`, `commitSha`,
`dirtyWorktree`, `diagnostics`, and `error`. Submit reports the
request/snapshot/game/version/commit identities, archive hash and length,
dirty flag, and queue state. Status mirrors the server's `gameId`, `versionId`,
`build`, and `platforms` objects.

## Reading diagnostics

`preflight` and `status` report **unmatched authoritative branches**: places where
your game's authoritative logic does something the compiler has no installed system
for. Each diagnostic tells you *what* (the branch), *where* (`file:line`), and *in
which member* it lives. The fix is to express that behavior through a supported
system for your profile; the reference for each profile lists what is installed.

Diagnostics are advice, not a queue you cannot influence — bringing branches into
a supported shape is the whole preflight → submit loop.

## Trust and key rotation (operators)

Packs are signed with an **Ed25519** key held in Google Cloud KMS. The private key
never leaves KMS. Catalog responses carry the exact bytes and signature of a
versioned trust manifest. The app pins a separate, stable trust-root public key,
verifies that manifest, and then uses its active pack keys by `keyId`.

This is a Tier-3 security surface. The key ceremony is human-authorized:

- **Create** — provision an `ED25519` signing key version in the pack-signing key
  ring. Record the `keyId` (`<keyRing>/<key>/<version>`).
- **Register** — publish a newer root-signed trust manifest containing both old
  and new public keys as active. Existing artifacts remain valid during overlap.
- **Rotate** — build the same content under the new key, producing a distinct
  `artifactDigest`, then explicitly move catalog eligibility to that artifact.
- **Revoke** — publish a higher manifest version marking the old key revoked.
  Catalog selection fails closed and does not fall back to another artifact
  unless eligibility explicitly names it.

The manifest has issue/expiry times and monotonically increasing versions;
expired, non-canonical, invalidly signed, or rolled-back manifests are rejected.
Rotating the stable trust root itself requires an app update and is separate
from ordinary pack-key rotation.

Before mounting, a future native client must verify the root signature over the
exact canonical trust-manifest bytes, require the artifact key to be active, and
match the signed game/version/profile and runtime identity to the loaded runtime
and Syncplay session. The catalog never synthesizes an unsigned key list.

The build server reads its key from environment configuration
(`KINETIX_PACK_SIGNING_KMS_PROJECT`, `_LOCATION`, `_KEYRING`, `_KEY`,
`_KEY_VERSION`); the raw key is never in an env var, a repo, or a log.
