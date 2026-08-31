# Gamepad API

Read hardware controllers (gamepads) with a single normalized model that works
identically across desktop web, the Steam Deck / Steam shell, and mobile
hardware controllers (Backbone on iOS and Android). Write your input code once
and `RundotGameAPI.gamepad` reports the same button names, axis signs, and analog
trigger values on every surface.

The host decides how input is sourced for you — either a zero-latency direct
read of the browser's Web Gamepad API, or a host-mediated stream where the
platform lacks a reliable Web Gamepad API (some mobile WebViews) or remaps input
through Steam Input on the Deck. Your game cannot tell which path served it.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

if (RundotGameAPI.gamepad.isSupported()) {
  const onConnected = RundotGameAPI.gamepad.onConnected((event) => {
    console.log(`controller ${event.index} connected: ${event.id}`)
  })

  const onDisconnected = RundotGameAPI.gamepad.onDisconnected((event) => {
    console.log(`controller ${event.index} disconnected`)
  })

  // Poll inside your own requestAnimationFrame loop:
  function tick(): void {
    for (const pad of RundotGameAPI.gamepad.getGamepads()) {
      if (pad.buttons.a.pressed) jump()
      move(pad.axes.leftX, pad.axes.leftY)
      accelerate(pad.buttons.rightTrigger.value) // analog 0..1
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  // On teardown:
  // onConnected.unsubscribe(); onDisconnected.unsubscribe()
}
```

`getGamepads()` is synchronous and never throws — poll it from your own render
loop. It returns only currently-connected pads (no `null`/disconnected slots),
so an empty array means no controller is attached.

## Capability Detection

`isSupported()` reflects **capability**, not whether a pad is currently
connected. It is `true` on any controller-capable surface (even with no pad
attached) and `false` on a surface that cannot read controllers (or on a host
build that predates this feature). Use it to decide whether to show
controller-specific UI.

```typescript
if (!RundotGameAPI.gamepad.isSupported()) {
  // Fall back to touch/keyboard controls.
}
```

`getGamepads()` returns `[]` and the connect/disconnect events never fire when
input is unsupported — there is never an error or a hang.

## Connect / Disconnect Events

```typescript
const sub = RundotGameAPI.gamepad.onConnected((event) => {
  // event: { index: number; id: string; source: GamepadSource }
})
// Later:
sub.unsubscribe()
```

A controller already attached when your game starts still fires `onConnected`,
so you don't need a separate "scan on startup" path.

## Multiple Controllers (Local Co-op)

Every surface supports multiple simultaneous controllers. `getGamepads()`
returns one snapshot per connected pad, and each pad keeps a **stable
`index` for the lifetime of its connection** — another pad connecting or
disconnecting never changes it. Indices are compact: the first pad gets `0`,
the next free slot goes to the next pad, and a disconnected pad's index is
reused by the next controller that connects.

Key players by `index` and manage membership from the connect/disconnect
events:

```typescript
const players = new Map<number, Player>()

RundotGameAPI.gamepad.onConnected((event) => {
  players.set(event.index, createPlayer(event.index))
})

RundotGameAPI.gamepad.onDisconnected((event) => {
  players.delete(event.index) // or pause and show a "reconnect" prompt
})

function tick(): void {
  for (const pad of RundotGameAPI.gamepad.getGamepads()) {
    players.get(pad.index)?.applyInput(pad)
  }
  requestAnimationFrame(tick)
}
```

Don't assume a specific player owns index `0` — on some platforms the pad
that connected first gets it, and after a disconnect the slot is recycled.
If your game needs persistent player identities across reconnects, prompt
for a button press ("press A to rejoin") rather than trusting the index.

## Normalized Model

Every surface reports the same `GamepadSnapshot`. Button names follow the W3C
standard layout (Xbox naming); analog triggers report `value` in `0..1` and
sticks report each axis in `-1..1`.

```typescript
interface GamepadSnapshot {
  index: number
  id: string
  connected: boolean
  source: GamepadSource
  standardMapping: boolean // false = best-effort mapping
  buttons: Record<GamepadButtonName, { pressed: boolean; value: number }>
  axes: { leftX: number; leftY: number; rightX: number; rightY: number }
  sourceTimestamp: number // when the device was sampled
  deliveredTimestamp: number // when the SDK served it (>= sourceTimestamp)
}
```

### Button map

| `GamepadButtonName` | Standard control |
| --- | --- |
| `a`, `b`, `x`, `y` | Face buttons |
| `leftBumper`, `rightBumper` | Shoulder buttons (L1 / R1) |
| `leftTrigger`, `rightTrigger` | Analog triggers (L2 / R2), `value` in `0..1` |
| `select`, `start`, `guide` | Back / Start / Home |
| `leftStick`, `rightStick` | Stick clicks (L3 / R3) |
| `dpadUp`, `dpadDown`, `dpadLeft`, `dpadRight` | D-pad |

### Axis map

| Axis | Range | Notes |
| --- | --- | --- |
| `leftX` | `-1..1` | Left stick X (left = `-1`, right = `+1`) |
| `leftY` | `-1..1` | Left stick Y (up = `-1`, down = `+1`) |
| `rightX` | `-1..1` | Right stick X |
| `rightY` | `-1..1` | Right stick Y |

### Sources

`source` tells you where the snapshot came from. It does not change how you read
the data — the model is identical regardless.

| `GamepadSource` | Surface |
| --- | --- |
| `web-gamepad` | Desktop web / browser Web Gamepad API |
| `steam-input` | Steam Input (Steam Deck + remapped pads) |
| `ios-gamecontroller` | iOS GameController (Backbone, MFi) |
| `android-input` | Android InputDevice |

## Latency Telemetry

Each snapshot carries `sourceTimestamp` (when the provider sampled the device)
and `deliveredTimestamp` (when the SDK served it). On the zero-latency direct
path the two are equal; on the host-mediated path `deliveredTimestamp` is larger
by the transport cost, so `deliveredTimestamp - sourceTimestamp` is the added
input latency.

`gamepad.__debug.getLatencyStats()` returns `{ p50, p95, max, sampleCount }` in ms
over a rolling window. It is **off by default** (returns `sampleCount: 0`) and
only records when the input debug flag is enabled, in which case the host also
logs a structured `gamepad.latency` event to its observability pipeline.

```typescript
const { p95, sampleCount } = RundotGameAPI.gamepad.__debug.getLatencyStats()
```

## Best Practices

- Poll `getGamepads()` from your own `requestAnimationFrame` loop — never store
  the array, read it fresh each frame.
- Gate controller UI on `isSupported()`, and always keep a touch/keyboard
  fallback for surfaces without a controller.
- Unsubscribe from `onConnected`/`onDisconnected` when your game tears down.
- Treat `value` on triggers as analog (`0..1`) and apply your own dead-zone to
  sticks; raw axes are reported untouched in `-1..1`.
- For local co-op, key players by `pad.index` — it is stable per connection
  and compact across all surfaces.
