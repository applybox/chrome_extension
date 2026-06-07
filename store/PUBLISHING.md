# Publishing Applybox Recruiter to the Chrome Web Store

## Prerequisites

1. **Google Chrome Web Store developer account** — register at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time registration fee).
2. **ApplyBox production API** deployed at `https://api.applybox.co.uk`.
3. **Privacy policy** live at `https://app.applybox.co.uk/privacy` (includes the browser extension section).
4. **Screenshots** — generate or capture 1280×800 images (see `store/screenshots/`).

## Build the store package

From the `chrome-extension` directory:

```bash
npm install
npm run generate:store-assets   # icon 128×128 + screenshots 1280×800
npm run package:store
```

This will:

1. Run a **production store build** (`VITE_STORE_BUILD=true`) with:
   - Production API and frontend URLs
   - **No** `localhost` host permissions
   - `minimum_chrome_version: 114`
2. Output a ZIP at `releases/applybox-recruiter-<version>.zip`

Upload **only** that ZIP — do not zip the project root or include `node_modules`.

### Verify before upload

Open `dist/manifest.json` and confirm:

- `version` matches `package.json`
- `host_permissions` does **not** contain `localhost`
- `icons` includes 16, 48, and 128

Optional local smoke test:

```bash
npm run build:store
# chrome://extensions → Load unpacked → select dist/
```

## Upload to Chrome Web Store

1. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. **New item** → upload `releases/applybox-recruiter-<version>.zip`.
3. Fill in listing details from `store/LISTING.md`:
   - Short & detailed description
   - Category: **Productivity**
   - Privacy policy URL: `https://app.applybox.co.uk/privacy`
   - Single purpose statement
   - Permission justifications (copy from LISTING.md)
4. Upload screenshots and the 128×128 store icon (`icons/icon128.png`).
5. Set **visibility** (Public or Unlisted for beta).
6. Submit for review.

Review typically takes a few days. Google may request clarification on broad host permissions (`debugger`, `cookies`, `*.indeed.com`) — refer to the justification table in `LISTING.md`.

## Version bumps

Each store upload must use a **new** `version` in `package.json` (semver, e.g. `1.5.0` → `1.5.1`).

```bash
# Edit package.json version, then:
npm run package:store
```

`EXTENSION_VERSION` in the UI reads from `package.json` automatically.

## SSO after publish

Google/Microsoft sign-in uses the web app callback (`https://app.applybox.co.uk/callback`). No extension ID is embedded in the OAuth flow — production SSO should work once the listing is live.

## Local development vs store builds

| Command | Use case |
|---------|----------|
| `npm run dev` | Local development with HMR |
| `npm run build` | Local testing; includes `localhost` host permissions |
| `npm run build:store` | Production manifest without localhost |
| `npm run package:store` | **Chrome Web Store ZIP** |

For local API testing, use `npm run build` with a `.env` file:

```env
VITE_API_URL=http://localhost:8000/api
VITE_FRONTEND_URL=http://localhost:3000
```

Do **not** upload that build to the Web Store.

## Checklist

- [ ] `npm run package:store` succeeds
- [ ] ZIP has no localhost permissions
- [ ] Privacy policy mentions the extension
- [ ] Screenshots prepared
- [ ] Permission justifications pasted in dashboard
- [ ] Tested sign-in and candidate import on production API
- [ ] Version incremented for updates
