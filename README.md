<div align="center">

# 🧬 EvoScout

**"The Blueprint for Synthetic Biology" — an automated 24-hour intelligence dashboard for grants, literature, careers, and AI-generated deep-dive podcasts.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Storage-orange?logo=firebase)](https://firebase.google.com)
[![Python](https://img.shields.io/badge/Python-3.10-blue?logo=python)](https://python.org)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088ff?logo=github-actions)](https://github.com/features/actions)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)](https://vercel.com)

---

*EvoScout automatically aggregates daily research news, academic literature, and grant opportunities — then synthesises everything into a personalised AI-hosted podcast, so you never miss a breakthrough.*

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Core Features](#-core-features)
- [System Architecture](#-system-architecture)
- [Dashboard Feeds](#-dashboard-feeds)
- [Historical Ledger](#-historical-ledger)
- [AI Podcast Engine](#-ai-podcast-engine)
- [TTS Dual-Engine Architecture](#-tts-dual-engine-architecture)
- [User Settings](#-user-settings)
- [Automation Pipeline](#-automation-pipeline)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)

---

## 🧭 Overview

EvoScout is a full-stack research intelligence dashboard that runs an automated daily pipeline to surface the most relevant developments in evolutionary biology, genetics, and life sciences. It is built for researchers, graduate students, and professionals who want a high-signal feed personalised to their interests — without the noise.

Every morning, a GitHub Actions workflow:
1. **Scrapes** and aggregates today's most relevant scientific content across multiple sources
2. **Synthesises** a conversational podcast script using the Gemini AI API
3. **Generates** broadcast-quality audio using a dual TTS engine (Kokoro ONNX or Fish Audio S2-Pro)
4. **Uploads** the finished podcast to Firebase Storage and links it to each user's dashboard

---

## 🎨 UI & Design

EvoScout is styled as a **premium editorial newspaper** — think _The New York Times_ crossed with a research journal, rendered in a high-contrast monochromatic palette.

| Element | Detail |
|---|---|
| **Typography** | `Playfair Display` (serif, headlines) + `Inter` (sans-serif, body) via `next/font/google` |
| **Colour palette** | editorial-paper (warm off-white), editorial-text (near-black), editorial-muted (mid-grey), editorial-border |
| **Layout** | Max-width 7xl content column, sticky masthead header, shadow-bordered main card |
| **Navigation** | Sticky top bar with `Dashboard` dropdown, `Ledger`, `Settings`, and authenticated `UserMenu` |
| **Iconography** | Lucide React icon set throughout |

The masthead displays the live date (`CurrentDate` component) and the edition subtitle `Synthetic Biology Edition` across the top, with the wordmark `The EvoScout` centred in large italic Playfair Display below it.

---

## ✨ Core Features

| Feature | Description |
|---|---|
| 🗞️ **Daily News Feed** | Curated biology & life-science headlines from Nature, Science, Phys.org & Cell Press |
| 📄 **Literature Feed** | Latest bioRxiv preprints filtered by topic, deduplicated by DOI, enriched with AI summaries |
| 💰 **Grants Feed** | Active funding from NSF, NIH RePORTER & Grants.gov with an expanding time-window fallback |
| 💼 **Careers Portal** | 18 curated evergreen career pages from top research institutions, shuffled daily |
| 🏛️ **This Day in History** | AI-generated science milestones contextualised to today's news headlines |
| 📚 **Historical Ledger** | Full archive of every past daily edition, stored in Firestore and browseable at `/history` |
| 🎙️ **AI Podcast** | A personalised daily deep-dive podcast hosted by AI characters Al & Matt |
| ⚙️ **User Settings** | Per-user TTS engine, per-feed quotas, topic keyword overrides, and institution filters |
| 🔐 **Auth & Multi-User** | Firebase Authentication with fully isolated per-user Firestore data |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                           │
│   Runs daily at 08:00 UTC (04:00 EDT)                           │
│                                                                 │
│  1. POST /api/aggregate  ──►  Next.js API (Vercel)             │
│                               └─► Scrapes RSS / BioRxiv /      │
│                                   PubMed / Grant portals        │
│                               └─► Writes to Firestore /users    │
│                                   /{uid}/daily/feed             │
│                                                                 │
│  2. python backend_worker/main.py                               │
│       ├─ Reads Firestore feeds for each user                    │
│       ├─ Calls Gemini API → generates podcast script            │
│       ├─ Synthesises audio (Kokoro ONNX OR Fish S2-Pro)         │
│       ├─ Merges segments with pydub → 192kbps MP3               │
│       └─ Uploads to Firebase Storage → writes signed URL        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
  ┌───────────────┐                  ┌──────────────────┐
  │   Firestore   │                  │ Firebase Storage  │
  │  (per-user    │                  │   podcasts/       │
  │   daily feed) │                  │   {uid}/{date}    │
  └───────────────┘                  └──────────────────┘
          │
          ▼
  ┌───────────────────────────────────────────────┐
  │          Next.js Frontend (Vercel)            │
  │                                               │
  │  Nav: Dashboard | Ledger | Settings | 👤      │
  │  ┌────────────┐  ┌──────────┐  ┌──────────┐  │
  │  │  News/Lit  │  │  Ledger  │  │ Podcast  │  │
  │  │  Grants    │  │ /history │  │  Player  │  │
  │  │  Careers   │  │          │  │          │  │
  │  └────────────┘  └──────────┘  └──────────┘  │
  └───────────────────────────────────────────────┘
```

---

## 📡 Dashboard Feeds

The dashboard aggregates content from multiple sources into five distinct tabs, all driven by a single `POST /api/aggregate` call:

### 🗞️ News

Pulls from four live RSS streams, filtered to a rolling **48-hour window** (expanded to 72 hours on Sundays when wire services are quiet):

| Source | Feed |
|---|---|
| **Nature** | `nature.com/nature.rss` |
| **Science Mag** | `science.org/rss/news_current.xml` |
| **Phys.org** | `phys.org/rss-feed/biology-news/` |
| **Cell Press** | `cell.com/cell/inpress.rss` |

Only articles matching a configurable biological keyword regex (CRISPR, RNA, gene, cancer, proteomics, etc.) are kept. Each article is enriched with a cover image — sourced from the RSS feed's enclosure, or fetched on-demand from the **Pexels API** using the article's most prominent scientific keyword as the search query. Duplicate images across the entire dashboard are prevented via a global de-duplication set.

All news items receive a **2–3 sentence AI summary** generated by Gemini (batched in groups of 20).

### 📄 Literature

Surfaces the latest preprints from **bioRxiv** via the official API, with two layers of resilience:
- **UTC rollover guard** — if bioRxiv returns HTML (i.e. the UTC date hasn't started in the US yet), the query automatically retries with the previous day's date
- **Keyword filter** — papers are filtered by topic (CRISPR, gene editing, oncology, epigenetics, etc.); if fewer than 5 match, the full day's corpus is returned as a fallback

Results are deduplicated by DOI, sorted chronologically, and enriched with **Gemini AI summaries**.

### 💰 Grants

Three independent grant APIs are queried in parallel:

| Source | Method | Window |
|---|---|---|
| **NSF Awards API** | Keyword search, `award.json` | Last 30 days |
| **NIH RePORTER API** | Advanced text search, `v2/projects/search` | Last 30 days |
| **Grants.gov** | Keyword search, `opportunities/search` | 48h → 7d → 14d expanding window |

The Grants.gov query uses an **expanding time window** — it starts at 48 hours and progressively widens to 7 days then 14 days until at least one `posted` result is found, guaranteeing a non-empty grants feed even during low-activity periods.

### 💼 Careers

Rather than scraping individual job postings (which break frequently), EvoScout maintains a curated list of **18 evergreen career portal pages** from top research institutions — pages that always show live openings:

> Broad Institute · HHMI/Janelia · Wyss Institute · Ginkgo Bioworks · Dana-Farber · NIH · Cold Spring Harbor · Nature Careers · Science Careers · Scripps Research · Salk Institute · Jackson Laboratory · Rockefeller University · Stowers Institute · MD Anderson · Fred Hutch · Whitehead Institute · Allen Institute

Portals are shuffled on every aggregation so users see different institutions each day. Users can also filter to specific institutions via the Settings page.

### 🏛️ This Day in History

The history feature has **two independent generation paths**:

**1. Embedded in the aggregation pipeline** (`/api/aggregate`)
Runs as the final step after all summaries are written, with a 2-second cooldown to protect the Gemini free-tier rate limit window. Uses the day's news headlines as thematic context and writes results directly into the user's daily feed document in Firestore.

**2. Standalone on-demand endpoint** (`/api/onthisday`)
A separately callable `POST` endpoint used by the `/history` page for real-time generation. Features:
- **Exponential backoff retry** — on HTTP 429, waits `5s × 2^attempt` before retrying (up to 3 attempts)
- **Curated hardcoded fallback** — if all retries fail, returns 4 hand-written milestone events so the UI is never empty
- `force-dynamic` — always skips Vercel edge caching to ensure fresh results

**Prompt rules (both paths):**
- Uses today's news headlines as thematic context
- Returns 4–6 milestones spanning different decades (1800s–2020s)
- Explicitly avoids overused events (Watson & Crick, Dolly, Human Genome Project)
- Requires the year embedded in every fact to prevent hallucination
- Results sorted chronologically and linked to Wikipedia

---

## 📚 Historical Ledger

Accessible at `/history`, this page renders a **full reverse-chronological archive** of every daily edition that has been aggregated for the authenticated user. Each archived edition is stored as a document in the `users/{uid}/ledger` Firestore sub-collection and displays:

- **Edition date** and total item count
- **Funding** — grant titles, agencies, and award amounts
- **Literature & Pre-Prints** — paper titles, authors, and journal, linked via DOI
- **Positions & News** — career portal names and headline news items

The ledger serves a dual purpose: it is both a browseable personal research archive and an index that the **Novelty Constraint engine** uses internally to detect and suppress duplicate content across daily editions. The page uses a Firestore `onSnapshot` real-time listener, so newly archived editions appear instantly without a page refresh.

---

## 🎙️ AI Podcast Engine

The podcast is the centrepiece of EvoScout. After each daily aggregation, a conversational script is generated by Gemini and then synthesised into broadcast-quality audio.

### Script Generation

- Powered by **Google Gemini** (`gemini-2.0-flash` primary, with automatic fallback to `gemini-2.5-flash` and `gemini-2.5-flash-lite` on rate-limit errors)
- Multi-part generation for longer episodes: each segment is generated independently using context from the previous part's closing lines, enabling coherent long-form content without hitting token limits
- The script features two hosts — **Al** and **Matt** — who banter naturally, analyse the science, and use TTS emotion tags (`[excited]`, `[laughing]`, `[thoughtful]`, `[serious]`, etc.) for expressive delivery
- A bulletproof regex fallback parser ensures that even malformed JSON from the model is recovered gracefully

### Podcast Tiers

| User Type | Duration |
|---|---|
| Standard users | 5 minutes |
| Admin / credentialed users | 8 minutes |

### Deduplication

The pipeline checks each user's existing `podcastUrl` before generating. If a valid, signed URL for today's date is already stored in Firestore, generation is skipped — preventing redundant compute on re-runs.

---

## 🔊 TTS Dual-Engine Architecture

EvoScout supports two text-to-speech backends. Users can select their preferred engine in the **Settings** tab.

### 🟢 Kokoro ONNX (Default)
- **Model**: `kokoro-v1.0.onnx` + `voices-v1.0.bin` (downloaded via GitHub Actions cache)
- **Runtime**: Runs locally on the GitHub Actions runner — no external API calls, no rate limits, completely free and unlimited
- **Voices**: `am_michael` for Al, `am_adam` for Matt — high-quality English broadcast presets
- **Strengths**: Fast cold-start, zero cost, runs offline

### 🔵 Fish Audio S2-Pro (Premium)

- **Model**: `fishaudio/s2-pro` — downloaded from HuggingFace Hub at container build time and baked into the Modal image
- **GPU**: NVIDIA A10G via Modal, with a 5-minute scaledown window and 600-second request timeout
- **Runtime**: Deployed as a `@modal.asgi_app()` FastAPI endpoint in `modal_fish_tts.py`
- **Voices**: Zero-shot voice clones of Al and Matt from MP3 reference files in `backend_worker/voices/`, base64-encoded and sent with each synthesis request
- **Cold-boot**: ~60s on first request while the A10G container warms; subsequent requests within the scaledown window are fast
- **Strengths**: Extremely natural prosody, emotion-aware delivery, voice cloning fidelity

#### API Contract

```
POST /synthesize
Content-Type: application/json

{
  "text": "The dialogue line to synthesize",
  "ref_audio_b64": "<base64-encoded MP3 of the target voice>",
  "ref_text": "Transcript of the reference audio"
}

→ 200 audio/wav  (raw WAV bytes, concatenated from all inference chunks)

GET /health → {"status": "ok", "model": "s2-pro"}
```

#### Runtime Patches

The Modal container applies three patches at startup to work around upstream fish-speech incompatibilities:

| Patch | Problem | Fix |
|---|---|---|
| **PATCH 1** | `torchaudio` 2.3+ defaults to the `torchcodec` backend, which is unavailable on many Modal images | Forces `torchaudio.load` to always use the `soundfile` backend |
| **PATCH 2** | Newer fish-speech HEAD calls `visualize()` on the tokenizer queue worker, but `tokenizer=None` in that context raises `AttributeError` and crashes synthesis | Dynamically no-ops `visualize()` on all affected classes via `inspect` |
| **PATCH 3** | `engine.inference()` yields `InferenceResult` dataclasses in newer builds rather than raw bytes | Introspects the result object, handles `bytes`, `(sr, waveform)` tuples, torch tensors, and numpy arrays uniformly |

#### Deploying Fish Audio S2-Pro on Modal

```bash
# Install Modal CLI
pip install modal

# Authenticate
modal token new

# Deploy the endpoint (builds image, downloads S2-Pro weights, exposes HTTPS URL)
modal deploy backend_worker/modal_fish_tts.py

# Copy the printed URL → add as MODAL_APP_URL in GitHub Secrets
```

> **Note:** The first deploy downloads ~4 GB of model weights. Subsequent deploys use the cached Modal image layer and are much faster.

#### Alternative: Lightning AI GPU Studio

For a self-hosted GPU alternative (useful for testing or when Modal compute quota is exhausted), see [`backend_worker/lightning_setup.md`](backend_worker/lightning_setup.md). The setup clones the fish-speech repo onto a Lightning AI A10G/L4 GPU studio, runs the Fish Speech API server on port 8080, and exposes it via Lightning's built-in port tunnelling. The public URL and API key are then passed to the worker via `FISH_AUDIO_API_URL` and `FISH_AUDIO_API_KEY` secrets.

### Audio Assembly
Regardless of engine, all per-line WAV segments are stitched together by `pydub` with 300ms silence gaps between lines, then exported as a **192 kbps MP3** and uploaded to Firebase Storage with a **7-day signed URL**.

---

## ⚙️ User Settings

All settings are stored per-user in Firestore at `users/{uid}/settings/config` and take effect on the next aggregation run.

### Aggregation Quotas
Slider controls (range 1–50) cap the maximum number of items injected into each feed section per run:
- **Science News Quota** — max news articles loaded (default: 12)
- **Pre-Print Literature Quota** — max bioRxiv papers loaded (default: 12)
- **Grant Retrieval Quota** — max grant records loaded (default: 12)

The live **Daily Extraction Payload** counter shows the combined total across all three quotas.

### Algorithmic Routing Parameters
Comma-separated keyword overrides for each data source — leave blank to use the built-in defaults:

| Field | Controls | Example |
|---|---|---|
| NSF / NIH Grants | Grant keyword for NSF & NIH search | `genomics, pathology` |
| GovGrants Open Pipeline | Grants.gov keyword | `molecular biology` |
| Global Web News | RSS biological filter regex | `CRISPR, Cas9, RNA` |
| Pre-Print Literature | bioRxiv topic filter | `synthetic biology, oncology` |
| Career Targets (Institutions) | Which portal institutions to show | `NIH, Broad Institute` |
| Career Targets (Job Titles) | Future title-level filtering | `Lab Tech, Postdoc` |

### AI Voice Engine
Selects the TTS backend for the daily podcast:
- **Kokoro TTS** *(default)* — Free, unlimited, local ONNX; voices `am_michael` (Al) and `am_adam` (Matt)
- **Fish Speech S2-Pro** — Zero-shot voice cloning from custom reference MP3s; subject to Modal cold-boot and API rate limits

---

## ⚙️ Automation Pipeline

The entire pipeline is orchestrated by a GitHub Actions workflow (`.github/workflows/podcast_worker.yml`) that runs automatically at **08:00 UTC** daily.

```yaml
# Simplified workflow steps:
1. Trigger aggregation   → POST /api/aggregate on Vercel
2. Setup Python 3.10     → with pip cache
3. Install ffmpeg & espeak-ng (system audio dependencies)
4. Install Python deps   → backend_worker/requirements.txt
5. Cache Kokoro models   → keyed on kokoro-models-v1.0
6. Download Kokoro ONNX  → only if cache miss
7. Run podcast worker    → python backend_worker/main.py
```

The workflow can also be triggered manually via the **Actions** tab (`workflow_dispatch`) or via a `repository_dispatch` event from any external system.

**Secrets required in GitHub repository settings:**

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON service account key for Firestore + Storage access |
| `GEMINI_API_KEY` | Google Gemini API key for script generation |
| `HF_TOKEN` | Hugging Face token (Fish Audio fallback) |
| `MODAL_APP_URL` | Base URL of the deployed Modal Fish TTS FastAPI app |

---

## 🛠️ Tech Stack

**Frontend**
- [Next.js 16](https://nextjs.org) (App Router)
- [React 19](https://reactjs.org) with TypeScript 5
- [Tailwind CSS 4](https://tailwindcss.com)
- [Lucide React](https://lucide.dev) for icons
- [Firebase JS SDK 12](https://firebase.google.com/docs/web/setup) for auth and Firestore

**Backend / API Routes**
- Next.js API routes (`/api/aggregate`, `/api/onthisday`, etc.) deployed on Vercel
- [rss-parser](https://github.com/rbren/rss-parser) for RSS ingestion
- Firebase Admin SDK for server-side Firestore writes

**Podcast Worker (Python)**
- [firebase-admin](https://firebase.google.com/docs/admin/setup) for Firestore + Storage
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) for local neural TTS
- [pydub](https://github.com/jiaaro/pydub) + ffmpeg for audio assembly
- [soundfile](https://pysoundfile.readthedocs.io) for WAV writing
- Google Gemini REST API for script generation
- [Modal](https://modal.com) for serverless Fish Audio S2-Pro deployment

**Infrastructure**
- [Firebase Firestore](https://firebase.google.com/docs/firestore) — per-user feed storage
- [Firebase Storage](https://firebase.google.com/docs/storage) — podcast MP3 hosting
- [Firebase Authentication](https://firebase.google.com/docs/auth) — multi-user auth
- [Vercel](https://vercel.com) — frontend + API route hosting
- [GitHub Actions](https://github.com/features/actions) — daily automation

---

## 📁 Project Structure

```
evoscout-main/
├── .github/
│   └── workflows/
│       └── podcast_worker.yml      # Daily aggregation + podcast CI/CD
├── backend_worker/
│   ├── main.py                     # Podcast generation pipeline (Python)
│   ├── modal_fish_tts.py           # Fish Audio S2-Pro Modal deployment
│   ├── requirements.txt            # Python dependencies
│   └── voices/                     # Voice reference audio for Fish TTS cloning
│       ├── Al.mp3 / al.txt
│       └── Matt.mp3 / matt.txt
├── src/
│   ├── app/
│   │   ├── page.tsx                # Main dashboard (News / Lit / Grants / History tabs)
│   │   ├── layout.tsx              # Root layout with auth provider
│   │   ├── providers.tsx           # Firebase auth context provider
│   │   ├── UserMenu.tsx            # User avatar / sign-out dropdown
│   │   ├── DashboardDropdown.tsx   # Feed section navigation
│   │   ├── CurrentDate.tsx         # Live date display component
│   │   ├── history/
│   │   │   └── page.tsx            # Historical Ledger — full archive of past daily editions
│   │   ├── settings/
│   │   │   └── page.tsx            # User settings (TTS engine, quotas, topic keywords)
│   │   └── api/
│   │       ├── aggregate/          # Master scrape + Gemini summary + history pipeline
│   │       └── onthisday/          # Standalone history endpoint (exponential backoff + fallback)
│   └── lib/
│       └── firebase.ts             # Firebase client SDK initialisation
├── functions/                      # Firebase Cloud Functions (if applicable)
├── firebase.json                   # Firebase hosting / functions config
├── next.config.ts
├── tailwind.config (via postcss)
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Firebase project with Firestore, Storage, and Authentication enabled
- A Google Gemini API key

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd evoscout-main

# Install dependencies
npm install

# Set up environment variables (see below)
cp .env.example .env.local

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running the Podcast Worker Locally

```bash
cd backend_worker

# Install dependencies
pip install -r requirements.txt

# Export required secrets
export FIREBASE_SERVICE_ACCOUNT='{ ... your service account JSON ... }'
export GEMINI_API_KEY='your-gemini-api-key'

# Run
python main.py
```

---

## 🔑 Environment Variables

Create a `.env.local` file in the project root:

```env
# Firebase Client (public — safe to expose in frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Server-side only (used in API routes)
GEMINI_API_KEY=
FIREBASE_SERVICE_ACCOUNT=   # Full JSON of your service account key
GITHUB_TOKEN=               # GitHub PAT — used by /api/aggregate to dispatch the podcast workflow
```

For **GitHub Actions**, add the following repository secrets under `Settings → Secrets and variables → Actions`:

- `FIREBASE_SERVICE_ACCOUNT`
- `GEMINI_API_KEY`
- `HF_TOKEN`
- `MODAL_APP_URL`

For **Vercel**, add these as Environment Variables in your project dashboard:

- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT`
- `GITHUB_TOKEN`

---

## 🌐 Deployment

EvoScout is deployed on **Vercel** (frontend + API routes) with **Firebase** as the data and auth backend.

```bash
# Build for production
npm run build

# Or deploy directly via the Vercel CLI
vercel --prod
```

The daily automation runs independently via **GitHub Actions** and does not require the Vercel deployment to be manually triggered.

---

<div align="center">

Built with ❤️ for the research community.

</div>
