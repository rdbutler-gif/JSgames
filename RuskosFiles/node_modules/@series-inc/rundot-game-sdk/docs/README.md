# RUN.world SDK

The RUN.world SDK gives your HTML5 game access to monetization, multiplayer, storage, AI, and more, all through a single import.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'
```

Every API is accessed through `RundotGameAPI`. For example:

```typescript
// Save player progress
await RundotGameAPI.appStorage.setItem('level', '5')

// Show a rewarded ad
const result = await RundotGameAPI.ads.showRewardedAdAsync()

// Get server time
const time = await RundotGameAPI.requestTimeAsync()
```

## API Reference

### Monetization

| API | What it does |
| --- | --- |
| [Ad Monetization](rundot-developer-platform/api/ADS.md) | Serve rewarded video and interstitial ads to earn revenue. |
| [Purchases](rundot-developer-platform/api/PURCHASES.md) | Let players spend RunBucks on digital goods. |
| [Shop](rundot-developer-platform/api/SHOP.md) | List shop items and run the purchase flow for digital goods. |
| [Entitlements](rundot-developer-platform/api/ENTITLEMENTS.md) | Track and consume what players own (items, passes, power-ups). |

### Messaging

| API | What it does |
| --- | --- |
| [Notifications](rundot-developer-platform/api/NOTIFICATIONS.md) | Schedule local notifications for re-engagement. |
| [In-App Messaging](rundot-developer-platform/api/IN_APP_MESSAGING.md) | Display toast notifications and in-app messages. |

### Assets

| API | What it does |
| --- | --- |
| [Assets](rundot-developer-platform/api/ASSETS.md) | Load game assets from the CDN with caching, preloading, and WebView support. |
| [Shared Assets](rundot-developer-platform/api/SHARED_ASSETS.md) | Download host-provisioned asset bundles shared across titles. |

### Game Systems

| API | What it does |
| --- | --- |
| [Experiments (LiveOps)](rundot-developer-platform/api/LIVEOPS.md#experiments-ab-testing) | Run A/B tests with deterministic per-player variants. |
| [Big Numbers](rundot-developer-platform/api/BIGNUMBERS.md) | Handle exponential economies without losing precision. |
| [Multiplayer (BETA)](rundot-developer-platform/api/MULTIPLAYER.md) | Build synchronous multiplayer sessions with real-time updates. |
| [Simulation API (BETA)](rundot-developer-platform/api/SERVER_AUTHORITATIVE.md) | Drive authoritative game state through the simulation system. |
| [Simulation: Config Reference (BETA)](rundot-developer-platform/api/SIMULATION_CONFIG.md) | Define entities, recipes, loot tables, and lifecycle hooks in JSON config. |
| [Simulation: Energy System (BETA)](rundot-developer-platform/api/ENERGY_SYSTEM.md) | Implement regenerating energy/stamina with offline catch-up. |
| [Simulation: Gacha System (BETA)](rundot-developer-platform/api/GACHA_SYSTEM.md) | Add loot boxes with weighted pools, pity counters, and guarantees. |
| [Simulation: Building Timers (BETA)](rundot-developer-platform/api/BUILDING_TIMERS.md) | Timed upgrades, build queues, and passive resource generation. |
| [Sharing](rundot-developer-platform/api/SHARING.md) | Share links, generate QR codes, and handle share parameters. |
| [Leaderboards](rundot-developer-platform/api/LEADERBOARD.md) | Competitive leaderboards with multiple security levels. |
| [Video (BETA)](rundot-developer-platform/api/VIDEO.md) | Hand off video playback to native Picture-in-Picture (iOS only). |

### Device & Environment

| API | What it does |
| --- | --- |
| [Runtime Environment](rundot-developer-platform/runtime-environment.md) | Storage scopes, the network allowlist, and device features the platform provides. |
| [Safe Area](rundot-developer-platform/api/SAFE_AREA.md) | Read safe-area insets to avoid overlapping host UI and notches. |
| [Environment](rundot-developer-platform/api/ENVIRONMENT.md) | Detect device type, platform, screen size, and dev mode. |

### AI

| API | What it does |
| --- | --- |
| [AI](rundot-developer-platform/api/AI.md) | Generate text and images using hosted AI models. |

### Utility

| API | What it does |
| --- | --- |
| [Analytics](rundot-developer-platform/api/ANALYTICS.md) | Record gameplay telemetry, funnel steps, and user properties. |
| [Attribution](rundot-developer-platform/api/ATTRIBUTION.md) | Read the web campaign and UTM parameters the player arrived with. |
| [Context](rundot-developer-platform/api/CONTEXT.md) | Access launch parameters and share parameters. |
| [Embedded Libraries](rundot-developer-platform/api/EMBEDDED_LIBRARIES.md) | Load and manage embedded libraries shipped by the host. |
| [Haptics](rundot-developer-platform/api/HAPTICS.md) | Trigger haptic feedback on supported devices. |
| [Lifecycles](rundot-developer-platform/api/LIFECYCLES.md) | React to host lifecycle changes (pause/resume/teardown). |
| [Logging](rundot-developer-platform/api/LOGGING.md) | Stream structured logs for debugging and support. |
| [Preloader](rundot-developer-platform/api/PRELOADER.md) | Control the native loading screen during heavy loads. |
| [Profile](rundot-developer-platform/api/PROFILE.md) | Access the current user profile. |
| [Storage](rundot-developer-platform/api/STORAGE.md) | Persist player data at device, app, or global scope. |
| [Time](rundot-developer-platform/api/TIME.md) | Server time synchronization and formatting. |

---

New to RUN.world? See [Getting Started](rundot-developer-platform/getting-started.md) | [Testing Locally With Playground](rundot-developer-platform/playground.md) | [Deploying Your Game](rundot-developer-platform/deploying-your-game.md) | [rundot CLI Reference](rundot-developer-platform/cli-reference.md) | [Marketing Your Game (BETA)](rundot-developer-platform/marketing-your-game.md) | [Runtime Environment](rundot-developer-platform/runtime-environment.md) | [Setting Your Game Thumbnail](rundot-developer-platform/setting-your-game-thumbnail.md) | [Troubleshooting](rundot-developer-platform/troubleshooting.md)
