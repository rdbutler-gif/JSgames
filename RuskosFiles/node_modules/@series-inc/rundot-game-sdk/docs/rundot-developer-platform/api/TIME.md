# Time API

Sync with server time, format timestamps with localized options, and compute future times without relying on client clocks.

All four methods are top-level on `RundotGameAPI`; there is no `time` namespace.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const serverTime = await RundotGameAPI.requestTimeAsync()
console.log(serverTime.serverTime, serverTime.timezoneOffset)
```

{% hint style="info" %}
Use server time for cooldowns and limited-time offers. The device clock can be tampered with or simply wrong; `requestTimeAsync()` gives you a trusted reference from the host.
{% endhint %}

## Formatting Helpers

```typescript
const formatted = RundotGameAPI.formatTime(Date.now(), {
  dateStyle: 'full',
  timeStyle: 'medium',
  hour12: true,
})

// Pass at least an empty object; calling formatTime without options throws.
const defaults = RundotGameAPI.formatTime(Date.now(), {})

const formattedNumber = RundotGameAPI.formatNumber(1234567.89, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
```

Both helpers run through the player's resolved locale (via `getLocale()`), so output matches the player's region without any extra work on your end.

## Future Calculations

```typescript
const futureTime = await RundotGameAPI.getFutureTimeAsync({
  days: 1,
  hours: 2,
  minutes: 30,
})
```

Pin the result to a specific time of day, optionally in Pacific Time:

```typescript
// Tomorrow at 9:00 AM Pacific (DST handled automatically)
const dailyReset = await RundotGameAPI.getFutureTimeAsync({
  days: 1,
  timeOfDay: { hour: 9, minute: 0, second: 0 },
  timezone: 'PT',
})
```

## API Reference

| Method | Returns | Description |
| --- | --- | --- |
| `requestTimeAsync()` | `Promise<ServerTimeData>` | Fetch trusted server time plus locale and timezone context. |
| `getFutureTimeAsync(options?)` | `Promise<number>` | Compute a future epoch timestamp (ms) relative to server time. With no args, returns the current server time. |
| `formatTime(timestamp, options)` | `string` | Format an epoch timestamp (ms) using the player's locale. `options` is required (pass `{}` for defaults). |
| `formatNumber(value, options?)` | `string` | Format a number using the player's locale. |

### `requestTimeAsync(): Promise<ServerTimeData>`

Returns the host's current server time along with the data you need to reconcile it against the device clock.

| Field | Type | Description |
| --- | --- | --- |
| `serverTime` | `number` | Server time as epoch milliseconds. Use this as your trusted clock. |
| `localTime` | `number` | Device/client time as epoch milliseconds. Compare against `serverTime` to measure client clock drift. |
| `timezoneOffset` | `number` | The player's timezone offset in minutes. |
| `formattedTime` | `string` | Host-formatted, locale-aware string for the server time. |
| `locale` | `string` | The player's resolved locale (for example `en-US`). |

```typescript
const { serverTime, localTime, timezoneOffset, formattedTime, locale } =
  await RundotGameAPI.requestTimeAsync()

const driftMs = localTime - serverTime
console.log(`Client clock is off by ${driftMs}ms`, locale)
```

### `getFutureTimeAsync(options?): Promise<number>`

Computes a future timestamp relative to the current server time and returns it as epoch milliseconds. The method fetches server time internally, so the result is anchored to a trusted clock rather than the device. Called with no arguments, it returns the current server time.

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `days` | `number` | No | - | Days to add to server time. |
| `hours` | `number` | No | - | Hours to add to server time. |
| `minutes` | `number` | No | - | Minutes to add to server time. |
| `timeOfDay` | `{ hour?: number; minute?: number; second?: number }` | No | - | Pin the result to a specific time of day. Each field defaults to `0` when omitted (so `{ hour: 9 }` means 09:00:00). Applied in the player's local time, or in the chosen `timezone` when set. |
| `timezone` | `string` | No | local time | Resolve `timeOfDay` in a named timezone. Only Pacific Time (`'PT'`, `'PST'`, `'PDT'`) is supported, with DST handled automatically. The value is matched case-insensitively, so `'pt'`, `'pst'`, and `'pdt'` work too. Any other value falls back to local time and logs a warning. |

{% hint style="warning" %}
When `timezone` is Pacific, the result is computed from UTC midnight of the target day plus `timeOfDay` converted from Pacific to UTC. If you set `timezone` but omit `timeOfDay`, the result pins to 00:00 Pacific (midnight) of that day, not the current time of day. Pass `timeOfDay` whenever you want a specific Pacific hour, such as a daily reset.
{% endhint %}

```typescript
// 36 hours from now
const inThirtySixHours = await RundotGameAPI.getFutureTimeAsync({
  hours: 36,
})

// Next day's 6:00 AM Pacific reset
const reset = await RundotGameAPI.getFutureTimeAsync({
  days: 1,
  timeOfDay: { hour: 6, minute: 0, second: 0 },
  timezone: 'PST',
})
```

### `formatTime(timestamp, options): string`

Formats an epoch timestamp (milliseconds) as a locale-aware string using the player's resolved locale. Your `options` are merged over the defaults below.

{% hint style="warning" %}
`options` is effectively required. The implementation reads `options.dateStyle` without a null guard, so calling `formatTime(Date.now())` with no options object currently throws `TypeError: Cannot read properties of undefined`. Pass `{}` to get the defaults.
{% endhint %}

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `dateStyle` | `string` | `'medium'` | Date formatting style (`'full'`, `'long'`, `'medium'`, `'short'`). |
| `timeStyle` | `string` | `'medium'` | Time formatting style (`'full'`, `'long'`, `'medium'`, `'short'`). |
| `hour12` | `boolean` | `true` | Use 12-hour clock. |

Any other `Intl.DateTimeFormat` option you pass is forwarded as-is.

```typescript
RundotGameAPI.formatTime(Date.now(), {}) // uses defaults + player locale
RundotGameAPI.formatTime(Date.now(), { timeStyle: 'short', hour12: false })
```

### `formatNumber(value, options?): string`

Formats a number as a locale-aware string using the player's resolved locale. Your `options` are merged over the defaults below. If formatting throws, it falls back to `String(value)`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `style` | `string` | `'decimal'` | Number style (`'decimal'`, `'currency'`, `'percent'`, `'unit'`). |
| `minimumFractionDigits` | `number` | `0` | Minimum digits after the decimal point. |
| `maximumFractionDigits` | `number` | `2` | Maximum digits after the decimal point. |

Any other `Intl.NumberFormatOptions` field (for example `currency`) is forwarded as-is.

```typescript
RundotGameAPI.formatNumber(1234567) // "1,234,567" in en-US
RundotGameAPI.formatNumber(0.42, { style: 'percent' }) // "42%"
```

## Best Practices

- Use server time for cooldowns or limited-time offers to avoid client clock tampering.
- Cache the server response and update periodically rather than spamming the endpoint.
- When formatting numbers or times, remember the host automatically applies the player's locale.
