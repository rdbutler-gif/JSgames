# Rate Limits

RUN.world API calls are rate-limited per authenticated user (or per IP for unauthenticated traffic) to protect platform stability. When you exceed a limit, the server returns HTTP `429 Too Many Requests`. Exact limits aren't published and may change; build for graceful degradation rather than a fixed throughput.

A few categories are stricter:

- Text generation (`textGen.requestChatCompletionAsync`) and image generation (`imageGen.generate`) are gated separately and may refuse at lower rates. Design these calls assuming they can fail, and keep your game playable when they do.
- Sensitive write operations (e.g. creating comments or accounts) have much tighter caps to prevent abuse.

Build for graceful degradation rather than aiming for exact throughput.

## How errors arrive

Structured SDK failures are `RundotApiError` instances. Each one carries:

| Field | Type | Description |
| --- | --- | --- |
| `code` | `string` | Machine-readable error code (e.g. `RATE_LIMITED`, `UNKNOWN`). Switch on this instead of parsing the message. |
| `status` | `number` | HTTP status when the error came over HTTP. `0` for transport/RPC errors that have no HTTP status. |
| `detail` | `string \| undefined` | Optional human-readable cause from the server (e.g. an upstream provider's validation message). |

Rate limits surface as `RateLimitedError`, a subclass of `RundotApiError`:

| Field | Type | Description |
| --- | --- | --- |
| `code` | `string` | Always `'RATE_LIMITED'`. |
| `status` | `number` | `429`, including when the original response crossed the host RPC bridge. |
| `retryAfterMs` | `number` | Server-suggested backoff in milliseconds. Read this to size your retry delay. |
| `message` | `string` | Defaults to `Rate limited. Retry after Ns.` when the server omits a custom message. |

{% hint style="warning" %}
**Detect by `code`, not message text.** Host-backed storage preserves `RATE_LIMITED` and `retryAfterMs` across the RPC bridge. Other API surfaces may still omit retry timing, so keep a conservative fallback. Across every transport, `code === 'RATE_LIMITED'` is the reliable signal.
{% endhint %}

{% hint style="info" %}
`RundotApiError` and `RateLimitedError` are not exported from the main package barrel or from the `@series-inc/rundot-game-sdk/api` entrypoint. Rather than relying on `instanceof`, detect rate limits by duck-typing: check `err.code === 'RATE_LIMITED'` (or `err.name === 'RateLimitedError'`). Both signals are reliable across every transport.
{% endhint %}

## Handling 429

Detect a rate limit by checking the error `code`, then back off using `retryAfterMs` when it's present:

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

try {
  await RundotGameAPI.appStorage.setItem('progress', JSON.stringify(progress))
} catch (err) {
  const apiErr = err as { code?: string; retryAfterMs?: number }
  if (apiErr.code === 'RATE_LIMITED') {
    const waitMs = apiErr.retryAfterMs ?? 1000
    // retry no sooner than waitMs, or keep the local state and try later
  } else if (apiErr.code === 'TIMEOUT') {
    // the caller stopped waiting; keep local state until a later save confirms
  }
}
```

## Best practices

- On a `RATE_LIMITED` error, back off before retrying.
- Read `RateLimitedError.retryAfterMs` (milliseconds) off the caught error to size your backoff. The SDK consumes the HTTP `Retry-After` value internally; game code never needs to inspect raw headers or parse `Error.message`.
- Do not retry tighter than once per second.
- For text generation and image generation, build a non-AI fallback path. Don't gate gameplay on these calls succeeding.
