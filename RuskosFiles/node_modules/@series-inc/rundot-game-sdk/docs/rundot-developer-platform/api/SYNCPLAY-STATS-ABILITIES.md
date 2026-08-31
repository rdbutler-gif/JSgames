# Syncplay: Stats and Abilities (PROVISIONAL)

> This module API is provisional until the two-genre promotion gate.

Import the code-only module from:

```ts
import {
  createSyncplayStatsAbilitiesSlice,
  replaceSyncplayStatModifiersBySource,
  statsAbilitiesComponent,
  stepSyncplayStatsAbilities,
} from '@series-inc/rundot-syncplay/modules/stats-abilities'
```

The module owns canonical stat values, ability phases and cooldowns, status
instances, experience and level, and resolved loot records. Rendering, binary
content, authority-owned randomness, inventory storage, and equipment slot
rules remain outside it.

## Deterministic numeric model

All stat values and modifier values are safe integers. Add modifiers are applied
first; multiply modifiers use `context.math.fixedScale` units and are applied
second. Each stage sorts by `sourceId`, then modifier `id`. Checked
multiplication and the fixed-point quotient must remain safe integers; invalid
or unsafe state fails before mutation.

Use `recomputeSyncplayStatBlock(base, modifiers, math)` to build a complete
`SyncplayStatBlock`. The returned `base`, normalized `modifiers`, and derived
`values` are detached and frozen.

## Equipment modifier handoff

Equipment owns slots and submits replayable input to this module. Use one stable
source ID per slot:

```ts
const sourceId = `equipment:${ownerId}:${slotId}`

const input = {
  statModifierReplacements: [{
    requestId: equipCommandId,
    sourceId,
    modifiers: [{
      id: 'armor',
      sourceId,
      statId: 'defense',
      operation: 'add',
      value: 250,
    }],
  }],
}
```

An empty `modifiers` array unequips the slot. The live step validates the full
replacement atomically and internally calls
`replaceSyncplayStatModifiersBySource(block, sourceId, replacements, math)`.
Do not mutate the block or call the helper between simulation steps. Status
modifiers reserve the `status:` prefix; equipment must not use it.

Replacement requests are ordered by `requestId`. A second request for the same
source in one frame is rejected as `duplicate-source`. Other stable rejection
reasons are `source-mismatch`, `reserved-source`, `unknown-stat`,
`duplicate-modifier`, and `unsafe-arithmetic`.

## Frame ordering

For frame `F`, `stepSyncplayStatsAbilities` performs the reviewed order:

1. validate the complete slice, config, context, and input;
2. process ability interrupts;
3. advance ability phase and cooldown timers;
4. expire statuses and recompute status modifiers;
5. apply status requests;
6. apply source modifier replacements;
7. grant experience and emit one event for every gained level;
8. resolve explicit loot tickets;
9. process new ability activations and costs;
10. validate and return the frozen next slice, events, and projection.

Invalid structural input throws `SYNCPLAY_STATS_ABILITIES_INPUT_INVALID`.
Invalid authored configuration or math context throws
`SYNCPLAY_STATS_ABILITIES_CONFIG_INVALID`. Corrupt state or unsafe derived
arithmetic throws `SYNCPLAY_STATS_ABILITIES_SLICE_INVALID`. These failures are
atomic.

## Abilities and statuses

Abilities declare frame counts and resource costs. A valid activation moves
through `casting`, `channeling`, and `idle`; zero-length phases commit or
complete in the same step. Interrupts apply before phase advancement. Stable
activation rejection reasons are `unknown-ability`, `active`, `cooldown`, and
`insufficient-resource`; interrupt rejection reasons are `unknown-ability`,
`idle`, and `duplicate-interrupt`.

Status applications identify both the definition and stable instance. Reusing
an instance with another definition is rejected as
`instance-definition-conflict`. Reapplying a matching instance increases its
stack up to `maxStacks` and refreshes its duration. Status modifier IDs are
derived from the status instance and stack, so rollback and hydration reproduce
the same stat block.

## Experience and loot

`experienceThresholds` are cumulative, strictly increasing thresholds. A grant
may cross multiple thresholds in one frame, producing one `level-gained` event
per level.

Loot tables contain positive integer weights. The module does not generate
randomness. Authority supplies `SyncplayLootRoll.ticket` as explicit synced
input, and `resolveSyncplayLootRoll(table, roll)` maps that ticket to a canonical
entry. This is deterministic loot resolution, distinct from platform Stats
analytics and from Simulation/Gacha service configuration.

## Events and rollback identity

The event union covers:

- ability started, committed, completed, interrupted, and rejected;
- modifier replacement success or rejection;
- status application, expiry, and rejection;
- level gain;
- loot resolution or rejection.

Every record is a `synced` module event. Its dedupe identity is derived from
`(moduleId, sourceId, eventId, frame, ordinal)`. Events are normalized by the
reviewed frame order and stable request/instance identifiers before ordinals are
assigned. Presentation should consume these records through the shared module
event adapter so rollback re-simulation cannot duplicate one-shot effects.

## Public surface

The entrypoint exports the stat, modifier, ability, status, progression, loot,
input, context, event, slice, and projection types, plus:

- `recomputeSyncplayStatBlock`
- `replaceSyncplayStatModifiersBySource`
- `resolveSyncplayLootRoll`
- `createSyncplayStatsAbilitiesSlice`
- `stepSyncplayStatsAbilities`
- `projectSyncplayStatsAbilities`
- `statsAbilitiesComponent`
