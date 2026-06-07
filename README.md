# Applybox Recruiter

Chrome extension to import candidate profiles from LinkedIn, CV-Library, Indeed, and other CRMs into ApplyBox.

Built with **React**, **Tailwind CSS**, and **Radix UI** (matching the main frontend design system).

## Auth

Uses the same API endpoints as the frontend:

| Method | Endpoint |
|--------|----------|
| Save candidate + PDF | `POST /candidates/from-extension` |
| Password login | `POST /auth/login` |
| Request OTP | `POST /auth/request-otp` |
| OTP login | `POST /auth/login-otp` |
| Session | `GET /auth/me` |
| Active tenant | `POST /auth/active-tenant` |
| Google SSO | `GET /api/auth/google/redirect?callback=...` |
| Microsoft SSO | `GET /api/auth/microsoft/redirect?callback=...` |

## Setup

```bash
cd chrome-extension
npm install
cp .env.example .env   # optional — set VITE_API_URL for local API
npm run build
```

## Load in Chrome (development)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome-extension/dist` folder

## Chrome Web Store publish

See **[store/PUBLISHING.md](./store/PUBLISHING.md)** for the full checklist.

```bash
npm run package:store
```

Upload `releases/applybox-recruiter-<version>.zip` to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

Listing copy and permission justifications: **[store/LISTING.md](./store/LISTING.md)**

## Development

```bash
npm run dev
```

Then load the `dist` folder in Chrome. Vite will rebuild on file changes — click the refresh icon on the extension card to reload.

## Usage

1. Click the extension icon to open the **Applybox Recruiter side panel**
2. Sign in with email/password, OTP, Google, or Microsoft
3. Select a tenant if you belong to multiple organisations
4. Navigate to a candidate profile on a supported site in the same window
5. Use **Re-fetch from page** in the side panel to load profile data
6. Review and click **Send to ApplyBox** (optionally attaches a CV or profile PDF)

Requires **Chrome 114+** for the side panel API.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `https://api.applybox.co.uk/api` | API base URL (include `/api` suffix) |
| `VITE_FRONTEND_URL` | `https://app.applybox.co.uk` | Web app origin for SSO callback |
| `VITE_STORE_BUILD` | unset | Set to `true` for store builds (omits localhost from manifest) |

Production defaults are in `.env.production`. Store builds set `VITE_STORE_BUILD=true` via `npm run build:store`.

## SSO note

Google/Microsoft SSO opens a browser tab and uses the same web app callback as the frontend (`{VITE_FRONTEND_URL}/callback`).

After rebuilding, click **Reload** on the extension in `chrome://extensions/`.
