# Syncplay: Bots & AI (BETA)

Bots occupy ordinary player slots in Syncplay. The authority produces their
inputs using installed Kinetix mechanics, so every peer receives the same
confirmed input history and rollback, late join, replay, and reconnect treat bot
and human eras identically.

Bot gameplay must be declared in the Kinetix project as data. A game repository
does not ship a bot callback, reducer, or clock-driven AI loop.

```typescript
import type { KinetixSessionConfigSchema } from '@series-inc/rundot-syncplay/core/authoring'
import { createInstalledRuntimeAdapter } from '@series-inc/rundot-syncplay/core/runtime'

export const sessionConfigSchema: KinetixSessionConfigSchema = {
  id: 'arena-session/v1',
  version: 1,
  maxBytes: 4096,
  fields: { playerCount: { type: 'integer', min: 1, max: 8 } },
}

// Your simulation owns the bot blackboard and the bot-input step; the adapter
// binds it to the runtime ABI. Bot state must live inside captured state so
// checkpoints and rollback cover it.
export const runtime = createInstalledRuntimeAdapter({
  createState: (identity, sessionConfigBytes) => initialArenaState(identity, sessionConfigBytes),
  step: (state, inputs) => stepArenaWithBots(state, inputs),
})
```

Only mechanics present in the selected installed profile may be referenced.
Evaluation order, tie-breaking, frame cadence, and RNG stream names are part of
that installed mechanic's deterministic contract.

The room records occupied human slots independently from substituted or bot
input. When a human drops into a bot-controlled slot, the transition happens on
a confirmed tick. A late joiner replays the bot era followed by the human era
from the same input log.

Use read-only Kinetix inspection data for debugging and presentation. Never put
render objects, wall-clock timers, browser randomness, or network reads into the
authoritative bot declaration.
