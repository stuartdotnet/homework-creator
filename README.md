# Homework Creator

A simple web app that generates fun, personalised homework for children using Azure AI Foundry.

The Azure key is **never** shipped to the browser: the front-end is a static
site, and all Azure calls go through a locked-down Cloudflare Pages Function
(`functions/api/generate.js`) that holds the key as a server secret. See
**[Deploying](#deploying-cloudflare-pages)** below.

---

## Quick Start

### 1. Install Node.js

Download and install from [nodejs.org](https://nodejs.org) (LTS version).

### 2. Set up Azure AI Foundry

1. Go to [ai.azure.com](https://ai.azure.com) and sign in with your Microsoft account
2. Click **New project** → give it a name (e.g. `homework-creator`)
3. In your project, go to **Deployments** → **Deploy model** → choose **gpt-4o** (or any chat model)
4. Give the deployment a name (e.g. `gpt-4o`) and deploy
5. Go to **Settings** → **Keys and Endpoint** — copy your endpoint URL and API key

### 3. Set up Cloudflare Turnstile (human verification)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com) → **Turnstile** → **Add site**
2. Add your domain (and `localhost` for local testing)
3. Copy the **Site Key** (public) and **Secret Key** (server-only)

### 4. Configure the app

```bash
cp .env.example .env
```

Open `.env` and add only the **public** site key:

```
VITE_TURNSTILE_SITEKEY=your-turnstile-site-key
```

The Azure key and Turnstile secret are **not** put here — they're server
secrets (see [Deploying](#deploying-cloudflare-pages)).

### 5. Install and run locally

Because the app now calls a server function (`/api/generate`), plain
`npm run dev` won't serve that route. Use Wrangler, which runs both the Vite
front-end and the Functions:

```bash
npm install
npm run build
npx wrangler pages dev dist
```

For local testing you'll also need the server vars available to Wrangler —
create a `.dev.vars` file (gitignored) with:

```
FOUNDRY_ENDPOINT=https://your-project.services.ai.azure.com
FOUNDRY_API_KEY=your-api-key
FOUNDRY_DEPLOYMENT=gpt-4o
TURNSTILE_SECRET=your-turnstile-secret
```

Open the URL Wrangler prints (usually [http://localhost:8788](http://localhost:8788)).

---

## How It Works

1. Fill in the child's name, grade, age, and interests
2. Select which subjects to include
3. Click **Generate Homework**
4. The app calls Azure AI Foundry and generates a tailored 30-minute homework set
5. Toggle between the student view (no answers) and parent/teacher view (answers + hints)

---

## Adding More Subjects

Edit `src/lib/buildPrompt.js` — add a new entry to `SUBJECT_CONFIGS` and add it to the `SUBJECTS` array in `src/App.jsx`.

---

## Deploying (Cloudflare Pages)

This app is deployed on **Cloudflare Pages** (not GitHub Pages) on purpose:
GitHub Pages can only serve static files, so it can't run the server function
that hides your Azure key. Cloudflare Pages serves the static site **and** runs
`functions/api/generate.js` at the edge, on the same free tier.

### One-time setup

1. **Create a KV namespace** for rate limiting and note the printed id:

   ```bash
   npx wrangler kv namespace create RATE_LIMIT
   ```

   Bind it to the Pages project as `RATE_LIMIT` — either uncomment the block in
   `wrangler.toml` with that id, or add it in the dashboard under
   **Pages project → Settings → Functions → KV namespace bindings**.

2. **Create the Pages project**: dashboard → **Workers & Pages → Create → Pages
   → Connect to Git**, pick this repo. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`

3. **Add the server secrets/vars** (dashboard → project → **Settings →
   Environment variables**), for the Production environment:

   | Name | Type | Value |
   |------|------|-------|
   | `FOUNDRY_ENDPOINT` | Secret | `https://your-project.services.ai.azure.com` |
   | `FOUNDRY_API_KEY` | Secret | your Azure key |
   | `FOUNDRY_DEPLOYMENT` | Secret | e.g. `gpt-4o` |
   | `TURNSTILE_SECRET` | Secret | Turnstile secret key |
   | `ALLOWED_ORIGIN` | Variable | `https://your-site.pages.dev` (or your custom domain) |
   | `VITE_TURNSTILE_SITEKEY` | Variable | Turnstile **site** key (used at build time) |

   > `ALLOWED_ORIGIN` must exactly match the origin you visit the site from.
   > After you attach a custom domain, update it.

4. **Deploy**: push to your default branch — Cloudflare builds and deploys
   automatically. Every push redeploys.

### How it's locked down

The public `/api/generate` endpoint enforces, in order:

1. **Content-type + same-origin** — rejects requests not coming from your site.
2. **Turnstile** — proves a real human on your page (invisible challenge).
3. **Per-IP rate limiting** (KV) — burst cap (3/min) and daily cap (30/IP/day).
4. **Input validation** — prompt must be a bounded string.
5. **Server-fixed model params** — clients can't crank `max_tokens`/temperature.

Tune the caps at the top of `functions/api/generate.js`.

> **Belt and braces:** also set a **spending cap / budget alert** on the Azure
> resource, and optionally add a Cloudflare **WAF rate-limiting rule** on
> `/api/generate` for a hard edge-level limit. KV limiting is eventually
> consistent, so it's abuse mitigation, not a financial guarantee.

### Could I still use GitHub Pages?

Only if you accept the Azure key being **public** (it would be readable in the
JS bundle by anyone). GitHub Pages has no server-side compute, so there's
nowhere to hide the key. For a public site, don't — use Cloudflare Pages as
above.
