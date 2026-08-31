# Access Gate API

Control access to premium APIs based on user authentication status.

---

## Overview

The Access Gate sits in front of sensitive SDK methods (TextGen, ImageGen, AudioGen, SpriteGen, ThreeDGen, and UGC account mutations) and blocks anonymous users from calling them. When a gated method is invoked:

1. The gate checks whether the current user is authenticated.
2. If **auto-prompt login** is enabled, the SDK automatically shows a login prompt.
3. If the user logs in successfully the original call proceeds. Otherwise the returned Promise rejects with an `AccessDeniedError`.

This lets you build features that gracefully degrade for anonymous users while keeping premium functionality behind authentication.

{% hint style="info" %}
Gated methods are always async and never throw synchronously, even when auto-prompt is disabled. The gate returns a rejected Promise, so always `await` the call (or attach `.catch()`); a non-awaited gated call produces an unhandled rejection rather than a synchronous throw.
{% endhint %}

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'
import { AccessDeniedError } from '@series-inc/rundot-game-sdk'

// Check auth status before making a gated call
if (RundotGameAPI.accessGate.isAnonymous()) {
  console.log('User is not logged in')
}

// Gated calls throw AccessDeniedError when blocked
try {
  const models = await RundotGameAPI.textGen.getAvailableCompletionModels()
  console.log('Models:', models)
} catch (error) {
  if (error instanceof AccessDeniedError) {
    console.log('Login required:', error.requiredTier)
  }
}
```

---

## Auto-Prompt Login

When enabled, the SDK automatically shows a login dialog whenever an anonymous user calls a gated method. If the user completes login the call proceeds transparently; if they cancel, an `AccessDeniedError` is thrown.

```typescript
// Enable (on by default)
RundotGameAPI.accessGate.autoPromptLogin = true

// Disable: gated calls reject immediately for anonymous users
// (the returned Promise rejects with AccessDeniedError; await or .catch() it)
RundotGameAPI.accessGate.autoPromptLogin = false
```

---

## Manual Login

Use `promptLogin()` to trigger the login flow yourself, for example from a button or a pre-flight check:

```typescript
const result = await RundotGameAPI.accessGate.promptLogin()

if (result.success) {
  console.log('Logged in as', result.profile?.username)
} else {
  console.log('Login cancelled')
}
```

On success, `result.profile` carries the logged-in user's profile:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable user id of the logged-in profile. |
| `username` | `string` | The user's handle. |
| `name` | `string?` | Optional display name (distinct from `username`). |
| `avatarUrl` | `string \| null?` | Optional avatar URL; may be `null`. |
| `isAnonymous` | `boolean?` | Whether the profile is anonymous. After a successful `promptLogin()` this is `false`. |

{% hint style="info" %}
A successful `promptLogin()` updates the SDK's cached profile (`id`, `username`, `avatarUrl`, `isAnonymous`), so a follow-up `isAnonymous()` or `getAccessTier()` immediately reflects the authenticated state without re-init. This is why the auto-prompt flow can transparently retry the original gated call after login.
{% endhint %}

---

## Gated APIs and Methods

### TextGen

| Method | Description |
|--------|-------------|
| `textGen.requestChatCompletionAsync(request)` | Generate text completion |
| `textGen.getAvailableCompletionModels()` | List available models |

{% hint style="warning" %}
`textGen.requestChatCompletionStreamAsync(request, options?)` is intentionally **not** wrapped by the synchronous SDK gate. Wrapping it would turn the `AsyncIterable` return value into a `Promise`, breaking `for await` consumers. The host-side gate still rejects streaming requests from anonymous users: instead of a synchronous `AccessDeniedError`, the error surfaces on the iterable's first `next()` / `for await` iteration.
{% endhint %}

### ImageGen

| Method | Description |
|--------|-------------|
| `imageGen.generate(params)` | Generate an image from a text prompt |
| `imageGen.estimateDepth(params)` | Estimate a depth map for an image |
| `imageGen.removeBackground(params)` | Remove an image's background |

### AudioGen

| Method | Description |
|--------|-------------|
| `audioGen.generate(params)` | Generate audio from a prompt |
| `audioGen.designVoices(params)` | Design candidate voices |
| `audioGen.saveDesignedVoice(params)` | Save a designed voice for reuse |

### SpriteGen

| Method | Description |
|--------|-------------|
| `spriteGen.generate(params)` | Generate a sprite |
| `spriteGen.animate(params)` | Animate a sprite |

### ThreeDGen

| Method | Description |
|--------|-------------|
| `threeDGen.generate(params)` | Generate a 3D model |
| `threeDGen.remesh(params)` | Remesh an existing model |
| `threeDGen.rig(params)` | Rig a model for animation |
| `threeDGen.animate(params)` | Animate a rigged model |

### UGC account mutations

Browse, get, and `recordUse` remain **ungated**. `recordUse` accepts anonymous users so plays can be counted without prompting them to log in. Account mutations require authentication.

| Method | Description |
|--------|-------------|
| `ugc.create(params)` | Publish new content |
| `ugc.update(params)` | Update existing content |
| `ugc.delete(id)` | Delete content |
| `ugc.like(id)` | Like content |
| `ugc.unlike(id)` | Unlike content |
| `ugc.report(params)` | Report content (`UgcReportParams`) |

---

## Error Handling

Gated methods throw `AccessDeniedError` when the user does not meet the required access tier. Catch it to show custom UI or fall back gracefully:

```typescript
import { AccessDeniedError } from '@series-inc/rundot-game-sdk'

try {
  await RundotGameAPI.imageGen.generate({ prompt: 'A sunset' })
} catch (error) {
  if (error instanceof AccessDeniedError) {
    console.log(error.requiredTier) // 'authenticated_18plus'
    console.log(error.action)       // always 'prompt_login' for SDK-gated calls
  }
}
```

### AccessDeniedError

| Property | Type | Description |
|----------|------|-------------|
| `requiredTier` | `AccessTier` | The tier the user must reach (`'anonymous'` \| `'authenticated_18plus'`) |
| `action` | `'prompt_login' \| 'prompt_age_gate'` | The remediation action required to satisfy the gate. SDK-gated method calls always set this to `'prompt_login'`; `'prompt_age_gate'` exists on the type for host-side age-gated flows and is never emitted by a gated SDK call. |

---

## API Reference

### `RundotGameAPI.accessGate`

| Method / Property | Returns | Description |
|-------------------|---------|-------------|
| `getAccessTier()` | `AccessTier` | Current user's access tier (`'anonymous'` or `'authenticated_18plus'`) |
| `isAnonymous()` | `boolean` | `true` if the user is not logged in |
| `promptLogin()` | `Promise<PromptLoginResult>` | Show the login dialog and return the result |
| `autoPromptLogin` | `boolean` | Get or set whether gated calls auto-prompt login for anonymous users |

{% hint style="info" %}
`getAccessTier()` and `isAnonymous()` are resolved entirely client-side from the cached profile; they do no network round-trip and reflect the last known auth state. The tier is `'anonymous'` when there is no cached profile or the profile is anonymous, otherwise `'authenticated_18plus'`. `isAnonymous()` is exactly `getAccessTier() === 'anonymous'`.
{% endhint %}

### Types

```typescript
type AccessTier = 'anonymous' | 'authenticated_18plus'

interface PromptLoginResult {
  success: boolean
  profile?: Profile
}

interface Profile {
  id: string
  username: string
  name?: string
  avatarUrl?: string | null
  isAnonymous?: boolean
}
```

---

## Best Practices

- **Leave auto-prompt enabled** unless you need full control over when the login dialog appears. It provides the smoothest experience for anonymous users who trigger a gated feature.
- **Catch `AccessDeniedError`** at the call site so you can show contextual feedback (e.g. "Log in to generate images") rather than a generic error.
- **Check `isAnonymous()` up front** if you want to hide or disable UI for features that require login, rather than waiting for the call to fail.
- **Don't gate-check manually** before calling gated methods, the SDK handles it for you. Calling `isAnonymous()` is useful for UI hints, but the gate itself is automatic.
