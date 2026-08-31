# Syncplay: Entity Registry (PROVISIONAL)

Import the deterministic entity registry from:

```ts
import {
  createSyncplayEntityRegistry,
  entityRegistryModuleApiStability,
} from '@series-inc/rundot-syncplay/modules/entity-registry'
```

This API is **PROVISIONAL**. It lets a game register its own entity
behaviours. Each behaviour declares a `SyncplayModuleIdentity`, initializes a
portable slice, and steps that slice for one entity.

The registry folds entity type and module identity into a manifest digest. Call
`bind` with the peer manifest before calling `step`. A missing or different
manifest fails closed. The registry seeds entities in code-unit order and
steps them in the same order, independent of registration order.

Keep entity slices as plain portable objects. Keep game-specific entity types
and authoring data in the consuming game.
