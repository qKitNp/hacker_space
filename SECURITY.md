# Security Policy

## Supported versions

The `main` branch is the only supported line for fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security-sensitive reports.

Prefer:

1. A GitHub **Security advisory** on this repository, or  
2. Contact the maintainer via [GitHub](https://github.com/qKitNp)

Include impact, reproduction steps, and whether user data is involved.

## What this extension does with data

| Data | Where it lives | Network |
|------|----------------|---------|
| Settings | Browser `localStorage` | Never uploaded |
| Bookmarks + notes | Browser `localStorage` | Never uploaded |
| Story cache | Browser `localStorage` | Filled from public APIs |
| Summaries | From `hn.tinkerers.space` | Read-only GET |
| Scores | From Hacker News Firebase | Read-only GET |

There are **no accounts**, analytics SDKs, or ad networks in this package.

## Permissions (trust surface)

| Declaration | Risk if abused | Actual use |
|-------------|----------------|------------|
| New tab override | Replaces NTP | Sole product UI |
| `hn.tinkerers.space` | Could exfiltrate if code were malicious | Story summaries only |
| `hacker-news.firebaseio.com` | Same | Live scores only |
| Service worker + command | Could message tabs | Only routes **Alt+B** to the extension page |

All executable JS ships in this repository (`newtab.js`, `background.js`). Summary **content** is remote; extension **code** is not.

## Related

- Privacy policy: https://qkitnp.github.io/hacker-space-privacy/  
- Backend (separate): https://github.com/qKitNp/hacker_news_extension_backend  
