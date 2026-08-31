# Syncplay Secret Systems (BETA)

Syncplay secret systems add hidden choices, cryptographic random draws, private decks and bags, and hidden roles without creator-authored server code. The trusted RUN authority owns the private projection. Every client still simulates the same public projection, and verified public consequences enter that simulation as confirmed authority commands.

## Configure the room

```json
{
  "rooms": [{
    "type": "deterministic",
    "deterministic": { "secrets": { "systems": {
      "orders": { "kind": "choice", "commitTicks": 180, "revealTicks": 180, "participants": "connected", "missingReveal": "forfeit", "maxValueBytes": 1024 },
      "initiative": { "kind": "random", "min": 1, "max": 20, "draws": 256 },
      "cards": { "kind": "deck", "items": [{ "card": "dash" }, { "card": "guard" }], "maxHandSize": 2, "reveal": "manual" },
      "loot": { "kind": "bag", "items": ["coin", "key", "potion"], "maxHandSize": 3, "reveal": "manual" },
      "faction": { "kind": "roles", "values": ["sun", "moon"], "reveal": "manual" }
    } } },
    "config": { "maxPlayers": 2 }
  }]
}
```

Role values contain one value per simulation slot. Decks and bags draw without replacement; a deck follows its committed sequential order, while a bag follows its committed authority-shuffled draw order.

Secret-enabled rooms support 1–16 simulation slots and 1–16 named systems. System IDs must match `[A-Za-z0-9._-]{1,64}`. These limits are narrower than Syncplay's general 128-player ceiling.

### Configuration reference

| Kind | Required fields | Behavior and limits |
|---|---|---|
| `choice` | `commitTicks`, `revealTicks`, `participants`, `missingReveal`, `maxValueBytes` | Deadlines are 1–36,000 authority ticks. `maxValueBytes` is 1–4,096 canonical UTF-8 bytes. `connected` captures the connected slots when the first valid commitment starts a round; `all-slots` always requires every configured slot. |
| `random` | `min`, `max`, `draws` | `min` and `max` are inclusive safe integers with `min <= max`. `draws` is 1–4,096 and is a lifetime room budget for that named system. |
| `deck` / `bag` | `items`, `maxHandSize`, `reveal: "manual"` | 1–512 canonical items; each item is at most 4,096 canonical UTF-8 bytes. `maxHandSize` must be between 1 and `items.length`. |
| `roles` | `values`, `reveal: "manual"` | `values.length` must exactly equal the simulation slot count. |

All fields are required and unknown fields fail validation. Across collection and role values, private configuration is capped at 262,144 bytes; the conservative server-only snapshot estimate is capped at 350,000 bytes. A room that exceeds either budget fails before startup.

`missingReveal` is included in the resolved event with sorted `missingSlots`: use `omit` when your simulation ignores absent values, or `forfeit` when your simulation should apply its own forfeit rule. Syncplay reports the policy; your deterministic step decides the game-specific consequence.

## Connect

```ts
import {
  createNetworkedSyncplayClient,
  createSyncplayRoom,
} from '@series-inc/rundot-syncplay/browser'

const transport = await createSyncplayRoom(api)
const client = createNetworkedSyncplayClient({
  transport,
  createSession,
  localInputForTick,
  encodeInput,
  decodeInput,
})

await client.whenReady()
await client.secrets.whenReady()
```

Mutation promises resolve only after both the signed private response and its matching public command are verified and confirmed.

## Choices and random

The SDK owns choice salts, commitments, and reveals:

```ts
type Order = { move: 'left' | 'right' }

await client.secrets.choice<Order>('orders').commit('round-7', { move: 'left' })
await client.secrets.choice<Order>('orders').reveal('round-7')
const resolved = await client.secrets.choice<Order>('orders').resolved('round-7')

const roll = await client.secrets.random('initiative').draw()
console.log(roll.value, roll.drawIndex)
```

Random systems use precommitted SHA-256 chains and unbiased inclusive range mapping. Exhaustion rejects with `random-exhausted` and never falls back to deterministic RNG.

`resolved` contains `{ systemId, requestId, roundId, reveals, missingSlots, missingReveal }`. A random draw contains `{ systemId, requestId, drawIndex, value }`.

## Decks and bags

```ts
type Card = { card: string }

const [card] = await client.secrets.deck<Card>('cards').draw(1)
console.log(client.secrets.deck<Card>('cards').hand())
await client.secrets.deck<Card>('cards').play(card.tokenId)

const [loot] = await client.secrets.bag<string>('loot').draw()
await client.secrets.bag<string>('loot').reveal(loot.tokenId)
```

Only the owner receives a drawn value. Public commands contain opaque token metadata until `play` or `reveal` publishes the value.

Drawn tokens contain `{ tokenId, systemId, ownerSlot, value }`. `hand()` returns the live, unconsumed tokens currently held by this client. Both `reveal` and `play` consume the token and publish the same verified value; the resulting deterministic event distinguishes them through `action: 'reveal' | 'play'`.

## Roles

```ts
type Faction = 'sun' | 'moon'

const role = await client.secrets.role<Faction>('faction').whenAssigned()
const currentRole = client.secrets.role<Faction>('faction').current()
await client.secrets.role<Faction>('faction').reveal()
```

One role is cryptographically shuffled onto each slot. Only its owner receives it before manual reveal.

`current()` is synchronous and returns the currently verified role token, or `undefined` before assignment arrives. `whenAssigned()` waits for it. A revealed role event contains `{ systemId, requestId, slot, tokenId, value }`.

## Deterministic event consumption

Cryptographic calls are asynchronous and stay outside `step`. Deterministic code reads public consequences on the matching confirmed frame:

```ts
import { createSyncplaySecretEventReader } from '@series-inc/rundot-syncplay/browser'

function step(state, inputs, frame, ctx) {
  const events = createSyncplaySecretEventReader(ctx)
  let next = state
  for (const result of events.choiceResolved<Order>('orders')) {
    next = applyOrders(next, result.reveals, result.missingSlots)
  }
  for (const result of events.randomDrawn('initiative')) {
    next = { ...next, initiative: result.value }
  }
  for (const event of events.collectionRevealed<Card>('cards')) {
    next = playCard(next, event.ownerSlot, event.value)
  }
  for (const event of events.roleRevealed<Faction>('faction')) {
    next = revealFaction(next, event.slot, event.value)
  }
  return next
}
```

The event reader omits signatures, Merkle paths, nonces, salts, and hash-chain preimages.

## Reconnect and spectators

A reconnect or rejoin receives the same live token IDs, holdings, role, pending choice receipts, retained request results, and completed choice resolutions without duplicate public draws or assignments. Choice salts survive reconnect in the same page; a reload loses unrevealed salts and the configured missing-reveal policy applies. Completed resolutions are retained only while the room configuration and authority signing identity are unchanged.

Spectators receive the public proof context and confirmed public commands, but no holdings, roles, salts, or private results. Mutations reject with `spectator-read-only`.

## Errors

```ts
try {
  await client.secrets.deck<Card>('cards').play(tokenId)
} catch (error) {
  const code = error instanceof Error ? error.message : 'unknown'
  if (code === 'token-already-consumed') showAlreadyPlayed()
  else if (code === 'token-owner-mismatch') showWrongOwner()
  else throw error
}
```

Stable codes are `secret-transport-unavailable`, `spectator-read-only`, `unknown-system`, `wrong-system-kind`, `malformed-envelope`, `oversized-payload`, `request-conflict`, `request-history-expired`, `invalid-phase`, `deadline-elapsed`, `missing-local-commitment`, `commitment-mismatch`, `random-exhausted`, `collection-empty`, `hand-full`, `token-unknown`, `token-owner-mismatch`, `token-already-consumed`, `proof-invalid`, `signing-unavailable`, `signature-invalid`, and `restore-config-mismatch`.

| Category | Codes | What to do |
|---|---|---|
| Availability and access | `secret-transport-unavailable`, `spectator-read-only`, `signing-unavailable` | Do not retry until the connection, role, or server configuration changes. |
| Request validation and retry history | `unknown-system`, `wrong-system-kind`, `malformed-envelope`, `oversized-payload`, `request-conflict`, `request-history-expired` | Treat these as an integration error. The high-level SDK generates request IDs and retry sequences; do not reuse a sequence for different bytes. |
| Choice lifecycle | `invalid-phase`, `deadline-elapsed`, `missing-local-commitment`, `commitment-mismatch` | Refresh UI from confirmed public state. A missed or invalid reveal does not publish the attempted plaintext. |
| Random and collections | `random-exhausted`, `collection-empty`, `hand-full`, `token-unknown`, `token-owner-mismatch`, `token-already-consumed` | Disable the unavailable action or choose a live token. Draws and token consumption never fall back or partially succeed. |
| Cryptographic and restore integrity | `proof-invalid`, `signature-invalid`, `restore-config-mismatch` | Stop the secret flow. These indicate unverifiable authority data or state created for a different secret configuration. |

## Replay and score verification

Confirmed secret outcomes are stored in replay command history and server-ordered match logs. `verifyReplay` and `verifyScoredMatchLog` record verified commands immediately before stepping their matching frame, so `createSyncplaySecretEventReader(ctx)` produces the same choice, random, collection, and role events during verification as it did live.

When a replay or match-log frame contains a `syncplay.*` command, verification fails unless both `expectedAuthorityId` and `verifyAuthorityCommand` are supplied. The trusted server-side callback must:

- require the receipt authority, system, and request IDs to match the command and the expected room instance;
- recompute SHA-256 over the canonical command without its `receipt` and compare it with `receipt.body.commandHash`;
- resolve `receipt.body.kid` only from the trusted RUN signing-key ring; and
- verify the Ed25519 signature over the canonical receipt body.

Unknown command kinds, malformed command fields, changed values, unknown key IDs, bad signatures, and cross-room commands are rejected before that frame is simulated. Do not trust a public key embedded in replay data, and do not use the replay's deterministic checksum as a signature.

## Trusted-authority boundary

The trusted RUN authority can see configured and runtime secret values. Ed25519 receipts, signed roots, SHA-256 commitments, hash-chain reveals, and Merkle proofs prevent peers, spectators, and tampered replays from forging outcomes. They do not hide a player's own values from that player's browser/devtools and do not make the authority zero-knowledge.

Public snapshots stay secret-free. Server-only secret state restores separately against a cryptographic config hash. Public replay and score verification must supply a trusted authority-instance ID and signing-key verifier before simulating secret commands.
