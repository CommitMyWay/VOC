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

## Success Metrics (KPIs)

| Capability | KPI |
|-----------|-----|
| Speed | User input → Report in < 2 minutes |
| Insight quality | 100% of reports contain actionable proposals |
| Distribution | 100% of reports support auto-distribution |
| Memory | Agent retains and reuses user preferences across sessions |

---

