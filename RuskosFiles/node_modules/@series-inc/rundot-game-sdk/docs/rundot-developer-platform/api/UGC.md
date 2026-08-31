# UGC API (BETA)

User-Generated Content API for publishing, browsing, and engaging with community content.

---

## Overview

The UGC API enables games to let users create, share, and discover community content such as custom characters, levels, decks, or any structured data your game supports.

**Key Features:**
- 📤 **Publish** content with JSON metadata (up to 100KB)
- 🔍 **Browse** community content with sorting, pagination, and author filtering
- 📋 **List** your own published content
- 📦 **Batch Fetch** multiple entries by ID
- 🔗 **Cross-App** browse, read, create, update, and delete entries across sibling apps
- 👥 **Follow Creators** and track follower/following counts
- ❤️ **Like/Unlike** content (with optimistic updates)
- 📊 **Track Usage** when content is imported/used
- 🚩 **Report** inappropriate content
- 🗳️ **Weekly Voting** with subscription-tiered budgets, live leaderboards, and historical winners
- 🎯 **Recommendations** personalized content discovery, similar-item suggestions, and interaction tracking

---

## Quick Start

### Publishing Content

```typescript
// Create new content
const entry = await RundotGameAPI.ugc.create({
  contentType: 'character',  // App-defined type
  data: {
    name: 'My Character',
    stats: { strength: 10, agility: 8 },
    abilities: ['fireball', 'shield']
  },
  isPublic: true,  // Optional; visible in community browse. Defaults to true
  title: 'Fire Mage',  // Optional, for display
  tags: ['mage', 'fire']  // Optional, for filtering
})

console.log(`Published with ID: ${entry.id}`)
```

`create` params: `contentType` and `data` are required; `isPublic` (defaults to `true`), `title`, `tags`, `isPlatformVisible`, and `thumbnailUrl` are optional. When `isPlatformVisible` is `true`, `title` and `thumbnailUrl` are both required.

### Browsing Community Content

```typescript
// Browse public content
const catalog = await RundotGameAPI.ugc.browse({
  contentType: 'character',
  sortBy: 'mostUsed',  // 'recent' | 'mostLiked' | 'mostUsed'
  limit: 20
})

for (const entry of catalog.entries) {
  console.log(`${entry.title} by ${entry.authorName}`)
  console.log(`  Likes: ${entry.likeCount}, Uses: ${entry.useCount}`)
  console.log(`  Liked by me: ${entry.isLikedByMe}`)
}

// Browse a specific creator's content
const creatorContent = await RundotGameAPI.ugc.browse({
  contentType: 'character',
  authorId: 'creator-profile-id',
  sortBy: 'recent'
})

// Pagination
if (catalog.nextCursor) {
  const nextPage = await RundotGameAPI.ugc.browse({
    contentType: 'character',
    cursor: catalog.nextCursor
  })
}
```

### Managing Your Content

```typescript
// List your published content
const myContent = await RundotGameAPI.ugc.listMine({
  contentType: 'character'
})

for (const entry of myContent.entries) {
  console.log(entry.title)
}
if (myContent.nextCursor) {
  // pass cursor back into listMine to page
}

// Update content
await RundotGameAPI.ugc.update({
  id: entry.id,
  data: { ...updatedData },
  title: 'Updated Title'
})

// Update content is a partial patch: only `id` is required.
// Update just visibility, just tags, etc. without re-sending data.
await RundotGameAPI.ugc.update({ id: entry.id, isPublic: false })

// Delete content
await RundotGameAPI.ugc.delete(entry.id)
```

{% hint style="info" %}
`listMine` and `listShared` take a `UgcListParams` whose `contentType` is a **single string only**; they do not accept an array. To list multiple content types for one author, use `browse({ authorId, contentType: ['typeA', 'typeB'] })` instead.
{% endhint %}

`update` params: only `id` is required. `data`, `isPublic`, `title`, `tags`, `isPlatformVisible`, and `thumbnailUrl` are optional partial updates; omit a field to leave it unchanged. When setting `isPlatformVisible` to `true`, `title` and `thumbnailUrl` must either be supplied in the update or already present on the entry.

### Batch Fetching Entries

Retrieve multiple entries by ID in a single request (max 100):

```typescript
const result = await RundotGameAPI.ugc.getMany({
  entryIds: ['entry-id-1', 'entry-id-2', 'entry-id-3']
})

for (const entry of result.entries) {
  console.log(`${entry.title} - Liked by me: ${entry.isLikedByMe}`)
}
```

### Fetching a Single Entry

Use `get(id)` to read one entry by ID. It returns the entry, or `null` if no entry exists with that ID (a quarantined entry is also returned as `null` to non-members):

```typescript
const entry = await RundotGameAPI.ugc.get(entryId)
if (entry) {
  console.log(`${entry.title} by ${entry.authorName}`)
}
```

### Counting Entries

`count(params?)` returns how many entries match an optional `contentType` (single type or array) and indexed-field `filters`, without fetching the entries themselves. Pass no params to count every entry in your app:

```typescript
// Count all 'level' entries
const { count } = await RundotGameAPI.ugc.count({ contentType: 'level' })

// Count with an indexed-field filter
const { count: hardLevels } = await RundotGameAPI.ugc.count({
  contentType: 'level',
  filters: { idx_difficulty: { gte: 4 } },
})
```

`count` accepts the same `contentType` and `filters` surface as `browse` (see [Filtering by Indexed Fields](#filtering-by-indexed-fields)). The cross-app variant is `crossAppCount(targetAppId, params?)`.

---

## Collaborators (multi-editor)

By default a UGC entry has one owner, its `authorId`. The owner can invite **collaborators** (editors) who may then read and `update()` that entry as if it were their own. This is the foundation for co-editing a single piece of content.

Scope and rules:

- **Per-entry.** Collaborators are managed on one specific entry. Adding someone to entry A grants edit rights on entry A only, never on other entries by the same owner.
- **Owner-managed.** Only the owner (`authorId`) can add or remove collaborators, or delete the entry. A collaborator can remove **themselves** (leave).
- **Editors can edit, not administer.** A collaborator can `update()` and read the entry (including while it is private), but cannot delete it or manage its collaborator list.
- **`editorIds` is member-scoped.** It carries real values only when the caller is the owner or an editor (`get`, `listMine`, `listShared`, `listCollaborators`). Discovery surfaces (`browse`, `getMany`) always return `editorIds: []`, so collaborator IDs of public content are never exposed.

```typescript
// Owner: invite a collaborator by their profile ID
await RundotGameAPI.ugc.addCollaborator({ entryId: entry.id, profileId: friendProfileId })

// Owner: remove a collaborator (or a collaborator removing themselves)
await RundotGameAPI.ugc.removeCollaborator({ entryId: entry.id, profileId: friendProfileId })

// Any member: read the owner + editor list
const { authorId, editorIds } = await RundotGameAPI.ugc.listCollaborators(entry.id)

// A collaborator: list entries shared with me (where I'm an editor, not the author)
const shared = await RundotGameAPI.ugc.listShared({ contentType: 'character' })
for (const entry of shared.entries) {
  // editorIds is populated here because I'm a member
  await RundotGameAPI.ugc.update({ id: entry.id, data: { ...edits } })
}
```

`addCollaborator` is idempotent (re-adding an existing editor is a safe no-op), and the owner is never added to their own `editorIds`.

---

## Engagement Features

### Likes

```typescript
// Like content
const likeResult = await RundotGameAPI.ugc.like(entryId)
console.log(`New like count: ${likeResult.likeCount}`)

// Unlike content
const unlikeResult = await RundotGameAPI.ugc.unlike(entryId)
console.log(`New like count: ${unlikeResult.likeCount}`)
```

**Optimistic UI Pattern:**
```typescript
// Show immediate feedback, then sync with server
setIsLiked(true)
setLikeCount(prev => prev + 1)

try {
  const result = await RundotGameAPI.ugc.like(entryId)
  setLikeCount(result.likeCount)  // Sync with server
} catch (error) {
  // Rollback on failure
  setIsLiked(false)
  setLikeCount(prev => prev - 1)
}
```

### Usage Tracking

Track when users import or use community content:

```typescript
// Record usage (rate limited to once per user per entry per day)
const result = await RundotGameAPI.ugc.recordUse(entryId)
console.log(`Total uses: ${result.useCount}`)
```

### Reporting

Let players flag content for moderation. Reports are community-driven and can lead to **automatic quarantine** once enough distinct users report the same entry.

```typescript
// Report inappropriate content
await RundotGameAPI.ugc.report({
  id: entryId,
  reason: 'inappropriate',  // 'inappropriate' | 'spam' | 'harassment' | 'other'
  details: 'Contains offensive language',  // Optional free-text
  supportEmail: 'player@example.com',       // Optional reporter contact for follow-up
  metadata: { source: 'level-viewer' },     // Optional string key/value context
})
```

`report` params: `id` and `reason` are required; `details` (free-text), `supportEmail` (reporter contact), and `metadata` (a `Record<string, string>` of arbitrary context) are all optional.

**Behavior:**

- **One report per user per entry.** Reports are idempotent on `(reporter, entry)`; a user reporting the same entry twice is a silent no-op (it does not increment the count or re-notify).
- **Auto-quarantine on threshold.** Each new report increments the entry's `reportCount`. When the count reaches a server-configured threshold (`autoQuarantineReportThreshold`), the server flips the entry to `status: 'quarantined'` and stamps a `quarantine` object with `source: 'user_reports'`. This happens automatically: no admin action required.
- **Effect of quarantine.** A quarantined entry is hidden from community `browse`, `getMany`, and public `get` for everyone **except** the author and collaborators (members), who can still see it (with the `quarantine` details attached) so they understand why it disappeared.
- **Recovery.** Only an admin can lift a quarantine (`rundot ugc approve <entry-id>`) or soft-remove the entry (`rundot ugc admin remove`, which sets the terminal `status: 'removed'`). See [CLI Management](#cli-management-rundot-ugc).

> Quarantine also happens **at create/update time** from automated content moderation (text/image/video scanning), independently of reports; those entries carry `quarantine.source: 'auto_moderation'`. See [Configuration](#configuration).

---

## Checking Text (Moderation)

Check text against the same procedural profanity filter the server runs — entirely client-side, deterministic, no network call. Use it to give players instant feedback (e.g. per-keystroke on a name field) **before** submitting, instead of waiting for a server rejection.

```typescript
// Default: 'strict' — what the server applies to UGC, comments,
// profiles, and game tags
const result = await RundotGameAPI.ugc.checkTextAsync(playerText)

if (!result.clean) {
  console.log(`Flagged words: ${result.profaneWords.join(', ')}`)
  // e.g. show "please pick a different name" UI
}

// 'lenient' — what the server applies to AI generation prompts
const promptCheck = await RundotGameAPI.ugc.checkTextAsync(playerPrompt, {
  policy: 'lenient'
})

// Flag additional app-specific words on top of the built-in dictionaries
const custom = await RundotGameAPI.ugc.checkTextAsync(playerText, {
  customWords: ['spoilerword']
})
```

`checkTextAsync` params: `text` is required; `options` is optional with `policy` (`'strict'` | `'lenient'`, defaults to `'strict'`) and `customWords` (extra words to flag). Returns `{ clean: boolean, profaneWords: string[] }` — `profaneWords` lists the matched words and is empty when clean.

**Which policy to use** — match the server-side gate your text is headed for:

| Destination of the text | Server-side policy | Use |
|---|---|---|
| UGC entries, comments, profiles, game tags | strict | `'strict'` (the default) |
| AI generation prompts (image/sprite/audio/video/3D gen — the "That looks a bit offensive. Let's try again." rejection path) | lenient | `'lenient'` |

{% hint style="warning" %}
If you're pre-flighting text destined for the **AI generation endpoints**, pass `policy: 'lenient'`. The strict default matches across 23 languages with obfuscation/fuzzy matching and will false-flag words (e.g. `"trio"`, `"burro"` — both harmless in English but profane in glin-profanity's Spanish list) that the server's generation path would never reject.
{% endhint %}

**Behavior:**

- **UX pre-filter, not a guarantee.** The server still enforces its own moderation on submit — including LLM-based checks the client doesn't run — so a client-side `clean: true` does not guarantee the server will accept the text. Conversely, a client-side flag under the right policy will also be flagged server-side.
- **Strict mode is aggressive by design.** It matches across 23 languages and internally ignores word boundaries (obfuscation matching), which produces known false positives on innocent English words (see the `'lenient'` callout above). That mirrors the server exactly: content the strict check false-flags client-side would be rejected server-side too.
- **Server parity.** This is the same procedural filter, policies, and pinned library version (`glin-profanity` 2.3.8) the server runs; parity is enforced by unit tests that compare the SDK's policies and version against the server's.
- **Fail-open.** If the filter itself fails to load or errors internally, the call resolves `{ clean: true, profaneWords: [] }` — it never rejects. This matches the server's behavior for its local profanity check.
- **Lazy-loaded.** The word lists are loaded on the first `checkTextAsync` call, not at SDK boot, so games that never moderate text don't pay for them.

---

## Creator Following

Follow and unfollow content creators, check follow status, and retrieve follower/following counts.

### Follow / Unfollow

```typescript
// Follow a creator
await RundotGameAPI.ugc.follow(creatorProfileId)

// Unfollow a creator
await RundotGameAPI.ugc.unfollow(creatorProfileId)
```

### Check Follow Status

```typescript
const { isFollowing } = await RundotGameAPI.ugc.isFollowing(creatorProfileId)
console.log(`Following: ${isFollowing}`)
```

### Get Follow Counts

```typescript
const counts = await RundotGameAPI.ugc.getFollowCounts(creatorProfileId)
console.log(`Followers: ${counts.followerCount}`)
console.log(`Following: ${counts.followingCount}`)
```

### Building a Creator Profile

Combine following with browse to build a creator profile page:

```typescript
// Get creator's follow stats and content in parallel
const [counts, { isFollowing }, content] = await Promise.all([
  RundotGameAPI.ugc.getFollowCounts(creatorProfileId),
  RundotGameAPI.ugc.isFollowing(creatorProfileId),
  RundotGameAPI.ugc.browse({ authorId: creatorProfileId, sortBy: 'recent' })
])
```

---

## Weekly Voting

Let players vote on community UGC entries each ISO week. The server enforces per-user weekly budgets (3 votes by default, 15 for Ultimate subscribers), exposes a live leaderboard, and archives the top 3 winners each week.

All voting methods live under `RundotGameAPI.ugc.voting`. Calls are authenticated and per-app; the current week is determined server-side from UTC.

### Casting and Removing Votes

```typescript
// Cast a vote on an entry
const result = await RundotGameAPI.ugc.voting.vote({
  entryId: 'entry-id',
  count: 1, // optional, defaults to 1
})

console.log(`You have ${result.totals.remaining} votes left this week`)
console.log(`Total votes on this entry: ${result.entryTotalCount}`)

// Remove a previously cast vote
await RundotGameAPI.ugc.voting.unvote({ entryId: 'entry-id', count: 1 })
```

`count` defaults to `1` and must be a positive integer no greater than `15` (the Ultimate weekly budget; no single call can exceed it). Requests with `count <= 0` or `count > 15` are rejected by the server.

**Idempotency.** Both `vote` and `unvote` accept a stable `clientRequestId` for safe retry after a network failure; the server returns the cached result instead of double-counting (or, on unvote, instead of 409-ing because the votes are already gone):

```typescript
const requestId = crypto.randomUUID()
await RundotGameAPI.ugc.voting.vote({ entryId, count: 1, clientRequestId: requestId })
// Later, retrying the same logical request:
await RundotGameAPI.ugc.voting.unvote({ entryId, count: 1, clientRequestId: crypto.randomUUID() })
```

If a request would exceed the user's remaining budget the server returns `INSUFFICIENT_VOTES`; trying to unvote an entry the user has not voted on returns `NO_VOTES_TO_REMOVE`. Surface these to the player as "out of votes" / "nothing to undo" rather than as generic errors.

### Reading Your State

```typescript
const state = await RundotGameAPI.ugc.voting.getMyVotes()
console.log(`Week: ${state.weekKey}`) // e.g. "2026-W19"
console.log(`Budget: ${state.totals.budget}, used: ${state.totals.used}`)

for (const { entryId, count } of state.byEntry) {
  console.log(`  ${entryId}: ${count} votes`)
}
```

Use this to render per-entry vote counts in your UI and to gate the vote button when `remaining === 0`.

### Leaderboard (Current Week)

```typescript
const page = await RundotGameAPI.ugc.voting.getLeaderboard({ limit: 5 })

for (const item of page.items) {
  console.log(`${item.entryId}: ${item.count} votes`)
}

if (page.nextCursor) {
  const next = await RundotGameAPI.ugc.voting.getLeaderboard({ cursor: page.nextCursor })
}
```

The leaderboard is sorted by vote count descending, then by `firstVotedAt` ascending (earliest entry to receive a vote wins ties). Page size defaults to 5 and is capped at 25.

### Historical Winners

Each Monday at 00:00 UTC the server snapshots the previous week's top 25 entries per app, including a denormalized author/title snapshot so winners survive UGC deletion. The endpoint trims each week's `winners` array to `topN` at read time, so apps can pick the shape that fits their UI without re-snapshotting.

```typescript
// Default: top 3 per week, 4 weeks per page
const winners = await RundotGameAPI.ugc.voting.getWinners()

// "Winner of the week" only
const headlines = await RundotGameAPI.ugc.voting.getWinners({ topN: 1 })

// Leaderboard-style historical view: top 10 per week, one week at a time
const deepDive = await RundotGameAPI.ugc.voting.getWinners({ topN: 10, limit: 1 })

for (const week of winners.items) {
  console.log(`Week ${week.weekKey}:`)
  for (const w of week.winners) {
    console.log(`  #${w.rank} ${w.snapshot.title ?? w.entryId} by ${w.snapshot.authorName} - ${w.count} votes`)
  }
}
```

`limit` (weeks per page) defaults to 4 and is capped at 25. `topN` (ranked entries per week) defaults to 3 and is capped at 25. Weeks are returned newest-first; `rank` is 1-based within the week.

### Subscription-Tiered Budgets

| Tier | Weekly vote budget |
|------|-------------------:|
| Free / default | 3 |
| Ultimate subscribers | 15 |

The tier is resolved at vote-time, not snapshotted. A player who upgrades mid-week immediately gets the higher budget without losing their already-cast votes; a player who downgrades keeps the votes they cast but cannot add new ones until `used < 3`.

### Voting Cadence

Voting runs weekly by default. An app can be switched to a monthly cadence via server-side configuration (contact the RUN team); there is no client-side setting and no code change on your side.

For a monthly app, everything above works the same, with two visible differences:

- `weekKey` carries a month key like `"2026-07"` instead of an ISO week key like `"2026-W29"`. Treat it as an opaque period identifier either way.
- Budgets reset per month instead of per week. The defaults stay 3 (free) and 15 (Ultimate) unless the server-side config overrides them.

Winners are snapshotted per period: monthly apps get one winners entry per month, archived shortly after the month ends (UTC).

---

## Recommendations

Surface personalized content to players using the built-in recommendation engine. The system learns from player interactions (views, ratings, usage) to improve suggestions over time.

### Personalized Recommendations

Get content recommendations tailored to the current user based on their interaction history:

```typescript
const result = await RundotGameAPI.ugc.getUserRecommendation(10)

console.log(`Recommendation ID: ${result.recommId}`)
for (const entry of result.entries) {
  console.log(`${entry.title} by ${entry.authorName} (${entry.contentType})`)
}
```

The optional `filter` parameter lets you narrow results using a filter expression:

```typescript
const filtered = await RundotGameAPI.ugc.getUserRecommendation(10, "'content_type' == \"level\"")
```

### Similar Item Recommendations

Find content similar to a specific entry:

```typescript
const similar = await RundotGameAPI.ugc.getItemRecommendation('entry-id', 10)

for (const entry of similar.entries) {
  console.log(`${entry.title} - similar to the source entry`)
}
```

This also accepts an optional `filter` parameter as the third argument.

### Composite Recommendations

Composite recommendations first select a source entry, then recommend items related to that source. This is useful for "Because you liked X, try these" experiences:

```typescript
const result = await RundotGameAPI.ugc.getCompositeRecommendation(10)

if (result.sourceEntry) {
  console.log(`Because you liked: ${result.sourceEntry.title}`)
}
for (const entry of result.entries) {
  console.log(`  Try: ${entry.title}`)
}
```

You can pass optional `sourceFilter` and `resultFilter` parameters to constrain the source selection and recommended results independently:

```typescript
const result = await RundotGameAPI.ugc.getCompositeRecommendation(
  10,
  "'content_type' == \"level\"",   // sourceFilter
  "'content_type' == \"level\"",   // resultFilter
)
```

### Paginating Recommendations (More Results)

Every recommendation response includes a `recommId`. Pass it to `getMoreRecommendations` to fetch the next page of results -- the engine returns previously unseen items each time:

```typescript
// First page
const first = await RundotGameAPI.ugc.getUserRecommendation(10)
displayEntries(first.entries)

// User scrolls down / clicks "Load More"
const second = await RundotGameAPI.ugc.getMoreRecommendations(first.recommId, 10)
displayEntries(second.entries)

// Keep paginating with the latest recommId
const third = await RundotGameAPI.ugc.getMoreRecommendations(second.recommId, 10)
displayEntries(third.entries)
```

`getMoreRecommendations` works with the `recommId` from any recommendation method (`getUserRecommendation`, `getItemRecommendation`, or `getCompositeRecommendation`). All parameters from the original request (filters, scenario) are inherited automatically.

{% hint style="info" %}
Each `recommId` is valid for up to 30 minutes after the last request that used it. After that, start a fresh recommendation request.
{% endhint %}

### Recording Interactions

Feed user behavior back into the recommendation engine so it learns what each player likes. Every interaction method accepts an optional `recommId` -- pass it when the interaction originated from a recommendation to improve the engine's accuracy.

#### Detail View

Record when a user views an entry's details:

```typescript
await RundotGameAPI.ugc.addDetailView('entry-id', result.recommId)
```

#### View Portion

Record how much of a content item a user has consumed, as a number from 0 (nothing) to 1 (the entire item). This is useful for content with progress like stories, tutorials, or videos:

```typescript
// User has viewed half the content
await RundotGameAPI.ugc.setViewPortion('entry-id', 0.5, result.recommId)

// User finished the content
await RundotGameAPI.ugc.setViewPortion('entry-id', 1.0, result.recommId)
```

The portion should reflect the actual amount consumed, regardless of seeking. For example, if a user skips to the middle and reads 10% from there, the portion should be `0.1`, not `0.5`.

Calling `setViewPortion` again for the same user and item updates the stored portion rather than creating a duplicate.

#### Rating

Record a rating between -1 (dislike) and 1 (like):

```typescript
// Thumbs up
await RundotGameAPI.ugc.addRating('entry-id', 1.0, result.recommId)

// Thumbs down
await RundotGameAPI.ugc.addRating('entry-id', -1.0, result.recommId)

// Neutral / partial
await RundotGameAPI.ugc.addRating('entry-id', 0.5)
```

#### Cart Addition

A stronger signal than a detail view, indicating the user took a meaningful action on the content. This doesn't have to be a purchase -- common examples include importing, saving, favoriting, or adding content to a collection:

```typescript
await RundotGameAPI.ugc.addCartAddition('entry-id', result.recommId)
```

### Recommendation Flow Example

A typical integration combines recommendations with interaction tracking:

```typescript
// 1. Fetch personalized recommendations
const recs = await RundotGameAPI.ugc.getUserRecommendation(20)

// 2. Display entries to the player
for (const entry of recs.entries) {
  showCard(entry)
}

// 3. When the player taps an entry, record the detail view
async function onEntryTapped(entry) {
  await RundotGameAPI.ugc.addDetailView(entry.id, recs.recommId)
  showEntryDetail(entry)
}

// 4. When the player imports content, record the interaction
async function onEntryImported(entry) {
  await RundotGameAPI.ugc.addCartAddition(entry.id, recs.recommId)
}

// 5. When the player scrolls to the bottom, load more
async function onScrollEnd() {
  const more = await RundotGameAPI.ugc.getMoreRecommendations(recs.recommId, 20)
  for (const entry of more.entries) {
    showCard(entry)
  }
}
```

---

## Cross-App UGC

Access UGC entries across apps owned by the same creator. This enables patterns like a level-editor app that creates content and a runner app that reads it, both published by the same creator.

**Same-creator requirement:** Both the calling app and the target app must share the same `ownerUserId`. The server verifies this on every cross-app call.

### Browsing Another App's Content

```typescript
const levels = await RundotGameAPI.ugc.crossAppBrowse({
  targetAppId: 'level-editor-app-id',
  contentType: 'level',
  sortBy: 'recent',
  limit: 20,
})

for (const entry of levels.entries) {
  console.log(`${entry.title} from app ${entry.sourceAppId}`)
}
```

### Reading Entries

`crossAppGet` and `crossAppGetMany` take the target app ID as the first positional argument; `crossAppCount` takes it first with an optional params object second.

```typescript
// Single entry (returns the entry or null if not found)
const entry = await RundotGameAPI.ugc.crossAppGet('level-editor-app-id', 'entry-uuid')

// Multiple entries (max 100)
const result = await RundotGameAPI.ugc.crossAppGetMany('level-editor-app-id', {
  entryIds: ['entry-1', 'entry-2'],
})

// Count by content type
const { count } = await RundotGameAPI.ugc.crossAppCount('level-editor-app-id', {
  contentType: 'level',
})
```

### Creating in Another App

A game can create UGC entries in a sibling app's collection. The entry is attributed to the current user and stored under the target app's UGC namespace.

```typescript
const entry = await RundotGameAPI.ugc.crossAppCreate({
  targetAppId: 'level-editor-app-id',
  contentType: 'level',
  data: { tiles: [[1, 0], [0, 1]], spawn: { x: 0, y: 0 } },
  isPublic: true,
  title: 'Tricky Maze',
  tags: ['maze', 'hard'],
})
```

Pass a `uniqueKey` to make creation idempotent. The key is unique per `contentType` within the target app — **across all users**. If the caller's own entry (created from this app) already holds the key, the server returns it instead of creating a duplicate; if another user's entry holds it, the call fails with a `409` conflict (the other entry is never returned). Derive keys from identifiers that can't collide between users — a UUID generated when the content is created, or a key that embeds the user's profile ID:

```typescript
const entry = await RundotGameAPI.ugc.crossAppCreate({
  targetAppId: 'level-editor-app-id',
  contentType: 'level',
  data: levelData,
  uniqueKey: `level-${levelUuid}`,  // per-user-unique; NOT a plain local counter
})
```

### Updating and Deleting Cross-App Entries

Entries created via `crossAppCreate` can be updated and deleted from the app that created them. Re-publishing should always update the existing entry rather than calling `crossAppCreate` again — repeated creates produce duplicate entries in the target app.

```typescript
// Update an entry previously created in the target app
const updated = await RundotGameAPI.ugc.crossAppUpdate({
  targetAppId: 'level-editor-app-id',
  id: entry.id,
  data: { tiles: newTiles },
  title: 'Tricky Maze (v2)',
})

// Remove it from the target app
await RundotGameAPI.ugc.crossAppDelete('level-editor-app-id', entry.id)
```

Three conditions are enforced server-side:

- The same-creator requirement applies, as with all cross-app calls.
- The entry must have been created cross-app **from the calling app** (its `sourceAppId` must match). Entries the target app created natively cannot be touched.
- The caller must be the entry's author (or a listed editor, for updates). Deletes are author-only.

A `UGC_CROSS_APP_DENIED` error is returned when the `sourceAppId` doesn't match; `UGC_NOT_FOUND` when the entry doesn't exist in the target app.

#### Backfilling a uniqueKey onto older entries

Entries published before keyed publishing have no `uniqueKey`, so a keyed `crossAppCreate` won't find them and would create a duplicate. Migrate them once by passing `uniqueKey` to `crossAppUpdate`:

```typescript
// One-time migration: look up the old entry (by stored ID, or via
// crossAppBrowse filtered by authorId), then attach its key.
await RundotGameAPI.ugc.crossAppUpdate({
  targetAppId: 'level-editor-app-id',
  id: oldEntry.id,
  uniqueKey: `level-${localLevelId}`,
})
```

From then on the entry behaves as if it was created with that key — re-publishes dedupe against it. If another entry already holds the key, the call fails with a `409` conflict whose body names the entry that owns it.

### Recommended Publish Flow

Two things to know before wiring a publish button:

1. **A `uniqueKey` dedup hit returns the existing entry *unchanged*.** It does not apply the data you sent, and the response doesn't indicate whether the entry was created or matched. Never treat `crossAppCreate` alone as "publish latest content."
2. **Plain `update()`/`delete()` cannot reach cross-app entries** — they look in your own app's namespace and return "not found". An "update first, create on 404" flow built on the plain calls silently duplicates on every re-publish. Use `crossAppUpdate`/`crossAppDelete`.

The robust recipe is get-or-create, then update — correct on first publish, re-publish, and after lost local state:

```typescript
async function publishEntry(contentType: string, key: string, content: { data: Record<string, unknown>; title: string }) {
  // 1. Get-or-create — never duplicates
  const entry = await RundotGameAPI.ugc.crossAppCreate({
    targetAppId: TARGET_APP_ID,
    contentType,
    uniqueKey: key,
    data: content.data,
    title: content.title,
    isPublic: true,
  })

  // 2. Ensure latest content (covers the dedup-hit case where step 1 returned the old version)
  return RundotGameAPI.ugc.crossAppUpdate({
    targetAppId: TARGET_APP_ID,
    id: entry.id,
    data: content.data,
    title: content.title,
  })
}
```

As an optimization, cache `key → entry.id` locally and call `crossAppUpdate` directly when you have the ID, falling back to the recipe above when you don't.

For multi-entry publishes (e.g. a story parent plus one entry per chapter), derive keys from a per-user-unique root — `story-{storyUuid}` and `story-{storyUuid}-chapter-{n}` — never from titles or plain local counters that another user could also produce. Two gotchas:

- Re-publishing with fewer children does **not** remove the extras; `crossAppDelete` removed chapters explicitly.
- To unpublish, delete every child, then the parent. Deletes are author-only.

### Cleaning Up Existing Duplicates

If earlier re-publishes already created duplicates, clean them up in-app (deletes run as the signed-in author, so this happens per user — on launch or next publish):

1. `crossAppBrowse` your own entries (`authorId` filter) and group them by your internal identity (an ID you stored in `data`).
2. Pick a keeper per group — the oldest, or the one with the most engagement (`likeCount`/`useCount` don't transfer between copies).
3. Backfill the key onto the keeper via `crossAppUpdate`, then `crossAppDelete` the rest.

A `409` "uniqueKey is already in use" during backfill means a keeper already holds that key — the entry you're holding is the duplicate; delete it.

Note: cross-app browse only returns **public, active** entries. Private or quarantined entries can't be rediscovered this way — store entry IDs at publish time.

### Cross-App Mutation Errors

| Failure | Error message contains | What to do |
|---|---|---|
| Entry doesn't exist in the target app | `not found` | Create it (with a `uniqueKey`) |
| Another entry holds the key (409) | `uniqueKey is already in use` | If it's your entry, update it or delete your duplicate; a key held by another user can't be claimed — use a different key |
| Entry wasn't cross-app created by your app | `was not created from this app` | You can't touch it — don't retry |
| Caller isn't the author | `Only the author` | Surface to the user — don't retry |

`crossAppUpdate` and `crossAppDelete` require host support; on app versions that predate them the calls fail. Treat failures as "feature unavailable" and skip cleanup/backfill rather than retrying into a create loop.

### Editor / Runner Pattern

A common architecture splits creation and consumption into two apps:

```typescript
// In the editor app: create a level
const level = await RundotGameAPI.ugc.create({
  contentType: 'level',
  data: levelData,
  isPublic: true,
  title: 'My Level',
})

// In the runner app: browse levels from the editor
const levels = await RundotGameAPI.ugc.crossAppBrowse({
  targetAppId: 'editor-app-id',
  contentType: 'level',
  sortBy: 'mostLiked',
})
```

Both apps must be published by the same creator. The runner app reads content from the editor app without duplicating it.

### Platform UGC (Globally Readable)

The special `targetAppId` value `"platform"` gives any game read access to platform-level UGC such as Worlds — no same-creator requirement applies. This is read-only; games cannot create entries in the platform namespace.

```typescript
// Browse platform Worlds
const worlds = await RundotAPI.ugc.crossAppBrowse({
  targetAppId: 'platform',
  contentType: 'world',
  sortBy: 'newest',
  limit: 20,
})

// Get a single platform entry by ID
const world = await RundotAPI.ugc.crossAppGet({
  targetAppId: 'platform',
  entryId: 'world-entry-id',
})

// Count platform entries
const { count } = await RundotAPI.ugc.crossAppCount({
  targetAppId: 'platform',
  contentType: 'world',
})
```

### Cross-App Error Codes

| Code | Raised when |
|------|-------------|
| `UGC_CROSS_APP_DENIED` | The calling app and target app don't share an `ownerUserId`, or (for `crossAppUpdate`/`crossAppDelete`) the entry wasn't created from the calling app. |
| `UGC_CROSS_APP_TARGET_INVALID` | The target app doesn't exist or has no `ownerUserId` set. |

---

## Platform Visibility

Mark a UGC entry as **platform visible** to promote it beyond your game's in-app browse into platform-wide discovery surfaces (search results and personalized recommendations shown to all RUN.world users).

### Requirements

- A `thumbnailUrl` is **required** — entries without a thumbnail cannot be marked platform visible. Use the [Files API](FILES.md) to upload an image and obtain a hosted URL (see example below).
- A `title` is **required** — entries without a title cannot be marked platform visible.

### Setting Platform Visibility

```typescript
// At creation time
const entry = await RundotGameAPI.ugc.create({
  contentType: 'level',
  data: { ... },
  isPlatformVisible: true,
  thumbnailUrl: 'https://res.cloudinary.com/...',
})

// Or update an existing entry
await RundotGameAPI.ugc.update({
  id: entry.id,
  isPlatformVisible: true,
  thumbnailUrl: 'https://res.cloudinary.com/...',
})
```

### Hosting a Thumbnail via the Files API

The easiest way to get a hosted thumbnail URL is through the [Files API](FILES.md) + Cloudinary export:

```typescript
// 1. Upload the image
const upload = await RundotGameAPI.files.upload({
  key: `ugc-thumbs/${entryId}.png`,
  contentType: 'image/png',
  sizeBytes: imageBlob.size,
  visibility: 'public',
})

await fetch(upload.uploadUrl, {
  method: 'PUT',
  headers: upload.uploadHeaders,
  body: imageBlob,
})

await RundotGameAPI.files.confirmUpload(`ugc-thumbs/${entryId}.png`)

// 2. Export to Cloudinary for optimized delivery
const { secureUrl } = await RundotGameAPI.files.exportToCloudinary({
  key: `ugc-thumbs/${entryId}.png`,
})

// 3. Set it as the UGC thumbnail
await RundotGameAPI.ugc.update({
  id: entryId,
  thumbnailUrl: secureUrl,
  isPlatformVisible: true,
})
```

### What Happens When a User Discovers Your Content

Platform-visible UGC entries appear in platform-wide searches and recommendation carousels alongside games and series. When a user taps one of these entries, the platform launches your game and passes the UGC entry ID as a launch parameter:

```typescript
// In your game's initialization code
const launchParams = RundotGameAPI.context.getLaunchParams()

if (launchParams.ugcId) {
  // Load and display the specific UGC entry
  const entry = await RundotGameAPI.ugc.get(launchParams.ugcId)
  showEntry(entry)
}
```

This enables a seamless flow: users discover your community content from anywhere on the platform and land directly in the relevant experience within your game.

---

## Data Model

### UGC Entry

```typescript
interface UgcEntry {
  id: string              // Auto-generated UUID
  appId: string           // Your game's app ID
  authorId: string        // Creator's profile ID (the owner)
  authorName: string      // Creator's username
  authorAvatarUrl: string | null
  editorIds: string[]     // Collaborators who can edit this entry (member-scoped, see Collaborators)
  contentType: string     // App-defined type
  data: Record<string, unknown>  // Your content (max 100KB)
  createdAt: number       // Milliseconds timestamp
  updatedAt: number
  isPublic: boolean       // Visible in community browse
  isPlatformVisible?: boolean  // Visible in platform-wide search/recommendations (requires thumbnailUrl and title)
  thumbnailUrl?: string   // Image URL for platform display (use Files API + exportToCloudinary)
  title?: string          // Display title
  tags?: string[]         // Tags for filtering
  useCount?: number       // Times imported/used
  likeCount?: number      // Number of likes
  sourceAppId?: string    // Present on cross-app entries; the app that created the entry
  audience?: 'general' | 'mature'  // Restricted content marker (see below)

  // Moderation lifecycle (see Reporting)
  status?: 'active' | 'removed' | 'quarantined'  // Absent on legacy entries (treat as 'active')
  reportCount?: number    // Number of distinct user reports
  quarantine?: {          // Present iff status === 'quarantined'
    source: 'auto_moderation' | 'user_reports'  // Scanned at create/update, vs. community reports
    reason: string        // Human-readable reason
    category?: string     // e.g. 'text' | 'video' (auto_moderation only)
    at: number            // Milliseconds timestamp
  }
}
```

**Reading `audience`.** The key is omitted when unset and never backfilled, so branch on `entry.audience === 'mature'` rather than comparing against `'general'`. Setting `'mature'` is restricted (see [Cross-App Parameters](#cross-app-parameters)).

**Reading quarantine in your game.** Discovery surfaces already filter out quarantined content, so you rarely see it in `browse`/`getMany`. But an author or collaborator fetching their own entry **will** receive `status: 'quarantined'` plus the `quarantine` object; use these to show a "this content is under review" state instead of rendering it as normal.

### Browse Parameters

```typescript
interface UgcBrowseParams {
  contentType?: string | string[] // Filter by content type. Pass an array
                                  // to match any of several types in one
                                  // query (e.g. ['series', 'comic']).
                                  // Up to 30 elements.
  authorId?: string              // Filter by creator's profile ID
  cursor?: string                // Pagination cursor
  limit?: number                 // Page size
  sortBy?: 'recent' | 'mostLiked' | 'mostUsed' | `idx_${string}`
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, UgcFilterValue>  // Indexed field filters
}

// Each filter value is either an equality match (string | number)
// or a numeric range. See "Filtering by Indexed Fields" below.
type UgcFilterValue = string | number | UgcRangeFilter

interface UgcRangeFilter {
  gte?: number
  lte?: number
}
```

The `sortBy` union is also exported as named types: `UgcSortBy = UgcBuiltinSortBy | UgcCustomSortBy`, where `UgcBuiltinSortBy = 'recent' | 'mostLiked' | 'mostUsed'` and `UgcCustomSortBy = \`idx_${string}\``.

### Browse Response

```typescript
interface UgcBrowseResponse {
  entries: Array<UgcEntry & {
    isLikedByMe?: boolean  // Whether current user liked this
  }>
  nextCursor?: string  // For pagination
}
```

### List Parameters & Response

`listMine` and `listShared` take `UgcListParams` and return `UgcListResponse`. Unlike `browse`, `contentType` here is a single string (no arrays), and the returned entries are plain `UgcEntry` without the `isLikedByMe` augmentation.

```typescript
interface UgcListParams {
  contentType?: string  // Single type only (not an array; use browse for multi-type)
  cursor?: string
  limit?: number
}

interface UgcListResponse {
  entries: UgcEntry[]   // Plain entries (no isLikedByMe)
  nextCursor?: string   // For pagination
}
```

### Get-Many & Count Parameters

```typescript
interface UgcGetManyParams {
  entryIds: string[]   // Up to 100 IDs per request
}

// getMany returns every requested entry it finds, augmented with isLikedByMe.
// Note: it is NOT paginated; there is no nextCursor.
interface UgcGetManyResponse {
  entries: Array<UgcEntry & { isLikedByMe?: boolean }>
}

// Used by both count() and crossAppCount(). Same contentType + filters
// surface as browse: contentType is a single type or an array, and filters
// uses the same idx_-prefixed equality/range matches.
interface UgcCountParams {
  contentType?: string | string[]
  filters?: Record<string, UgcFilterValue>
}
```

### Filtering by Indexed Fields

Use the `filters` parameter to query on fields with the `idx_` prefix. These fields are promoted to top-level indexed fields at create/update time from your `data` payload, based on your game's `indexedFields` configuration.

#### Equality

```typescript
const heroes = await RundotGameAPI.ugc.browse({
  contentType: 'hero',
  filters: { idx_tier: 3 },
})
```

#### Range

```typescript
const heroes = await RundotGameAPI.ugc.browse({
  contentType: 'hero',
  filters: { idx_tier: { gte: 2, lte: 4 } },
  sortBy: 'idx_tier',
  sortOrder: 'asc',
})
```

| Operator | Meaning | Example |
|----------|---------|---------|
| `gte` | `>=` | `{ idx_power: { gte: 100 } }` |
| `lte` | `<=` | `{ idx_power: { lte: 500 } }` |

**Important:** When using range filters, set `sortBy` to the same `idx_` field you are filtering on (e.g. `sortBy: 'idx_tier'`). The default sort (`createdAt`) combined with a range filter on a different field requires a composite index that may not exist; if it's missing the query returns an error. Setting `sortBy` to the filtered field avoids this.

Range filters on multiple different `idx_` fields in the same query are not supported.

### Follow Counts

```typescript
interface UgcFollowCounts {
  followerCount: number
  followingCount: number
}
```

### Voting Types

```typescript
interface UgcVoteParams {
  entryId: string
  count?: number            // votes to cast; defaults to 1, min 1, max 15
  clientRequestId?: string  // stable ID for idempotent retry
}

interface UgcUnvoteParams {
  entryId: string
  count?: number            // votes to remove; defaults to 1, min 1, max 15
  clientRequestId?: string  // stable ID for idempotent retry
}

interface UgcVoteTotals {
  budget: number     // 3 by default, 15 for Ultimate
  used: number
  remaining: number  // max(0, budget - used)
}

interface UgcVoteMutationResult {
  entryId: string
  userEntryCount: number   // votes this user has cast on this entry
  entryTotalCount: number  // total votes the entry has received this week
  totals: UgcVoteTotals
}

interface UgcMyVotesResponse {
  weekKey: string  // ISO week, e.g. "2026-W19"
  totals: UgcVoteTotals
  byEntry: Array<{ entryId: string; count: number }>
}

interface UgcVoteListParams {
  limit?: number     // page size, max 25
  cursor?: string
}

interface UgcVoteWinnersListParams extends UgcVoteListParams {
  topN?: number      // ranked entries per week (1..25, default 3)
}

interface UgcVoteLeaderboardResponse {
  weekKey: string
  items: Array<{
    entryId: string
    count: number
    firstVotedAt: number  // millis
  }>
  nextCursor: string | null
}

interface UgcVoteWinnersResponse {
  items: Array<{
    weekKey: string
    weekStartUtc: number  // millis
    weekEndUtc: number    // millis
    winners: Array<{
      rank: number       // 1-based, capped at 25
      entryId: string
      count: number
      firstVotedAt: number  // millis
      snapshot: {
        title?: string
        authorId: string
        authorName: string
        authorAvatarUrl: string | null
        contentType: string
      }
    }>
  }>
  nextCursor: string | null
}
```

### Recommendation Response

```typescript
interface UgcRecommendationResponse {
  recommId: string  // Pass to getMoreRecommendations or interaction methods
  entries: Array<UgcEntry & { isLikedByMe?: boolean }>
}

interface UgcCompositeRecommendationResponse {
  recommId: string
  sourceEntry: UgcEntry | null  // The source entry the recommendations are based on
  entries: Array<UgcEntry & { isLikedByMe?: boolean }>
}
```

### Cross-App Parameters

`UgcCrossAppBrowseParams` is `UgcBrowseParams` plus a required `targetAppId`, so it inherits the full browse surface (`contentType`, `authorId`, `cursor`, `limit`, `sortBy`, `sortOrder`, `filters`) with the same `UgcSortBy` union as `browse`.

```typescript
interface UgcCrossAppBrowseParams extends UgcBrowseParams {
  targetAppId: string  // The sibling app to read from (same ownerUserId)
}

interface UgcCrossAppCreateParams {
  targetAppId: string
  contentType: string
  data: Record<string, unknown>
  isPublic?: boolean
  title?: string
  tags?: string[]
  uniqueKey?: string      // Dedup key (per contentType); an existing match is returned instead of creating
  audience?: 'general' | 'mature'  // Restricted — see below
}

interface UgcCrossAppUpdateParams {
  targetAppId: string
  id: string              // Entry to update; must have been created from this app
  data?: Record<string, unknown>
  isPublic?: boolean
  title?: string
  tags?: string[]
  uniqueKey?: string      // Backfill a dedup key onto this entry; 409 if another entry holds it
  audience?: 'general' | 'mature'  // Restricted — see below
}
```

**`audience` is restricted.** Any write that sets or changes `'mature'` requires an authorized internal principal; every other caller gets a `403` (`UgcAuthorizationError`). Setting `'general'` on an entry that is not already mature is ungated, echoing an entry's existing value back is not a mutation, and there is no way to clear the field — so omit it unless you intend to change it. The same `403` also fires when you flip `isPublic` or `isPlatformVisible` to `true` on a mature entry, even when `audience` is absent from your request. The SDK's game-scoped `create`/`update` do not expose `audience` at all.

---

## Configuration

### Recommended: `rundot/ugc.config.json`

Place your UGC config at `rundot/ugc.config.json`. The file contains the UGC settings **directly** (no `ugc` wrapping key):

```json
{
  "maxEntriesPerUser": 100,
  "maxDataSizeBytes": 102400,
  "moderationFields": ["title", "data.name", "data.description"],
  "requireModeration": false
}
```

> Commit `rundot/` to your repo; it's project config like `package.json`, not a build artifact. It's env-agnostic and takes priority over legacy `config.{local,staging}.json` for any system it defines. `game.config.prod.json` is a separate file for local CLI metadata; UGC config does not go there.

### Also supported: legacy `config.json`

Add a `ugc` key to your project's `config.json`. Legacy layouts keep working indefinitely; run `rundot migrate-config` (with `--dry-run` to preview) to move them into `rundot/` automatically.

<details>

<summary>Legacy <code>config.json</code></summary>

```json
{
  "ugc": {
    "maxEntriesPerUser": 100,
    "maxDataSizeBytes": 102400,
    "moderationFields": ["title", "data.name", "data.description"],
    "requireModeration": false
  }
}
```

</details>

**Configuration Options:**

| Field | Default | Description |
|-------|---------|-------------|
| `maxEntriesPerUser` | 100 | Max entries per user per app |
| `maxDataSizeBytes` | 102400 | Max size of `data` field (100KB) |
| `moderationFields` | `["title"]` | Fields to check for content moderation |
| `requireModeration` | false | If true, new content is hidden until approved |
| `autoQuarantineReportThreshold` | _(server default)_ | Distinct user reports that auto-quarantine an entry (see [Reporting](#reporting)) |

---

## Content Types

Content types are app-defined strings that categorize your UGC:

```typescript
// Examples
'character'  // Custom characters
'level'      // User-created levels
'deck'       // Card decks
'outfit'     // Fashion items
'story'      // User stories
```

**Best Practices:**
- Use lowercase, alphanumeric with underscores/hyphens
- Keep types consistent across your app
- Query by content type to show relevant UGC sections

---

## Best Practices

### Content Structure

```typescript
// Good: Structured, validated data
const goodEntry = await RundotGameAPI.ugc.create({
  contentType: 'character',
  data: {
    version: 1,  // Version your data format
    name: 'Hero',
    class: 'warrior',
    stats: { hp: 100, attack: 15 },
    abilities: ['slash', 'block']
  }
})

// Bad: Unstructured blob
const badEntry = await RundotGameAPI.ugc.create({
  contentType: 'data',
  data: { blob: '...' }  // Hard to validate/display
})
```

### Error Handling

```typescript
try {
  await RundotGameAPI.ugc.create({ ... })
} catch (error) {
  if (error.message.includes('rate limit')) {
    showToast('Too many entries. Please wait before creating more.')
  } else if (error.message.includes('moderation')) {
    showToast('Content was flagged. Please revise and try again.')
  } else {
    showToast('Failed to publish. Please try again.')
  }
}
```

### Caching

```typescript
// Cache browse results locally
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

let cachedCatalog = null
let cacheTime = 0

async function getCatalog() {
  if (cachedCatalog && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedCatalog
  }
  
  cachedCatalog = await RundotGameAPI.ugc.browse({ sortBy: 'mostUsed' })
  cacheTime = Date.now()
  return cachedCatalog
}
```

---

## Limits & Rate Limiting

| Limit | Value |
|-------|-------|
| Max entries per user per app | 100 (configurable) |
| Max `data` size | 100KB |
| Content type format | Alphanumeric, `_`, `-` |
| Max content type length | 64 characters |
| Usage tracking | Once per user per entry per day |
| `getMany` batch size | Max 100 entry IDs per request |
| Self-follow | Not allowed (server rejects) |
| Recommendation `count` | 1 min, 50 max |
| `getMoreRecommendations` validity | 30 minutes after last request |
| Weekly vote budget (default) | 3 per user per app |
| Weekly vote budget (Ultimate) | 15 per user per app |
| Per-request vote/unvote `count` | 1 min, 15 max (defaults to 1) |
| Leaderboard page size | 5 default, 25 max |
| Winners page size (weeks per page) | 4 default, 25 max |
| Winners `topN` (ranked entries per week) | 3 default, 25 max |
| Winners retained per weekly snapshot | Top 25 |

---

## Security

- **Authentication Required**: All UGC operations require a logged-in user
- **Ownership Enforcement**: Only authors can update/delete their content
- **Cross-App Isolation**: Cross-app access is restricted to apps sharing the same `ownerUserId`
- **Content Moderation**: Optional field-level moderation via configuration
- **Rate Limiting**: Prevents spam creation
- **Report System**: Community-driven content flagging

---

## Features Summary

- **CRUD Operations**: Create, read, update, delete user content
- **Collaborators**: Owner-managed per-entry editors for co-editing a single entry
- **Community Browse**: Discover public content with sorting and author filtering
- **Batch Fetch**: Retrieve multiple entries by ID in a single request
- **Cross-App UGC**: Browse, read, count, create, update, and delete entries across apps by the same creator
- **Creator Following**: Follow/unfollow creators with follower and following counts
- **Engagement**: Likes, usage tracking, reporting
- **Weekly Voting**: Subscription-tiered weekly vote budgets, live leaderboards, and archived top-3 winners
- **Recommendations**: Personalized, item-based, and composite content discovery with pagination and interaction tracking
- **Pagination**: Cursor-based pagination for large datasets
- **Flexible Data**: Store any JSON structure (up to 100KB)
- **Content Moderation**: Optional moderation for titles and data fields
- **Author Attribution**: Automatic author info on all entries

---

## CLI Management (`rundot ugc`)

The `rundot` CLI provides commands for managing UGC entries and handling moderation without requiring the game client.

### Player Commands

```bash
# List public entries (auto-detects game from game.config.local.json)
rundot ugc list

# List only your entries
rundot ugc list --mine

# Get full details of an entry
rundot ugc get <entry-id>

# Delete an entry you own
rundot ugc delete <entry-id>

# List entries shared with you (where you are a collaborator)
rundot ugc shared
rundot ugc shared --content-type character

# Manage collaborators on an entry you own
rundot ugc members list <entry-id>
rundot ugc members add <entry-id> --profile <profile-id>
rundot ugc members remove <entry-id> --profile <profile-id>
```

### Admin Commands (Owner/Editor)

These commands require owner or editor role on the game.

```bash
# Browse all entries, including private and removed
rundot ugc admin browse
rundot ugc admin browse --public false --content-type character

# Filter by multiple content types in one query (--content-type is repeatable)
rundot ugc admin browse --content-type character --content-type level

# Soft-remove an entry
rundot ugc admin remove <entry-id>

# List user reports
rundot ugc admin reports --status pending

# Resolve a report
rundot ugc admin resolve <report-id> --action reviewed
rundot ugc admin resolve <report-id> --action dismissed

# List entries that were auto-quarantined (by reports or content moderation)
rundot ugc quarantined

# Approve (lift the quarantine on) an entry
rundot ugc approve <entry-id>
```

### Typical Moderation Workflow

```bash
# 1. Check for pending reports
rundot ugc admin reports --status pending

# 2. Review the flagged entry
rundot ugc get <entry-id>

# 3a. Remove if inappropriate, then mark report reviewed
rundot ugc admin remove <entry-id>
rundot ugc admin resolve <report-id> --action reviewed

# 3b. Or dismiss the report if content is acceptable
rundot ugc admin resolve <report-id> --action dismissed
```

Auto-quarantine runs without admin action (see [Reporting](#reporting)), so periodically review the queue and either approve false positives or remove genuinely bad content:

```bash
# Review auto-quarantined entries, then either restore or remove
rundot ugc quarantined
rundot ugc approve <entry-id>     # false positive: make it visible again
rundot ugc admin remove <entry-id> # confirmed bad: soft-remove permanently
```

All commands accept `--game-id <id>` to specify the game explicitly. If omitted, the CLI reads `game.config.local.json` from the current directory (set via `rundot init`).
