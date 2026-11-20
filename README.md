# HenryBioOS (`https://bio.henrymilner.uk`)

A production-grade personal biometric repository, telemetry warehouse, and cross-domain analytics platform built with Next.js (App Router, TypeScript strict mode), PostgreSQL (Neon) via Drizzle ORM, Tailwind CSS, Recharts, and Google Gemini.

HenryBioOS ingests **all 19 Oura Cloud API v2 production endpoints**, combines them with external personal telemetry (timestamped medication dosing logs and daily Reminders task velocity), computes one-compartment pharmacokinetic curves and statistical correlations, monitors 30-day rolling Z-score physiological strain anomalies, and presents a high-density dark-mode analytical interface.

---

## 1. Architecture Overview

- **Database Layer (`src/db/schema.ts`, `src/db/index.ts`):**
  - **25 normalised PostgreSQL tables** stored in Neon via `@neondatabase/serverless` and Drizzle ORM:
    - **3 System/Auth Tables:** `oura_oauth_tokens` (single-row `id = 1` with transactional `SELECT ... FOR UPDATE` row locking for single-use refresh tokens), `webhook_subscriptions`, and `sync_logs`.
    - **All 19 Oura V2 Production Endpoints:** `oura_personal_info`, `oura_ring_configuration`, `oura_daily_readiness`, `oura_daily_sleep`, `oura_sleep`, `oura_sleep_time`, `oura_daily_activity`, `oura_daily_stress`, `oura_daily_resilience`, `oura_daily_spo2`, `oura_daily_cardiovascular_age`, `oura_vo2_max`, `oura_workout`, `oura_session`, `oura_enhanced_tag`, `oura_tag`, `oura_rest_mode_period`, `oura_heartrate`, and `oura_ring_battery_level`. Every table retains the full `raw_payload` (`jsonb`) alongside indexed analytical columns.
    - **3 Cross-Domain & Intelligence Tables:** `med_logs`, `daily_task_metrics`, and `ai_briefings`.
- **Oura API v2 Client & Webhooks (`src/lib/oura/`):**
  - Sends mandatory `User-Agent: HenryBioOS/1.0` on every request to `https://api.ouraring.com`.
  - Automatically follows `next_token` pagination and handles `HTTP 429` using `Retry-After` backoff (up to 3 attempts).
  - Real-time webhook receiver (`/api/webhooks/oura`) handles Oura verification challenges (`GET`), HMAC-SHA256 signature verification (`POST`), document fetches across all 16 `ExtApiV2DataType` types, and **piggyback 24-hour synchronisation** of `heartrate` and `ring_battery_level` whenever `sleep` or `daily_activity` webhooks arrive.
- **Pharmacokinetic & Statistical Engines (`src/lib/analytics/`):**
  - **Bateman PK Engine (`pk.ts`):** Computes residual serum concentration (`ng/mL`) at any timestamp and specifically joins against each night's `bedtime_start` (`elvanse_40`, `elvanse_30`, `amfexa_10`).
  - **Statistics & Anomaly Detector (`stats.ts`):** 30-day rolling Z-score strain/illness detector (`>= 2` metrics breaching `1.5σ` adversely) and Pearson `r`, OLS regression, and `0/+1/+2`-day lag correlation engine.
  - **AI Diagnostic Briefings (`briefing.ts`):** Generates objective 7-day vs. 30-day protocol reviews via `@google/genai`.
- **Analytical UI (`src/app/`):**
  - `/` — Command Overview
  - `/sleep` — High-Resolution Sleep Lab (30-second hypnogram + movement overlay, 5-minute HR/HRV + eCore 30s nadir marker, bedtime serum concentration, 14-day sleep debt)
  - `/cardio` — Cardiovascular & Autonomic Telemetry (PWV, vascular vs. chronological age, $\text{VO}_2$ Max, $\text{SpO}_2$/BDI, 24-hour discrete HR explorer)
  - `/correlations` — Cross-Domain Correlation Lab
  - `/archive` — 365-Day Contribution Heatmaps & Searchable Raw JSON Repository
  - `/briefings` — AI Diagnostic Briefing Feed
  - `/settings` — Pipeline Control (OAuth2, manual backfill, webhook setup/renewal, `sync_logs`)

---

## 2. Environment Variables

Copy `.env.example` to `.env.local` (and configure the same keys in your Vercel project settings):

```bash
cp .env.example .env.local
```

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL pooled connection string |
| `OURA_CLIENT_ID` | Oura Developer Portal OAuth2 Client ID |
| `OURA_CLIENT_SECRET` | Oura Developer Portal OAuth2 Client Secret |
| `OURA_WEBHOOK_VERIFICATION_TOKEN` | High-entropy random token for Oura webhook verification |
| `API_SECRET` | Bearer secret protecting ingestion, backfill, analytics briefing, and webhook management routes |
| `GEMINI_API_KEY` | Google Gemini API key for diagnostic briefings |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL (`https://bio.henrymilner.uk`) |

---

## 3. Initial Setup & Deployment

### Step 1: Install Dependencies & Push Database Schema

```bash
npm install
npx drizzle-kit push
```

*(Pre-generated SQL migrations are also stored under `./drizzle/` if you prefer `npx drizzle-kit migrate`.)*

### Step 2: Configure Oura Developer Portal OAuth2

1. Open your Oura API application settings in the Oura Developer Portal.
2. Add the exact OAuth2 Redirect URI:
   ```text
   https://bio.henrymilner.uk/api/oura/callback
   ```
3. Ensure your Cloudflare Access policy protects the web UI routes while allowing Oura's servers to reach:
   - `GET /api/oura/callback` (browser redirect from Oura)
   - `GET` and `POST /api/webhooks/oura` (Oura webhook verification and event delivery)
   - API ingestion routes (`/api/ingest/*`, `/api/oura/backfill`, `/api/oura/webhooks/*`, `/api/analytics/briefing`) when authenticated with `Authorization: Bearer <API_SECRET>`.
4. Visit `https://bio.henrymilner.uk/settings` (or `https://bio.henrymilner.uk/api/oura/login`) and click **Connect Oura Ring** to authorise all required scopes (`email personal daily heartrate tag workout session spo2 ring_configuration stress heart_health`).

### Step 3: Register & Renew Real-Time Webhooks

Register `create`, `update`, and `delete` subscriptions across all 16 `ExtApiV2DataType` types via the `/settings` UI button (**Register All 16×3 Webhooks**) or via `curl`:

```bash
curl -X POST https://bio.henrymilner.uk/api/oura/webhooks/setup \
  -H "Authorization: Bearer $API_SECRET"
```

Renew all active subscriptions manually at any time:

```bash
curl -X PUT https://bio.henrymilner.uk/api/oura/webhooks/renew \
  -H "Authorization: Bearer $API_SECRET"
```

`vercel.json` configures a daily Vercel Cron job at `03:00 UTC` calling `/api/oura/webhooks/renew`. If using Vercel Cron `CRON_SECRET`, set `CRON_SECRET` in Vercel or pass `Authorization: Bearer $API_SECRET`.

### Step 4: Trigger the Initial Historical Backfill

Run the resumable CLI backfill locally (defaults to the past 2 years, chunking `heartrate` and `ring_battery_level` in 30-day windows):

```bash
npx tsx scripts/backfill.ts
```

Or specify an explicit date range:

```bash
npx tsx scripts/backfill.ts --start=2024-01-01 --end=2026-11-20
```

Alternatively, trigger via API or the **Pipeline Control** page (`/settings`):

```bash
curl -X POST https://bio.henrymilner.uk/api/oura/backfill \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2024-11-20","endDate":"2026-11-20"}'
```

---

## 4. External Telemetry Ingestion & Analytics API

All management and ingestion endpoints require `Authorization: Bearer $API_SECRET`.

### Medication Dosing (`POST /api/ingest/meds`)

Compatible with iOS Scriptable MedTracker payloads or direct dose arrays:

```bash
curl -X POST https://bio.henrymilner.uk/api/ingest/meds \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-11-20",
    "taken": {
      "elvanse_40": ["2026-11-20T07:30:00Z"],
      "amfexa_10": ["2026-11-20T14:15:00Z"]
    }
  }'
```

### Daily Reminders Task Velocity (`POST /api/ingest/tasks`)

```bash
curl -X POST https://bio.henrymilner.uk/api/ingest/tasks \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "dateKey": "2026-11-20",
    "start": 12,
    "added": 4,
    "completed": 13,
    "moved": 2,
    "remaining": 3
  }'
```

### On-Demand AI Diagnostic Briefing (`POST /api/analytics/briefing`)

```bash
curl -X POST https://bio.henrymilner.uk/api/analytics/briefing \
  -H "Authorization: Bearer $API_SECRET"
```

### Verification Commands

```bash
npx tsc --noEmit
npm run build
```
