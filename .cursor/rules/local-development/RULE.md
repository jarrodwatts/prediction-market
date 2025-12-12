---
description: "Local development: run Next.js + Twitch OAuth/EventSub without guessing"
globs:
  - "app/**"
  - "lib/**"
  - "package.json"
  - "next.config.*"
alwaysApply: false
---

# Local Development (repeatable checklist)

**Note:** Cursor rules normally live at `.cursor/rules/**/RULE.md`. If your environment/tooling blocks writing to `.cursor/`, copy this file to:

- `.cursor/rules/local-development/RULE.md`

---

This project has two distinct “local dev” modes:

- **UI-only mode** (fast): run the Next.js app on `http://localhost:3000` with no tunnels.
- **Full Twitch mode** (OAuth + EventSub): requires a **public HTTPS URL** so Twitch can reach your webhook.

The main “gotcha” is that **EventSub webhook callbacks are derived from `NEXTAUTH_URL`**:

- **EventSub callback**: `${NEXTAUTH_URL}/api/twitch/webhook`
- **NextAuth Twitch redirect**: `${NEXTAUTH_URL}/api/auth/callback/twitch`

So if your public URL changes, you must update **both** Twitch settings and local env.

---

## First-time setup (do once)

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure env vars

Required (server-side) env vars:

- `NEXTAUTH_URL` (base URL for the app; for EventSub must be **public HTTPS**)
- `NEXTAUTH_SECRET` (any strong secret string)
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_WEBHOOK_SECRET` (used to verify EventSub signatures)

If you use Vercel KV in dev, you’ll also need KV env vars configured for `@vercel/kv`.

### 3) Pick ONE tunnel provider

You only need a single public HTTPS URL. Prefer:

- **Cloudflare Tunnel** if you want a stable URL.
- **ngrok** if you don’t mind the URL changing (unless you reserve a domain).

Once you have a public URL, set:

- `NEXTAUTH_URL=https://<your-public-domain>`

### 4) Configure Twitch OAuth redirect URLs (once per base URL)

In Twitch Developer Console for your app, add:

- `https://<your-public-domain>/api/auth/callback/twitch`

Optional (handy for UI-only mode sign-in):

- `http://localhost:3000/api/auth/callback/twitch`

---

## Every time you start local dev

### UI-only mode (no tunnels)

```bash
pnpm dev
```

Open `http://localhost:3000`.

### Full Twitch mode (OAuth + EventSub)

1) Start the app:

```bash
pnpm dev
```

2) Start **one** tunnel to `http://localhost:3000` and note the public HTTPS URL.

3) Ensure `NEXTAUTH_URL` matches that public URL.

4) Visit `https://<your-public-domain>/streamer` (IMPORTANT: use the tunneled domain, not localhost).

5) Sign in with Twitch and complete EventSub subscription creation (the UI calls `POST /api/twitch/subscribe`).

---

## Fast debugging tips

- If EventSub subscriptions succeed but webhooks never arrive, 99% of the time:
  - `NEXTAUTH_URL` is wrong, or
  - Twitch can’t reach your tunnel URL, or
  - the tunnel is HTTP-only (must be HTTPS), or
  - your Twitch app redirect URLs don’t include your current base URL.

- Use the **Developer diagnostics** section on `/streamer` (dev-only) to see:
  - which env vars are missing
  - computed webhook + OAuth callback URLs
  - whether KV is reachable
  - the “last webhook received” timestamp (so you know if Twitch is hitting you)

