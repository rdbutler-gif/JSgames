#  Profile API

Sync access to the active player's identity so you can personalize UI on first paint, gate features, or tag analytics without extra calls.

## Quick Start

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const profile = RundotGameAPI.getProfile()
console.log(profile.id, profile.username)
```

`getProfile()` returns the cached snapshot from the host handshake. The SDK initializes automatically on import, but the handshake (`INIT_SDK`) is asynchronous: read the profile only after the SDK is ready, not synchronously at module top level.

{% hint style="warning" %}
`getProfile()` throws if the host handshake hasn't completed or the host supplied a bad profile. Guard early reads, or read the profile from a lifecycle/ready hook. Two errors can surface:

- `[RUN] Profile not available. You must await RundotGameAPI.initializeAsync() before calling getProfile(). INIT_SDK has not completed.`: the profile cache is still empty (you read it before the handshake resolved).
- `[RUN] INIT_SDK returned an incomplete profile (missing id/username). The host must supply valid profile data.`: the host returned a profile without an `id` or `username`.

```ts
try {
  const profile = RundotGameAPI.getProfile()
  hud.setName(profile.username)
} catch (err) {
  // INIT_SDK not done yet, or host sent an incomplete profile; retry after ready
}
```
{% endhint %}

## Fields

| Field        | Type                          | Notes                                             |
|--------------|-------------------------------|---------------------------------------------------|
| `id`         | `string`                      | Stable player identifier; safe as a primary key.  |
| `username`   | `string`                      | Display handle for leaderboards or invites.       |
| `name`       | `string \| undefined`         | Optional display name. Populated only during local Playground testing; the production host always omits it. See note below. |
| `avatarUrl`  | `string \| null \| undefined` | HTTPS avatar URL. `null` if the player has none, or `undefined` if the host omits it; null-check before use. |
| `isAnonymous`| `boolean \| undefined`        | `true` when the player is in guest/unsigned mode. Optional: may be `undefined` if the host omits it, so check `profile.isAnonymous === true` rather than assuming it's always present. |

{% hint style="info" %}
The Steam host can have a Firebase-authenticated session that still needs
account setup. Until the player completes the required setup, the host sends
`isAnonymous: true` to the game. This keeps game access gates active. Treat
this field as the host's game-access state. Do not use it to infer the Firebase
uid or the source of authentication.
{% endhint %}

{% hint style="info" %}
The SDK does not validate `username` length or format. It passes through whatever the host handshake supplies, and the host may apply its own rules. Don't assume a fixed length range.
{% endhint %}

{% hint style="info" %}
`name` is populated only during local Playground testing. The production host never includes it: `'name' in profile` is always `false` and `profile.name` is always `undefined` in production. Never rely on `name` for display; always use `username`.
{% endhint %}

{% hint style="info" %}
During local Playground testing, before you sign in `getProfile()` returns a placeholder `{ id: 'unknown-user', username: 'unknown-user', isAnonymous: true }`. Don't treat `'unknown-user'` as a real player id during local testing; it resolves to your real profile once sign-in and the backend profile fetch complete.
{% endhint %}

## Usage Ideas

- Bootstrap HUD/nameplates with `profile.username` before gameplay starts.
- Attach `profile.id` to analytics, matchmaking, or social payloads for attribution.
- Require login by checking `profile.isAnonymous` before premium flows or social invites.

## Deprecated

### `getCurrentProfile(): Profile`

{% hint style="warning" %}
Deprecated alias of `getProfile()`. It returns the same `Profile` and throws under the same conditions, but logs a `console.warn` deprecation notice (with a migration-guide URL) on **every** call, which spams the console in hot paths. Migrate to `getProfile()`.
{% endhint %}

```ts
// Old
const profile = RundotGameAPI.getCurrentProfile()

// New
const profile = RundotGameAPI.getProfile()
```
