# Chrome Web Store listing copy

Use this text when creating or updating the **Applybox Recruiter** listing.

## Basic information

| Field | Value |
|-------|-------|
| **Name** | Applybox Recruiter |
| **Category** | Productivity |
| **Language** | English (UK) |
| **Privacy policy URL** | https://app.applybox.co.uk/privacy |
| **Homepage URL** | https://app.applybox.co.uk |
| **Support email** | support@applybox.co.uk |

## Short description (max 132 characters)

Import candidate profiles from LinkedIn, CV-Library, Indeed, and other CRMs directly into your ApplyBox account.

## Detailed description

Applybox Recruiter is the official Chrome extension for **ApplyBox** recruitment customers. It helps recruiters capture candidate profiles while browsing job boards and CRM systems, then send them straight into ApplyBox with one click.

**What you can do**

- Sign in with your existing ApplyBox account (email, OTP, Google, or Microsoft)
- Open the side panel while viewing a candidate profile
- Auto-fill name, email, phone, job title, location, and summary from supported sites
- Attach a CV or profile PDF before sending
- Add notes that appear in the candidate activity timeline
- Import profiles when migrating from another CRM (while logged into both systems)

**Supported sources**

- LinkedIn candidate profiles
- CV-Library recruiter profiles
- Indeed candidate profiles
- Selected third-party CRM candidate pages (for migration)

**Requirements**

- An active ApplyBox account
- Chrome 114 or later (side panel support)
- You must be logged into the source site (e.g. LinkedIn) where applicable

Data is sent only to ApplyBox (`api.applybox.co.uk`) using your authenticated session. The extension does not sell or share candidate data with third parties.

## Single purpose

This extension exists solely to let authenticated ApplyBox recruiters import candidate profile data from supported web pages into their ApplyBox tenant.

## Permission justifications

| Permission | Why it is needed |
|------------|------------------|
| **activeTab** | Read the candidate profile on the tab you are viewing when you click Re-fetch or Send. |
| **storage** | Store your ApplyBox login session locally in Chrome. |
| **scripting** | Inject profile extraction on supported candidate pages when you request a fetch. |
| **tabs** | Detect which browser tab has the candidate profile and open SSO sign-in. |
| **cookies** | Download CVs from CV-Library using your recruiter session cookies. |
| **debugger** | Capture a profile page as PDF when no direct CV download is available. |
| **sidePanel** | Show the Applybox Recruiter panel docked beside the browser. |
| **downloads** | Save downloaded CV files from supported job boards. |
| **Host permissions (LinkedIn, CV-Library, Indeed, CRM domains)** | Extract candidate fields only on pages you open while using the extension. |
| **api.applybox.co.uk / app.applybox.co.uk** | Authenticate and save candidates to your ApplyBox account. |

## Screenshots (required)

Provide at least **1** screenshot (recommended **3–5**):

- **Size:** 1280×800 or 640×400 PNG/JPEG
- Suggested shots:
  1. Login screen (side panel)
  2. Candidate form auto-filled from LinkedIn
  3. Success message after Send to ApplyBox
  4. Tenant selection (if multi-org)

Run `npm run generate:store-assets` to create files in `chrome-extension/store/screenshots/`, or replace with live captures from your machine.

## Promotional images (optional)

- **Small promo tile:** 440×280
- **Marquee promo tile:** 1400×560

Use ApplyBox branding consistent with https://app.applybox.co.uk.
