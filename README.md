# AI Calling Agent — free, open-source voice AI

A premium dashboard + a real phone-calling backend you can deploy for **$0** (you only pay Twilio for the
phone minutes). Bring your own keys — nothing is stored anywhere except your own Vercel account.

- 🎙️ **Live voice agent in the browser** — audio-reactive orb, barge-in, tool-calling (book / transfer / take message / hang up)
- 📞 **Real phone calls** — inbound *and* outbound on your Twilio number, running as Vercel serverless functions (no server, no `.bat`)
- 🔌 **One-click "Connect my number"** — the dashboard points your Twilio number at your deployment for you
- 🧠 **Open-source models on Groq** — the free, fastest inference; models are auto-discovered per key, so a retired/unavailable model never breaks calls
- 🛡️ **Safe by default** — every Twilio request is signature-verified, outbound calling needs your `ADMIN_KEY`, secrets never reach the browser
- 🤖 **Self-maintaining** — tests on every push, weekly health + trends report (see below)

## Quick start (auto mode — about 3 minutes)
1. Press **Deploy** on the page (or open
   `https://vercel.com/new/clone?repository-url=https://github.com/musman550/ai-calling-agent-top-free`).
2. Vercel asks for 5 values — all yours:

   | Variable | What to put |
   |---|---|
   | `GROQ_API_KEY` | free key from <https://console.groq.com/keys> |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | from your Twilio console |
   | `TWILIO_PHONE_NUMBER` | your Twilio number, e.g. `+15551234567` |
   | `ADMIN_KEY` | any long random password you invent (protects "Call now" / "Connect") |

3. Open your new site → **Phone Calls** → paste the `ADMIN_KEY` → **Run setup check** → **Connect my Twilio number**.
4. Call your Twilio number. Done.

Optional variables: `BUSINESS_NAME`, `GREETING`, `SYSTEM_PROMPT`, `KNOWLEDGE` (FAQ text the agent answers from),
`LANGUAGE` (e.g. `en-US`, `hi-IN`, `ur-PK`), `VOICE`, `HUMAN_TRANSFER_NUMBER` (enables "talk to a person"),
`CALCOM_WEBHOOK_URL` (bookings/messages are POSTed there; they are always visible in Vercel → Logs too),
`GROQ_LLM_MODEL` (force a model).

> Twilio trial accounts can only call/receive verified numbers. Upgrade the Twilio account to call anyone.

## How the serverless phone agent works (honest version)
Twilio sends each caller sentence to `/api/voice`; the function asks the model, replies with spoken text, and listens
again. That turn-based design is what makes it free and server-less, and it means a reply typically takes **1–3 seconds**.
If you need true streaming audio (lowest latency), download the **Python engine** from the page (`start_real.bat`, Pipecat);
it runs on your own PC or server.

## Add the dashboard to your own website
The page has an *Embed* card with a ready iframe snippet (needs `allow="microphone"`). Works on WordPress, Wix, Webflow, plain HTML.

## Run the tests
```bash
npm i --no-save jsdom
node tests/run.js        # backend + scripts + dashboard in a simulated browser
```

## Automatic maintenance
- **On every push / PR** (`ci.yml`): all tests run. A failing push opens one GitHub issue and closes it when fixed.
- **Every Monday** (`weekly.yml`): re-runs the tests, re-checks every public link, fetches voice-agent trends from GitHub,
  and publishes one **Weekly report** issue. If you add a free `GROQ_API_KEY` repository secret
  (Settings → Secrets and variables → Actions), an open-source model (via Groq) adds improvement suggestions.
- **Dependabot** keeps the GitHub Actions versions current.

The automation **reports and suggests; it never rewrites or deploys code on its own** — you stay in control, and nothing
unreviewed can break your live site. To apply a suggestion or fix a failing test, paste the issue link into a fresh Claude chat.

## License
MIT — free to use, modify and redistribute.

<!-- BRANDING:START -->

---

🌐 Website: [musfiraai.com](https://musfiraai.com/)

* ▶️ YouTube: [Automate With Musfira AI](https://www.youtube.com/@automatewithmusfiraai)
* 💼 LinkedIn: [Musfira AI](https://www.linkedin.com/in/musfira-ai-b3218b39b)
* 📸 Instagram: [@musma_n55](https://instagram.com/musma_n55)

<!-- BRANDING:END -->
