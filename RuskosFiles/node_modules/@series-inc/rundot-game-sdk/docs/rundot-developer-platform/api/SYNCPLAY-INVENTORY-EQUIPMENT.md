# Syncplay: Inventory and Equipment

> **STABLE:** This module API passed the FPS and ARPG promotion gate.

Import the code-only module from:

```ts
import {
  createSyncplayInventoryEquipmentSlice,
  inventoryEquipmentComponent,
  pickupFromSyncplayLootResult,
  stepInventoryEquipmentWithStats,
  stepSyncplayInventoryEquipment,
} from '@series-inc/rundot-syncplay/modules/inventory-equipment'
```

The module owns canonical inventory slots, item stacks, equipment references,
loot-container slots, pickups, and drops. It does not own loot randomness,
persistence, trading, crafting, rendering, UI, or binary assets.

## Canonical state

Owners declare stable inventory-slot and equipment-slot IDs. Containers declare
stable slot IDs and optional initial stacks. Empty slots are always
`{ itemId: null, quantity: 0 }`; non-empty slots have a known item and a
positive quantity no greater than that item's `maxStack`.

An equipment slot references an inventory slot. It never copies or creates an
item instance. The referenced inventory slot must contain exactly one item that
allows the equipment slot, and one inventory slot cannot be referenced by two
equipment slots. Transfers and drops that would mutate an equipped inventory
slot reject atomically.

The component's context-free initial slice is uninitialized. Its first step
builds the canonical state from `context.config` before applying input. Use
`createSyncplayInventoryEquipmentSlice(config)` when an initialized slice is
needed directly.

## Requests and deterministic ordering

`stepSyncplayInventoryEquipment` accepts explicit `transfer`, `consume`, `drop`,
and `equip` requests. Transfers name a source, target, and positive quantity.
Consume requests atomically remove a positive quantity from an inventory slot,
container slot, or pickup and emit `item-consumed`. An inventory or container
slot becomes `{ itemId: null, quantity: 0 }` when its last item is consumed; a
depleted pickup is removed. Drops name an inventory slot, a caller-supplied
pickup ID, and a positive quantity. Equip requests set or clear one equipment
reference. Consuming from an equipped inventory slot rejects as
`equipped-source`.

Requests are evaluated in canonical request-ID order. A later request touching
an inventory, container, pickup, or equipment location already changed in the
same frame rejects as `location-conflict`. Caller array order therefore cannot
change the resulting slice, events, or stat replacements.

Valid-domain rejection emits `inventory-request-rejected` without mutating the
request's locations. Reasons are:

- `unknown-location`, `unknown-item`, or `empty-source`;
- `quantity-unavailable`, `target-item-mismatch`, or `target-capacity`;
- `equipped-source` or `same-location`;
- `unknown-owner`, `unknown-equipment-slot`, `item-not-equippable`, or
  `already-equipped`;
- `duplicate-pickup`, `duplicate-request`, or `location-conflict`.

Malformed input throws `SYNCPLAY_INVENTORY_EQUIPMENT_INPUT_INVALID`. Invalid
authored config throws `SYNCPLAY_INVENTORY_EQUIPMENT_CONFIG_INVALID`. Corrupt
state throws `SYNCPLAY_INVENTORY_EQUIPMENT_SLICE_INVALID`. These failures occur
before the caller's slice is mutated.

## Equipment-to-stat composition

Every successful equipment transition emits one complete modifier replacement
for:

```ts
const sourceId = `equipment:${ownerId}:${equipmentSlotId}`
```

Modifier IDs are `<itemId>:<templateId>`. Unequip emits an empty replacement.
`stepInventoryEquipmentWithStats` steps inventory once, groups replacements by
owner, then calls the real
`@series-inc/rundot-syncplay/modules/stats-abilities` step for every configured
owner. The inventory module never mutates or recomputes a stat block itself.

The stats-slice and stats-config records must contain exactly the configured
owner IDs. A missing owner, extra owner, or generated replacement rejected by
the stats module fails closed with
`SYNCPLAY_INVENTORY_EQUIPMENT_COMPOSITION_INVALID`.

## Loot handoff

Loot selection remains in the stats/abilities module and consumes an explicit
authority-supplied ticket. After a successful loot roll,
`pickupFromSyncplayLootResult(result, pickupId)` creates a canonical pickup from
the resolved item and quantity plus a caller-supplied stable pickup ID. It does
not roll again or generate an ID.

## Events and rollback identity

The event union covers transfer, consume, drop, equip, unequip, and rejection.
Every event is a synced module record with identity derived from
`(moduleId, sourceId, eventId, frame, ordinal)`. Presentation should consume
these through the shared module event adapter so replay does not duplicate
one-shot effects.

## Public surface

The entrypoint exports the item, owner, slot, equipment, container, pickup,
location, request, input, context, event, slice, projection, rejection, and
composition types, plus:

- `createSyncplayInventoryEquipmentSlice`
- `stepSyncplayInventoryEquipment`
- `stepInventoryEquipmentWithStats`
- `pickupFromSyncplayLootResult`
- `projectSyncplayInventoryEquipment`
- `inventoryEquipmentComponent`
