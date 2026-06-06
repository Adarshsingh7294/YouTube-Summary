# Setup Guide

A walkthrough for getting the YouTube Summary Generator running locally.

## 1. Prerequisites

- **Node.js 18.18+** (Node 20 LTS recommended)
- **npm** (or pnpm / yarn / bun)
- An **OpenAI API key** (or any OpenAI-compatible provider)

## 2. Install dependencies

```bash
cd youtube-summary-generator
npm install
```

If you hit peer-dependency warnings around React 19, you can pin React 18
instead — see "Troubleshooting" below.

## 3. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### Using a different provider

The OpenAI Node SDK is used as a generic HTTP client. Set `OPENAI_BASE_URL`
to point at any compatible endpoint. The app will send standard
`/chat/completions` requests, so anything that speaks that protocol works.

#### Groq (fast, generous free tier)

```env
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.1-70b-versatile
```

#### OpenRouter

```env
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=meta-llama/llama-3.1-8b-instruct:free
```

#### Local Ollama

```env
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama3.1
```

## 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste a YouTube URL.

## 5. Build for production

```bash
npm run build
npm run start
```

## Troubleshooting

### "Could not retrieve a transcript"

The video is private, region-restricted, age-restricted, or has no
captions. Try a different public video to confirm the rest of the pipeline
works.

### React 19 peer warnings

Next.js 15 ships with React 19 RC. If you'd rather stay on React 18:

```json
"react": "^18.3.1",
"react-dom": "^18.3.1",
"@types/react": "^18.3.12",
"@types/react-dom": "^18.3.1"
```

Then `rm -rf node_modules && npm install`.

### "Missing OPENAI_API_KEY"

Make sure `.env.local` exists in the project root (not just `.env.example`)
and that you restarted `npm run dev` after creating it. Next.js only reads
`.env.local` on startup.

### PDF download is blank

jsPDF runs in the browser. Make sure pop-ups/downloads aren't blocked for
`localhost:3000`. Some embedded browsers (e.g. inside iframes) will silently
refuse to trigger downloads.

### Build fails with "Module not found: Can't resolve 'youtube-transcript-plus'"

`npm install` did not finish. Re-run it. If you have an offline cache,
clear it: `npm cache clean --force`.

## Next steps

- Deploy to Vercel: see the **Deployment (Vercel)** section in `README.md`.
- Swap the model: change `OPENAI_MODEL` to any chat-completions model.
- Add a custom prompt: edit `lib/summarize.ts` (look for the `PROMPTS` map).
