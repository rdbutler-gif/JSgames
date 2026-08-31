# Logging API

Stream logs to the RUN.world host for debugging and support. The logging API mirrors `console.log`/`console.error` semantics while tagging messages with your game instance.

{% hint style="info" %}
`log()` and `error()` are synchronous, fire-and-forget calls that return `void`. They never reject, so there is nothing to `.catch()`. The host deliberately swallows any transport errors. This is unlike most other SDK methods, which return promises. See [Error Handling](../error-handling.md) for the methods that do need a `.catch()`.
{% endhint %}

> **Mobile Debugging**: This API lets creators get logs from mobile devices where console access isn't available. Logs are collected and can be viewed through support tools for debugging production issues.

{% hint style="warning" %}
Before the SDK finishes initializing, `log()` and `error()` do not reach the host: they fall back to the local browser `console.log` / `console.error` and are not collected by host support tooling. Calls made very early in game startup may only appear in the local console, so they will not show up in mobile/production logs. Defer startup logging you need on-device until after initialization completes.
{% endhint %}

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

RundotGameAPI.log('Gameplay started', { level: currentLevel })
RundotGameAPI.error('Fatal error', error)
```

## Log levels

There are exactly two levels, picked by which method you call:

- `RundotGameAPI.log(...)` emits at the debug/`log` level.
- `RundotGameAPI.error(...)` emits at the `error` level.

There is no `warn` level, and the second argument is not an options bag. Any extra arguments are stringified and appended to the message text (see below), so passing `{ level: 'warn' }` does not change the level: the message still logs at the `log` level.

```typescript
// Debug-level logging
RundotGameAPI.log('Player moved', {
  position: { x: 100, y: 200 },
  velocity: { x: 5, y: 0 },
})

// Error-level logging
RundotGameAPI.error('Failed to load asset', {
  assetPath: 'images/boss.png',
  error: error.message,
})
```

## Extra arguments

Both methods are variadic, like `console.log` and `console.error`. The first argument is the message string; every additional truthy argument is converted to a string and appended to the message:

- An `Error` instance becomes `name: message`.
- A plain object is `JSON.stringify`'d. Objects that cannot be serialized (for example one with a circular reference) fall back to `String(arg)` and render as `[object Object]`, not JSON.
- Anything else is coerced with `String(...)`.

```typescript
RundotGameAPI.log('Level complete', { level: 5, score: 1200, timeElapsed: 45 })
// logged message: Level complete{"level":5,"score":1200,"timeElapsed":45}

RundotGameAPI.error('Operation failed', error)
// logged message: Operation failed<ErrorName>: <error message>
```

**Concatenation rules.** The stringified extra args are joined to each other with a single space, then appended to the message with no separator. So the message runs directly into the first arg, while subsequent args are space-separated from one another:

```typescript
RundotGameAPI.log('hit', { x: 1 }, { y: 2 })
// logged message: hit{"x":1} {"y":2}
```

{% hint style="warning" %}
Falsy extra args (`0`, `''`, `false`, `null`, `undefined`, `NaN`) are skipped entirely and never appear in the logged message. Only truthy args are stringified and appended. For example, `RundotGameAPI.log('count', 0)` logs just `count`, and `RundotGameAPI.log('flag', false)` logs just `flag`. Wrap a falsy value you actually want to see (for example `String(count)` or `{ count }`) before passing it.
{% endhint %}

{% hint style="warning" %}
Objects render as readable JSON inside the log message, but the host stores the whole thing as one flattened string, not as separately queryable fields. If you need structured data you can filter and aggregate on, use [`RundotGameAPI.analytics.recordCustomEvent`](ANALYTICS.md) instead.
{% endhint %}

## Error handling

```typescript
try {
  await riskyOperation()
} catch (error) {
  RundotGameAPI.error('Operation failed', error)

  // Also track in analytics for crash triage (queryable structured fields)
  await RundotGameAPI.analytics.recordCustomEvent('error_occurred', {
    type: 'operation_failed',
    message: error.message,
  })
}
```

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `log(message: string, ...args)` | `void` | Debug-level logging. Extra args are stringified and appended to the message. |
| `error(message: string, ...args)` | `void` | Error-level logging. Extra args are stringified and appended to the message. |

## Best Practices

- Use `error()` for failures and `log()` for everything else; those are your only two levels.
- Keep human-readable messages first, then pass context objects or `Error` instances as extra args.
- Throttle debug-level logging in production to reduce noise and bandwidth.
- For data you need to filter or aggregate on, use `RundotGameAPI.analytics.recordCustomEvent` rather than the log message string.
- Include relevant context (user ID, level, game state) so logs are useful when debugging production issues.
