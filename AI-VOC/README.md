# AI VOC

AI VOC is a market research and voice-of-customer workspace for analyzing app review sentiment, surfacing pain points, and generating product actions for digital wallet and fintech competitors.

The app combines a React frontend with an Express API layer that uses an OpenAI-compatible chat completions API to:

- turn a natural-language query into a research target and competitor set
- synthesize sentiment and review analysis from seed data plus AI-generated fallback reports
- generate custom report blocks and follow-up insights for product, QA, and marketing teams

## Highlights

- Guided analysis flow with confirmation questions before report generation
- Competitor benchmarking across multiple products in one report
- Review-driven insights, sentiment summaries, topic distributions, and trend views
- Custom analysis blocks generated from ad hoc prompts
- Cached server-side responses to reduce repeat generation work
- Printable report experience for sharing findings

## Tech Stack

- React 19
- TypeScript
- Vite
- Express
- OpenAI-compatible chat completions API

## Project Structure

```text
.
├── data/              Seed analysis data for known companies
├── src/               React application
├── server.ts          Express server and Gemini-powered endpoints
├── metadata.json      App metadata
└── .env.example       Environment variable template
```

## Requirements

- Node.js 20+ recommended
- npm 10+ recommended
- An OpenAI-compatible API key, base URL, and model

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Set your OpenAI-compatible LLM config in `.env`:

   ```env
   LLM_API_KEY=your_api_key_here
   LLM_BASE_URL=https://your-provider.example.com/v1
   LLM_MODEL=your-model-name
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the app at [http://localhost:3000](http://localhost:3000)

## Available Scripts

- `npm run dev` starts the Express server with the Vite-powered frontend in development mode
- `npm run build` builds the frontend and bundles the server into `dist/`
- `npm run start` runs the production bundle from `dist/server.cjs`
- `npm run lint` runs TypeScript type-checking
- `npm run clean` removes the `dist/` output

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `LLM_API_KEY` | Yes | API key used for OpenAI-compatible chat completions |
| `LLM_BASE_URL` | Yes | Base URL for the OpenAI-compatible provider |
| `LLM_MODEL` | Yes | Model name or path sent to `/v1/chat/completions` |
| `APP_URL` | No | Host URL for deployed environments that need self-references |

## How It Works

1. A user enters a research prompt such as a target product or comparison request.
2. The server prepares likely targets, competitors, and clarifying questions.
3. The app assembles a multi-company report using either seed data, cached results, or LLM-generated fallback analysis.
4. Users can refine the output with chat follow-ups and generate custom report modules.

## Notes on Data

- The repository includes curated seed data for demo and fallback behavior.
- For products not present in `data/seed.json`, the server generates synthetic analysis using the configured OpenAI-compatible endpoint.
- Generated outputs are cached in `.cache/` during local development.

## Deployment

A production deploy should:

- provide `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` securely through environment variables
- run `npm run build`
- serve the bundled app with `npm run start`
- avoid mounting local SQLite or secret files into the image build context

Notes:

- The container defaults `DATABASE_URL` to `file:/tmp/aivoc.db` so SQLite uses a writable runtime path.
- The server strips wrapping quotes from env vars like `"https://..."` to stay resilient to injected `.env` formatting.

The current server listens on `PORT` and defaults to `8080`, with `GET /health` available for runtime health checks.

## Release Checklist

- Add valid production `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` values
- Run `npm run lint`
- Run `npm run build`
- Verify the main report flow, custom block generation, and print layout
- Confirm seed data and demo copy match the intended release audience

## License

Add your preferred license before public distribution.
