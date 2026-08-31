# Attribution API

Read the web campaign and UTM parameters the player arrived with. Use them to tailor onboarding, credit a referral source, or report acquisition in your own analytics.

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

{% hint style="info" %}
Attribution params are a web-only signal. `getAttributionParams()` resolves to `null` on native (iOS/Android), and on web it resolves to `null` when no campaign params were captured at landing. Always handle the `null` case.
{% endhint %}

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const params = await RundotGameAPI.attribution.getAttributionParams()

if (params) {
  console.log('Arrived from', params.utm_source, params.utm_campaign)
} else {
  // null on native, or on web when no campaign params were captured
}
```

## `getAttributionParams(): Promise<CampaignParams | null>`

Resolves to the campaign params the player landed with, or `null`.

The host returns `null` immediately on native platforms (iOS/Android). On web it returns the params captured from the landing URL, or `null` when none were present. Within a returned `CampaignParams` object, any individual field is `null` when that parameter was absent from the URL.

| Returns | Description |
|---------|-------------|
| `Promise<CampaignParams \| null>` | The captured campaign params, or `null` on native and on web when nothing was captured. |

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

async function reportAcquisition() {
  const params = await RundotGameAPI.attribution.getAttributionParams()
  if (!params) return

  myAnalytics.track('acquisition', {
    source: params.utm_source,
    medium: params.utm_medium,
    campaign: params.utm_campaign,
    fbclid: params.fbclid,
    gclid: params.gclid,
  })
}
```

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `getAttributionParams()` | `Promise<CampaignParams \| null>` | Read the captured web campaign/UTM params. Resolves to `null` on native and on web when none were captured. |

## Types

### `CampaignParams`

The shape returned by `getAttributionParams()`. Every field is `string | null`; a field is `null` when that parameter was absent from the landing URL.

| Field | Type | Description |
|-------|------|-------------|
| `utm_source` | `string \| null` | Identifies the referrer (e.g. `google`, `newsletter`). |
| `utm_medium` | `string \| null` | Marketing medium (e.g. `cpc`, `email`, `social`). |
| `utm_campaign` | `string \| null` | Campaign name. |
| `utm_content` | `string \| null` | Distinguishes creatives or links within a campaign. |
| `utm_term` | `string \| null` | Paid-search keyword term. |
| `fbclid` | `string \| null` | Facebook click identifier. |
| `gclid` | `string \| null` | Google click identifier. |

```typescript
interface CampaignParams {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  gclid: string | null
}
```

## Best Practices

- Always branch on the `null` result; never assume params exist (they never do on native).
- Treat each field independently; a player can arrive with `utm_source` set but `utm_campaign` `null`.
- Read params once early and cache them; the value does not change during a session.
- Don't rely on attribution params for gameplay gating; they're an acquisition signal, not an authenticated identity.
