# AI Calling Agent — Free, Open-Source Voice AI

A single-page, premium AI voice-agent dashboard: audio-reactive orb, live browser calling
(Groq STT+LLM+TTS, BYOK), an n8n workflow exporter for real phone numbers (Twilio), tool-calling
(book/transfer/message/end call), and self-diagnosing Auto-Heal. Nothing is stored — every key
and setting lives only in the browser tab and is wiped on refresh.

**Try it live:** open `index.html` in a browser, or deploy your own copy (below).
**Get the full project:** the page itself has a "⬇ Get the Full Project" tab with a free download
of everything, including the real-time phone-call backend (`start_real.bat` + Python).

## Deploy your own copy on Vercel (1 minute)
1. https://vercel.com/new → **Import Git Repository** → pick this repo
   (Vercel will ask to install its GitHub App and access this repo — that authorization happens
   directly between you and Vercel; nothing here needs your Vercel login).
2. Framework preset: **Other**. No build command, no output directory needed → **Deploy**.

## Or deploy on GitHub Pages
Settings → Pages → Source: `main` branch, `/ (root)` → Save. You'll get a
`https://<user>.github.io/<repo>/` link.

## Run it locally
Just open `index.html` in a browser. For microphone access to work reliably, serve it instead of
opening as a `file://` path, e.g. `python -m http.server 8080`.

## What this preview does / does not do
- **Does:** real browser-based calls (your own Groq key, free tier), tool-calling, an n8n workflow
  file for real phone numbers via Twilio, live diagnostics, a free full-project download.
- **Does not:** run a persistent backend from Vercel/GitHub Pages (both are static/serverless —
  a phone line needs an always-on process). For that, download the full project and run
  `start_real.bat` (Windows) yourself, or self-host it.

## License
MIT — free to use, modify, and redistribute.

## CI
`.github/workflows/ci.yml` runs on every push: validates the page's JavaScript has no syntax
errors (and auto-opens a GitHub Issue if it does), and auto-formats the file with Prettier,
committing the formatted version back if it wasn't already formatted.
