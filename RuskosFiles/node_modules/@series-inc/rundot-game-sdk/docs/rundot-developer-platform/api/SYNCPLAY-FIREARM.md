# Syncplay: Firearm Module (PROVISIONAL)

> **PROVISIONAL:** The deterministic firearm core has one production example
> consumer. Its API may change until a second genre proves the same contract.

Import the code-only module from:

```ts
import {
  createSyncplayFirearmSlice,
  firearmComponent,
  stepSyncplayFirearm,
  stepSyncplayFirearmWithInventory,
} from '@series-inc/rundot-syncplay/modules/firearm'
```

The module owns canonical magazine, cadence, reload, recoil, spread-sequence,
and trigger-edge state for authored semi-automatic or automatic weapons.
`stepSyncplayFirearmWithInventory` completes a reload atomically through the
public inventory/equipment API and consumes only the definition's exact ammo
item.

Aim, hit resolution, damage, teams, scoring, animation, audio, weapon switching,
attachments, chamber rules, and per-shell reloads remain caller-owned. Invalid
definition, input, context, slice, or inventory bindings fail closed with a
stable `SYNCPLAY_FIREARM_*` error.
