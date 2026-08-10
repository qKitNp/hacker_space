# Contributing to Hacker Space

Thanks for helping improve a small, focused new-tab extension.

## Principles

1. **Single purpose** — a calm HN new tab. Features should serve that, not turn it into a full browser.
2. **Minimal permissions** — avoid new host permissions or Chrome APIs unless unavoidable.
3. **Local-first** — user data (bookmarks, notes, settings) stays in the browser unless there is a strong reason otherwise.
4. **No build step** unless the payoff is large — prefer plain JS/CSS/HTML.
5. **No remote code** — keep scripts inside the package (MV3 / Web Store policy).

## Setup

See [README.md](./README.md#install-development) for loading the unpacked extension.

## Branch protection

`main` is protected:

- Force-push and branch deletion are blocked  
- Prefer a **pull request** for external contributions  
- Do not commit `.pem`, `.crx`, or personal packaging artifacts  

## Making changes

1. Branch from `main`
2. Keep diffs focused (one concern per PR when possible)
3. Manually verify:
   - New tab loads a story (online and with cached data)
   - Settings persist across reloads
   - Bookmark add / note / remove / drawer
   - **Alt+B** quick bookmark on the new tab (and does nothing harmful on other sites)
   - Light and dark (or auto) theme still look intentional
4. Bump `version` in `manifest.json` when shipping a user-visible change

## Code map

| File | Own |
|------|-----|
| `manifest.json` | Permissions, new tab, commands |
| `background.js` | Command → tab message only |
| `newtab.js` | All UI logic, fetch, cache, bookmarks |
| `newtab.html` / `newtab.css` | Structure and visuals |

## Pull requests

- Describe **what** changed and **why**
- Call out any permission or network-host changes explicitly
- Screenshots help for UI changes (1280×800 is ideal if you’ll also use them for the store)
- Link related backend PRs if the API contract changes

## Security / privacy

See [SECURITY.md](./SECURITY.md) and [PRIVACY.md](./PRIVACY.md). Never introduce analytics or unexpected host permissions without discussion.

## Questions

Open a GitHub issue on [qKitNp/hacker_space](https://github.com/qKitNp/hacker_space).
