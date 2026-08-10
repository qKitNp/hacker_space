# Architecture

Hacker Space is a **Manifest V3** Chrome extension with no bundler and no content scripts on third-party sites.

## Components

### 1. New tab page (`newtab.html` + `newtab.js` + `newtab.css`)

Replaces Chrome’s NTP via `chrome_url_overrides.newtab`.

Responsibilities:

- Fetch and cache story summaries
- Pick a random story (prefer fresher posts)
- Render title, meta, summary (light markdown)
- Soft-refresh score from HN Firebase after first paint
- Settings UI (theme, font, visibility)
- Bookmarks UI (star, note modal, drawer)

State lives in **`localStorage`** keys:

| Key | Contents |
|-----|----------|
| `hs_settings` | Theme, font, visibility flags |
| `hs_latest_summaries_cache` | `{ timestamp, items[] }` |
| `hs_bookmarks` | Array of bookmark snapshots |

### 2. Service worker (`background.js`)

Exists only so **`chrome.commands`** can fire while a new tab is focused.

Flow:

```
User presses Alt+B
  → service worker onCommand("quick-bookmark")
  → chrome.tabs.query({ active: true, lastFocusedWindow: true })
  → chrome.tabs.sendMessage(tabId, { type: "HS_QUICK_BOOKMARK" })
  → newtab.js listener → handleQuickBookmark()
```

If the active tab is not the extension page, `sendMessage` fails quietly.

### 3. Remote services

| Host | Role | Direction |
|------|------|-----------|
| `hn.tinkerers.space` | Summarized HN feed | Extension → API (GET) |
| `hacker-news.firebaseio.com` | Live item JSON / score | Extension → API (GET) |

Neither service receives bookmarks or settings.

## Trust & review notes

- All executable JS is in the package (`background.js`, `newtab.js`). Summary **data** is remote; scripts are not.
- Google Fonts were historically linked from HTML; prefer system fonts for store CSP simplicity if still present in a given revision.
- Host permissions are narrow match patterns, not `<all_urls>`.

## Extension of the system

| Idea | Fit |
|------|-----|
| More local UI polish | Good |
| Sync bookmarks via `chrome.storage.sync` | Needs `storage` permission + UX for quota |
| Server-side accounts | Out of single purpose unless carefully scoped |
| Content scripts on news.ycombinator.com | New permissions; usually avoid |
