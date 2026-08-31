# Big Numbers API

Handle exponential economies without losing precision. The Big Numbers API wraps `break_eternity` and exposes helpers for normalization, formatting, and progression math tuned for idle or incremental games.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const numbers = RundotGameAPI.numbers

const currency = numbers.normalize('BE:1.23e9')
const display = numbers.format.incremental(currency) // "1.23B"
```

## Type Checking

### `numbers.isBigNumber(value): boolean`

```typescript
// Check if a value is a big number
const isBig = numbers.isBigNumber(someValue)
```

`isBigNumber` returns `true` for exactly three kinds of value:

| Input | Returns `true` when |
|-------|---------------------|
| `string` | it starts with the `BE:` prefix (for example `'BE:1.23e9'`) |
| `Decimal` | it is a `Decimal` instance (from `numbers.normalize` or `new numbers.Decimal(...)`) |
| `number` | it is a plain JS number outside the safe-integer range (`> Number.MAX_SAFE_INTEGER` or `< Number.MIN_SAFE_INTEGER`) |

Every other value (a small plain number, a non-`BE:` string, `null`, `undefined`, objects) returns `false`.

### `numbers.normalize(value): Decimal`

Converts any input into a `Decimal` instance. This is the canonical way to undo the `BE:` persistence prefix recommended in [Best Practices](#best-practices).

| Input | Behavior |
|-------|----------|
| `Decimal` | returned unchanged (no copy) |
| `BE:`-prefixed string | the first 3 characters are stripped, then the remainder is parsed with `new Decimal(...)` (for example `'BE:1.23e9'` becomes `Decimal(1.23e9)`) |
| any other string or number | passed straight to `new Decimal(value)` |

```typescript
const fromStorage = numbers.normalize('BE:1.23e9') // Decimal(1.23e9)
const fromNumber = numbers.normalize(42)           // Decimal(42)
```

## Progression Math

### Geometric Series Costs

`calculateGeometricSeriesCost(baseCost, multiplier, currentQuantity, purchaseAmount)` computes the total cost of buying `purchaseAmount` upgrades, starting from `currentQuantity` already owned. It returns a **`Decimal`** instance, so feed the result into `format.incremental` / `formatDecimalCurrency` for display, or compare it with `.lt` / `.gt` / `.lte`.

```typescript
const totalCost = numbers.calculateGeometricSeriesCost(
  baseCost, // e.g., 10
  1.15,     // multiplier
  currentLevel,
  25,       // quantity to purchase
) // -> Decimal

numbers.formatDecimalCurrency(totalCost) // "$1.23K"
```

It uses the closed-form geometric series `a * (r^n - 1) / (r - 1)`, where `a = baseCost * r^currentQuantity`. When `multiplier` is exactly `1`, it short-circuits to the linear case `baseCost * purchaseAmount` (avoiding a divide-by-zero), so a flat-cost upgrade still works.

{% hint style="warning" %}
If `Decimal` math throws, the method logs a `[RUN]` `console.error` and falls back to native JavaScript math, returning a **plain `number`** instead of a `Decimal`. That fallback loses big-number precision, so treat the return value with `numbers.normalize` (or `isBigNumber`) before assuming it is always a `Decimal`.
{% endhint %}

### Max Affordable

`calculateMaxAffordableDecimal(availableCash, baseCost, multiplier, currentQuantity)` returns how many upgrades a player can buy with their current currency. It returns a plain **`number`**.

```typescript
const maxBuy = numbers.calculateMaxAffordableDecimal(
  playerCash,
  baseCost,
  multiplier,
  currentLevel,
)
```

Two bounds to know:

- Returns `0` when the player cannot afford even a single upgrade.
- The affordability search is capped at a safety limit of `1,000,000`, so the largest value it can ever return is on the order of `1,000,000`, even if more would technically be affordable. Size single purchase batches accordingly.

If the `Decimal` calculation throws, it logs a `[RUN]` `console.error` and falls back to `Math.floor(Number(availableCash) / Number(baseCost))`.

### Direct Decimal Usage

Access the underlying class for custom math:

```typescript
const { Decimal } = numbers

const a = new Decimal('1e308')
const b = new Decimal('1e308')
const result = a.times(b) // Handles numbers beyond JavaScript limits
```

`numbers.Decimal` is the [`break_eternity.js`](https://github.com/Patashu/break_eternity.js) `Decimal` class, so instances expose that library's full surface: arithmetic (`times` / `mul`, `div`, `sub`, `pow`), comparisons (`lt`, `gt`, `lte`, `eq`), `log10`, and formatters (`toFixed`, `toExponential`). `Decimal.pow(...)` is also available as a static. Refer to the `break_eternity.js` docs for the complete method list.

## Display Formatting

### `numbers.format.incremental(value): string`

Format a big-number or `Decimal` value for display with an abbreviated suffix. The output depends on the magnitude:

| Magnitude | Output | Example |
|-----------|--------|---------|
| `< 1000` | plain integer string, `toFixed(0)` (any fractional part is dropped) | `999` -> `"999"` |
| `1000` up to the largest suffix | value divided down, then `toFixed(2)` plus the suffix | `1.23e9` -> `"1.23B"` |
| above the largest suffix (`Dc`, `1e33`); exponential begins around `1e36` | 2-digit exponential notation | `1e40` -> `"1e40"` |

The full suffix set, each step 1000x larger than the last:

`K` (1e3), `M` (1e6), `B` (1e9), `T` (1e12), `Qa` (1e15), `Qi` (1e18), `Sx` (1e21), `Sp` (1e24), `Oc` (1e27), `No` (1e30), `Dc` (1e33).

{% hint style="info" %}
Suffixed output is fixed at 2 decimal places (`"1.23B"`, `"5.00M"`); the precision is not configurable. Once a value passes `Dc` the formatter switches to exponential notation rather than inventing new suffixes. `formatDecimalCurrency` wraps this method, so it inherits the same suffix table, 2-decimal precision, and exponential ceiling.
{% endhint %}

## Currency Formatting

### `numbers.formatDecimalCurrency(decimalValue): string`

Format a big-number or `Decimal` value as a currency string with a leading `$`. This wraps `numbers.format.incremental`, so it uses the same abbreviated suffixes (`K`, `M`, `B`, and so on) and falls back to `Number(...).toLocaleString()` if formatting fails.

| Parameter | Type | Description |
|-----------|------|-------------|
| `decimalValue` | `Decimal \| number` | The value to format. Pass a `Decimal` (for example from `numbers.normalize`) or a plain number. `BE:`-prefixed strings must be run through `numbers.normalize()` first; `formatDecimalCurrency` does not strip the `BE:` prefix itself, so passing one directly mis-parses. |

Returns a `string`, for example `"$1.23B"`.

```typescript
const cash = numbers.normalize('BE:1.23e9')
const label = numbers.formatDecimalCurrency(cash) // "$1.23B"
```

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `numbers.isBigNumber(value)` | `boolean` | `true` for a `BE:` string, a `Decimal`, or a number outside the safe-integer range |
| `numbers.normalize(value)` | `Decimal` | Convert string/number to a `Decimal` instance (strips the `BE:` prefix; passes a `Decimal` through unchanged) |
| `numbers.format.incremental(value)` | `string` | Format for display: integer below 1000, 2-decimal suffix up to `Dc`, exponential above |
| `numbers.calculateGeometricSeriesCost(base, mult, level, qty)` | `Decimal` | Total cost for upgrades (linear when `mult === 1`; native-math `number` on fallback) |
| `numbers.calculateMaxAffordableDecimal(cash, base, mult, level)` | `number` | Max purchasable quantity (`0` if none affordable; capped at ~1,000,000) |
| `numbers.formatDecimalCurrency(value)` | `string` | Format a big number as a currency string (e.g. "$1.23B") |
| `numbers.Decimal` | `class` | Direct access to the `break_eternity.js` `Decimal` class |

## Best Practices

- Store values as strings (e.g., `BE:` prefix) when persisting to avoid JSON precision issues.
- Normalize before performing comparisons so you're always working with Decimal instances.
- Keep formatting on the client; send raw numbers to your backend for canonical calculations.
- When storing big numbers, use `RundotGameAPI.appStorage` with string serialization.
