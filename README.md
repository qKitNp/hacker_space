# Hacker Space

**A minimal Chrome new-tab page that shows one random Hacker News story — with a short AI summary, live points, and local bookmarks.**

Every new tab is a quiet HN moment: title, domain, author, score, and an optional summary so you can decide in seconds whether to dive in.

| | |
|---|---|
| **Manifest** | V3 |
| **Version** | 1.2 |
| **Store / privacy** | [Privacy policy](https://qkitnp.github.io/hacker-space-privacy/) |
| **Summary API** | [`hn.tinkerers.space`](https://hn.tinkerers.space) |

---

## Features

- **Random HN story on every new tab** — biased toward posts from the last ~36 hours
- **AI-generated summaries** from the Hacker Space backend (when available)
- **Live point counts** from the public Hacker News Firebase API
- **Bookmarks with optional notes** (stored only in the browser)
- **Bookmarks drawer** to reopen, edit notes, or remove saves
- **Quick bookmark** keyboard command: **Alt+B** / **Option+B**
- **Settings**: auto / light / dark theme; sans / serif / mono; toggle points, domain, author, summary
- **Fast paint**: local cache + stale-while-revalidate so the page doesn’t wait on a cold network

---

## Install (development)

1. Clone this repo:

   ```bash
   git clone https://github.com/qKitNp/hacker_space.git
   cd hacker_space
   ```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select this repository folder (the one that contains `manifest.json`)
5. Open a new tab

### Optional: keyboard shortcut

Chrome may remaps commands. Check or change **Alt+B** under:

`chrome://extensions/shortcuts`

---

## How it works

```
┌─────────────────────┐     GET /latest_summaries      ┌──────────────────────────┐
│  New tab page       │ ─────────────────────────────► │  hn.tinkerers.space      │
│  newtab.html + js   │ ◄──── story list + summaries ── │  (summarizer backend)    │
└─────────┬───────────┘                                 └──────────────────────────┘
          │
          │  GET /v0/item/{id}.json  (score refresh)
          ▼
┌─────────────────────┐
│  HN Firebase API    │
│  hacker-news.       │
│  firebaseio.com     │
└─────────────────────┘

Bookmarks, settings, and story cache → browser localStorage only (never uploaded)
```

### Load path (new tab)

1. **Fresh cache** (&lt; 30 min) → pick a random story immediately  
2. **Stale cache** → show immediately, refresh list in the background  
3. **No cache** → wait for one `/latest_summaries` request, then show  
4. After paint → soft-update the story’s **score** from Firebase  

Random selection prefers stories with `time` within the last **36 hours**; if none qualify, it falls back to the full cached list.

### Bookmarks

- Star next to the title (or **Alt+B**) to save the current story  
- Optional note (max **500** characters)  
- Drawer lists bookmarks newest-first: open article, open HN comments, edit note, remove  
- Snapshot stored locally: `id`, `title`, `url`, `by`, `score`, `summary`, `time`, `domain`, `note`, `bookmarkedAt`

### Quick bookmark (`background.js`)

Manifest command `quick-bookmark` is handled by a small service worker that messages the active tab with `{ type: 'HS_QUICK_BOOKMARK' }`. Only the Hacker Space new-tab page listens; other sites are no-ops (no broad `tabs` permission required for the product’s design).

---

## Project structure

```
hacker_space/
├── manifest.json      # MV3: new tab override, hosts, command
├── background.js      # chrome.commands → active tab message
├── newtab.html        # New tab DOM (story, settings, bookmarks, note modal)
├── newtab.css         # Themes + layout
├── newtab.js          # Fetch, cache, settings, bookmarks, markdown summary
└── icons/             # 16 / 32 / 48 / 128
```

No build step: plain HTML/CSS/JS.

---

## Permissions

| Declaration | Why |
|-------------|-----|
| `chrome_url_overrides.newtab` | Entire product is a custom new tab |
| `host_permissions`: `https://hn.tinkerers.space/*` | Load summarized stories |
| `host_permissions`: `https://hacker-news.firebaseio.com/*` | Refresh public scores |
| `background.service_worker` | Route **Alt+B** to the new tab |
| `commands.quick-bookmark` | Keyboard quick-save |

**Not requested:** `storage`, `tabs`, `<all_urls>`, identity, or history. Settings and bookmarks use `localStorage` on the extension page.

---

## Configuration (code constants)

Defined at the top of `newtab.js`:

| Constant | Default | Meaning |
|----------|---------|---------|
| `API_URL` | `https://hn.tinkerers.space/latest_summaries?limit=100` | Summaries feed |
| `HN_ITEM_API_URL` | `https://hacker-news.firebaseio.com/v0/item` | Per-item score |
| `CACHE_TTL_MS` | 30 minutes | When cache is “fresh” |
| `PREFERRED_STORY_AGE_MS` | 36 hours | Prefer newer stories when picking |
| `NOTE_MAX_LENGTH` | 500 | Bookmark note cap |
| `BOOKMARKS_KEY` | `hs_bookmarks` | localStorage key |
| `CACHE_KEY` | `hs_latest_summaries_cache` | localStorage key |
| Settings key | `hs_settings` | Theme / font / visibility |

To point at a local backend, change `API_URL` and reload the extension.

---

## Privacy

- **No accounts**, no analytics SDKs, no ad networks  
- Bookmarks, notes, and settings stay **on device**  
- Network traffic is read-only GET to the summary API and HN Firebase  

Full policy: **https://qkitnp.github.io/hacker-space-privacy/**

---

## Development tips

- After editing files: `chrome://extensions` → **Reload** on Hacker Space → open a new tab  
- Console: open DevTools on the new tab page (right-click → Inspect)  
- Clear local data: DevTools → Application → Local Storage → extension origin  
- Summary text supports light markdown (bold, italic, code, links); HTML is escaped first  

### Packaging for Chrome Web Store

1. Zip the extension **root** (must contain `manifest.json` at the top of the zip), excluding `.git`  
2. Screenshots: **1280×800** or **640×400**, JPEG or 24-bit PNG (**no alpha**)  
3. Upload the zip in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) (not a `.crx` for store upload)  
4. Justify host permissions and the new-tab override (single purpose: HN new tab reader)

Example zip from this folder:

```bash
zip -r -X hacker-space.zip . -x "*.git*" -x "*.DS_Store" -x "**/.DS_Store"
```

---

## Backend

Summaries are produced by a separate service (not in this repository) at:

- **Production:** https://hn.tinkerers.space  
- Useful routes: `/latest_summaries?limit=…`, `/random`, `/status`

If the API is down, a valid local cache still works until it ages out; with no cache, the new tab shows an error state.

---

## Single purpose (Chrome Web Store)

> Replace the new tab page with a random Hacker News story and a short summary.

Local bookmarks, notes, settings, and score refresh only support that new-tab experience.

---

## License

No license file is checked in yet. If you want this open-source under MIT (or another license), open an issue or PR.
