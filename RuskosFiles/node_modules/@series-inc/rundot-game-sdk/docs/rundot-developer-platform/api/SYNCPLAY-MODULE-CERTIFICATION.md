# Syncplay module certification

> **PROVISIONAL:** The module certification API may change without deprecation
> until the two-genre promotion gate.

`certifyModule` checks a Syncplay component definition before it enters a game
composition:

```ts
import {
  certifyModule,
  type SyncplayModuleCertificationFixture,
} from '@series-inc/rundot-syncplay/tools'

const result = await certifyModule(characterComponent, fixture)
if (!result.ok) {
  throw new Error(result.failures.map(({ code }) => code).join(','))
}
```

The fixture supplies four things:

- module source paths;
- the existing `runSyncplaySynctest` runtime factory and policy;
- pairs of equivalent inputs constructed in different iteration orders;
- warmup, sample count, and strict step-time/retained-heap limits.

Certification delegates straight, rollback, replay, hydration, and input fuzzing
to `runSyncplaySynctest`. It does not implement a second replay engine.

## Module source policy

Source below `src/modules/` cannot use ambient `Math.*` or `Date`, import React,
React Native, Three.js, R3F, or another render module, own a random stream, or
iterate unordered object keys. Use deterministic math from the module context,
explicit authority inputs for random outcomes, and stable collection helpers.

The policy follows imports within `src/modules/`. Engine helpers outside that
directory keep the generic Syncplay determinism policy and are not accidentally
reclassified as module source.

## Resource protocol

Run certification under Node with `--expose-gc`:

```sh
node --expose-gc --import tsx certify-game-modules.ts
```

Step time is measured after the fixture's warmup and reduced at p99. Retained
heap bytes per step are measured after forced GC while every sampled result is
kept reachable. Missing GC support fails closed; it is never reported as a
zero-byte pass.

## Stable failure codes

- `SYNCPLAY_MODULE_CERT_STATIC_MATH`
- `SYNCPLAY_MODULE_CERT_STATIC_DATE`
- `SYNCPLAY_MODULE_CERT_STATIC_RENDER_IMPORT`
- `SYNCPLAY_MODULE_CERT_STATIC_RANDOM`
- `SYNCPLAY_MODULE_CERT_STATIC_ITERATION`
- `SYNCPLAY_MODULE_CERT_STATIC_DETERMINISM`
- `SYNCPLAY_MODULE_CERT_ITERATION_ORDER`
- `SYNCPLAY_MODULE_CERT_SYNCTEST_DIVERGENCE`
- `SYNCPLAY_MODULE_CERT_TIME_BUDGET`
- `SYNCPLAY_MODULE_CERT_ALLOCATION_BUDGET`
- `SYNCPLAY_MODULE_CERT_EXECUTION_ERROR`

Malformed fixture declarations throw
`SYNCPLAY_MODULE_CERT_FIXTURE_INVALID` before module code executes. Component,
runtime, and fixture callback exceptions become
`SYNCPLAY_MODULE_CERT_EXECUTION_ERROR`; their arbitrary error text is not copied
into the result.
