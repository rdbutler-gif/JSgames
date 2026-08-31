# Syncplay: Unit Control Module (PROVISIONAL)

Import the deterministic unit-control module from:

```ts
import {
  projectSyncplayUnitControl,
  stepSyncplayUnitControl,
  unitControlComponent,
} from '@series-inc/rundot-syncplay/modules/unit-control'
```

This API is **PROVISIONAL**. It owns temporary control phases and two-unit grab
bonds. The phases are `free`, `grabbing`, `grabbed`, `knockdown`, `grounded`,
and `standing-up`.

The input supplies the current sorted roster. The module enrolls new units as
free and removes units that leave the roster. Grab attempts, releases, throws,
struggles, and external knockdowns are explicit commands. The module emits
deterministic transition events. The projection reports `canAct` and the unit
at the other end of a bond.

Use integer frame durations and the `integer-fixed` math profile. Keep combat,
movement, health, and rendering policy in the consuming game.
