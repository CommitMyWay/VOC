# Market Research AI Agent

> An AI-powered market research agent built on [OpenClaw](https://openclaw.ai) that automatically crawls app store reviews, community forums, and video platforms — then synthesizes actionable intelligence for Product and Marketing teams.

## Overview

Manual competitor research burns hours. This agent automates the full pipeline: crawl public reviews → classify and score them with AI → produce structured reports with prioritized action proposals.

**Current focus:** Vietnamese fintech apps — MoMo, Zalopay, VNPay, ShopeePay.

---

## Architecture

```
User Intent (natural language)
        │
        ▼
  OpenClaw Agent
        │
        ├─► Data Acquisition Layer
        │       ├── Google Play reviews
        │       ├── App Store reviews
        │       ├── YouTube comments (YouTube Data API v3)
        │       ├── Reddit threads (Apify actors)
        │       └── Voz / Tinhte (HTML scraping)
        │
        ├─► AI Analysis Pipeline
        │       ├── Classify (Bug / UX / Feature Gap / Sentiment)
        │       ├── Score severity & frequency
        │       └── Generate actionable proposals
        │
        └─► Output
                ├── Structured JSON report
                └── Workspace backup → VNGCloud vStorage S3
```

---

## Data Sources

| Source | Priority | Tool |
|--------|----------|------|
| Google Play reviews | 1 | Direct scrape |
| App Store reviews | 1 | Direct scrape |
| Voz / Tinhte | 2 | Direct scrape  |
| Reddit | 2 | Direct scrape |
| YouTube comments | 3 | Direct scrape |


---

## Target Personas & Use Cases

**Product Owner / PM**
- Discover feature gaps and UX friction in competitor apps
- Prioritize backlog based on real user pain points

**Product Marketing / Growth**
- Capture user language and competitor weaknesses
- Feed intelligence into counter-positioning and ad campaigns

---

## Output Format

The agent produces a structured JSON report per run:

```json
{
  "apps": ["MoMo", "ZaloPay", "VNPay"],
  "goal": "product",
  "reviews": [
    {
      "source": "google_play",
      "subject": "MoMo",
      "rating": 2,
      "content": "...",
      "date": "...",
      "language": "vi",
      "qualified": true,
      "id": "sha256:..."
    }
  ]
}
```

---

## Workspace Backup (vStorage S3)

The agent can export its full workspace to VNGCloud vStorage for persistence across environment resets.

**Required credentials (set as environment variables — do not hardcode):**

```bash
export S3_ACCESS_KEY="your-access-key"
export S3_SECRET_KEY="your-secret-key"
export S3_ENDPOINT="https://hcm04.vstorage.vngcloud.vn"
export S3_BUCKET="your-bucket-name"
export S3_REGION="hcm04"
```

See the [OpenClaw Workspace Export Guide](https://vstorage.console.vngcloud.vn/storage/list) for how to create a vStorage project, bucket, and S3 key pair.

---

## Security

- **Never hardcode credentials** in source files. Use environment variables or a `s3_config.txt` temp file that the agent deletes after use.
- Review data does not contain PII — only public app store content.
- The agent follows OpenClaw's red lines: no private data exfiltration, no destructive commands without confirmation.

---

## Success Metrics (KPIs)

| Capability | KPI |
|-----------|-----|
| Speed | User input → Report in < 2 minutes |
| Insight quality | 100% of reports contain actionable proposals |
| Distribution | 100% of reports support auto-distribution |
| Memory | Agent retains and reuses user preferences across sessions |

---

## Scope

**In scope (current phase):**
- Web-based agent + OpenClaw integration
- Google Play / App Store crawl pipeline
- AI prompt chaining (classify → score → propose)
- Fallback to simulated data when live scraping is blocked

**Out of scope (future phases):**
- Separate web dashboard UI
- Internal SSO integration
- Facebook Groups scraping (anti-scraping barriers)
- Automated suggestion delivery workflows

---

## Built On

- **[OpenClaw](https://openclaw.ai)** — persistent AI agent platform
- **VNGCloud vStorage** — S3-compatible object storage for workspace backup
- **Python** — data acquisition and research scripts
- **YouTube Data API v3** — comment crawling
- **Apify** — Reddit actor for community data
