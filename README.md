# AI Calling Agent — Live Preview

A single-page, premium AI voice-agent dashboard: audio-reactive orb, live browser calling
(Groq STT+LLM+TTS, BYOK), an n8n workflow exporter for real phone numbers (Twilio), tool-calling
(book/transfer/message/end call), and self-diagnosing Auto-Heal. Nothing is stored — every key
and setting lives only in the browser tab and is wiped on refresh.

## Deploy on Vercel (1 minute)
1. https://vercel.com/new → **Import Git Repository** → pick `ai-calling-agent-top-free`
   (you'll be asked to install the Vercel GitHub App and grant it access to this repo — that
   authorization happens directly between you and Vercel, nothing here needs your Vercel login).
2. Framework preset: **Other**. No build command, no output directory needed — click **Deploy**.
3. Done — you get a `https://<project>.vercel.app` link. Add it to your agency site as an iframe
   or a direct link.

## Run it locally instead
Just open `index.html` in a browser. For microphone access to work reliably, serve it instead of
opening as a `file://` path, e.g. `python -m http.server 8080`.

## What this preview does / does not do
- **Does:** real browser-based calls (your own Groq key, free tier), tool-calling, an n8n workflow
  file you can import for real phone numbers via Twilio, live diagnostics.
- **Does not:** run a persistent backend (Vercel is serverless — a phone line needs an always-on
  process). For that, use the `start_real.bat` engine from the main project, and point this
  preview's "Phone Calls" tab at that engine's URL.

## CI
`.github/workflows/ci.yml` runs on every push: validates the page's JavaScript has no syntax
errors, and auto-formats the file with Prettier, committing the formatted version back if it
was not already formatted. This catches and fixes *style* issues automatically; it flags (rather
than guesses a fix for) real logic errors, in a **Check page** job you can see in the Actions tab.
