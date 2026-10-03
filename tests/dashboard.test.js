'use strict';
// Dashboard tests in a simulated browser (jsdom). Run: node tests/dashboard.test.js
// CI installs jsdom with `npm i --no-save jsdom`.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let failed = 0, passed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('PASS - ' + name); }
  else { failed++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stubCtx = { clearRect() {}, createRadialGradient: () => ({ addColorStop() {} }), beginPath() {}, arc() {}, fill() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set lineCap(v) {} };
const jres = (status, body, text) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => (text !== undefined ? text : JSON.stringify(body)), blob: async () => new Blob(['x']) });

function makeDom({ url = 'http://localhost:8000/', route = () => null } = {}) {
  const rec = { opened: [], anchors: [], fetches: [], clip: null };
  const dom = new JSDOM(HTML, {
    url, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => stubCtx;
      w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
      w.open = (u) => { rec.opened.push(u); return {}; };
      w.URL.createObjectURL = () => 'blob:x';
      w.HTMLAnchorElement.prototype.click = function () { rec.anchors.push({ href: this.getAttribute('href'), download: this.download }); };
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { rec.clip = t; } } });
      class An { constructor() { this.fftSize = 1024; } getByteTimeDomainData(b) { b.fill(128); } connect() { return this; } }
      class Ctx { constructor() { this.destination = {}; } createAnalyser() { return new An(); } createMediaStreamSource() { return { connect() { return this; } }; } createMediaElementSource(el) { if (el.__s) throw new Error('already sourced'); el.__s = 1; return { connect() { return this; } }; } resume() {} close() {} }
      w.AudioContext = Ctx;
      w.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
      class Rec { constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; this.onstop && this.onstop(); } }
      w.MediaRecorder = Rec;
      class Au { constructor() { this.paused = true; } play() { this.paused = false; setTimeout(() => { if (!this.paused && this.onended) this.onended(); }, 10); return Promise.resolve(); } pause() { this.paused = true; } dispatchEvent(e) { if (e.type === 'ended' && this.onended) this.onended(); } }
      w.Audio = Au;
      w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      w.speechSynthesis = { cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 10); } };
      w.fetch = async (u, o = {}) => {
        rec.fetches.push({ url: String(u), opts: o });
        const custom = route(String(u), o);
        if (custom) return custom;
        const x = String(u);
        if (x.endsWith('/models')) return jres(200, { data: [{ id: 'whisper-large-v3-turbo' }, { id: 'openai/gpt-oss-20b' }, { id: 'qwen/qwen3-32b' }, { id: 'canopylabs/orpheus-v1-english' }] });
        if (x.endsWith('/audio/speech')) return jres(200, {});
        if (x.endsWith('/api/status')) return jres(404, null, 'Not Found');
        return jres(200, { choices: [{ message: { content: 'ok' } }] });
      };
    },
  });
  const w = dom.window, d = w.document;
  return { w, d, rec, $: (s) => d.querySelector(s), ev: (code) => w.eval(code) };
}

(async () => {
  // ================= static checks on the raw HTML =================
  const ids = new Set([...HTML.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]));
  const used = [...new Set([...HTML.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]))];
  const missing = used.filter((i) => !ids.has(i));
  check('every $("#id") used by the script exists in the HTML (missing: ' + missing.join(',') + ')', missing.length === 0);
  const dup = [...HTML.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) !== i);
  check('no duplicate element ids (' + dup.join(',') + ')', dup.length === 0);
  check('exactly one <script> and one <style> block', (HTML.match(/<script/g) || []).length === 1 && (HTML.match(/<style/g) || []).length === 1);
  check('no browser storage is used (session-only promise)', !/localStorage|sessionStorage|indexedDB/.test(HTML));
  check('no secrets hard-coded in the page', !/ghp_|gsk_[A-Za-z0-9]{10}|AC[0-9a-f]{32}/.test(HTML));

  // ================= A. local (file / localhost) =================
  const A = makeDom();
  const { w, $, rec } = A;
  await sleep(150);
  check('workflow canvas shows 6 nodes', A.d.querySelectorAll('#wf .nd').length === 6);
  check('splash is shown at start', !!$('#splash') && !$('#splash').classList.contains('off'));
  check('all sections are on ONE page', A.d.querySelectorAll('section').length === 7 && [...A.d.querySelectorAll('section')].every((x) => w.getComputedStyle(x).display === 'block'));
  check('brand shows Musfira AI', /Musfira AI/.test($('.brand').textContent));
  check('local mode: backend URL defaults to the Python engine', $('#be').value === 'http://localhost:8000');
  check('embed snippet uses a placeholder when not hosted', /YOUR-PROJECT\.vercel\.app/.test($('#embedCode').textContent) && /allow="microphone/.test($('#embedCode').textContent));

  // ---- download gate through REAL clicks ----
  check('download button is clickable (NOT disabled) and shows a lock', $('#dlBtn').disabled === false && /🔒/.test($('#dlBtn').textContent));
  $('#dlBtn').click();
  check('click on locked download opens the subscribe popup', $('#ytModal').classList.contains('on') && rec.anchors.length === 0);
  A.d.querySelector('#ytModal .btn.s').click();
  check('"Maybe later" closes the popup and forgets the pending action', !$('#ytModal').classList.contains('on') && A.ev('S.pending') === null);
  A.d.querySelector('#get .opt:nth-child(2) .btn').click();
  check('"Message us" while locked opens the popup (no mail window yet)', $('#ytModal').classList.contains('on') && rec.anchors.length === 0 && rec.opened.length === 0);
  A.d.querySelector('#ytModal .yt').click();
  check('subscribe opens the REAL channel', rec.opened[0] === 'https://www.youtube.com/@automatewithmusfiraai');
  check('subscribe closes the popup, unlocks, and shows a thank-you', !$('#ytModal').classList.contains('on') && A.ev('S.unlocked') === true && /Unlocked/.test($('#dlHint').textContent) && !/🔒/.test($('#dlBtn').textContent));
  check('pending popup-type action is NOT auto-opened (browsers would block it) and the user is told', rec.anchors.length === 0 && /click the button again/.test($('#alert').textContent));
  A.d.querySelector('#get .opt:nth-child(2) .btn').click();
  const mail = rec.anchors.find((a) => /^mailto:/.test(a.href));
  check('after unlocking, "Message us" opens an email to the real address with a prefilled subject', mail && /^mailto:dramavideo069@gmail\.com\?subject=/.test(mail.href) && /Free%20AI%20Calling%20Agent%20setup/.test(mail.href));
  $('#dlBtn').click();
  const zip = rec.anchors.find((a) => /\.zip$/.test(a.href));
  check('after unlocking, the download button downloads the zip', zip && zip.download === 'ai-calling-agent.zip' && /raw\.githubusercontent\.com\/musman550\/ai-calling-agent-top-free\/main\/ai-calling-agent\.zip$/.test(zip.href));
  A.d.querySelector('#get .opt.hi .btn').click();
  const dep = rec.opened.find((u) => /vercel\.com\/new\/clone/.test(u));
  const dq = dep && new URL(dep).searchParams;
  check('"Deploy to Vercel" opens the one-click clone link for this repo', dq && dq.get('repository-url') === 'https://github.com/musman550/ai-calling-agent-top-free');
  check('deploy link asks for exactly the 5 keys (and nothing sensitive pre-filled)', dq && dq.get('env') === 'GROQ_API_KEY,TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN,TWILIO_PHONE_NUMBER,ADMIN_KEY' && !/=\s*(gsk_|AC)/.test(dep));
  check('find-us links are present and open safely', [...A.d.querySelectorAll('#get a.badge')].length === 5 && [...A.d.querySelectorAll('#get a.badge')].every((a) => /noopener/.test(a.rel)));
  check('LinkedIn/website/instagram links are real', ['musfiraai.com', 'linkedin.com/in/musfira-ai-b3218b39b', 'instagram.com/musma_n55'].every((h) => HTML.includes(h)));

  // gate: subscribing while a DOWNLOAD is pending downloads immediately (not a popup)
  const A2 = makeDom();
  await sleep(100);
  A2.$('#dlBtn').click();
  A2.d.querySelector('#ytModal .yt').click();
  check('subscribe with a pending download starts the download straight away', A2.rec.anchors.some((a) => /\.zip$/.test(a.href)) && A2.rec.opened.length === 1);

  // ---- splash lifecycle + key flow ----
  await sleep(4800);
  check('splash removes itself after the intro', !$('#splash'));
  $('#key').value = 'bad';
  A.w.fetch = async (u) => (String(u).endsWith('/models') ? jres(401, {}, '{"error":"Invalid API Key"}') : jres(200, {}));
  await w.testKey(); await sleep(300);
  check('wrong key -> red alert, red nodes, and focus jumps to the key field', $('#alert').style.display === 'block' && /rejected/.test($('#alert').textContent) && A.d.querySelectorAll('#wf .nd.bad').length === 3 && A.d.activeElement === $('#key'));
  A.w.fetch = async (u) => (String(u).endsWith('/models') ? jres(200, { data: [{ id: 'whisper-large-v3-turbo' }, { id: 'openai/gpt-oss-20b' }, { id: 'qwen/qwen3-32b' }, { id: 'canopylabs/orpheus-v1-english' }] }) : jres(200, {}));
  await w.testKey(); await sleep(300);
  check('correct key -> success banner, green nodes, models auto-selected', A.d.querySelectorAll('#wf .nd.bad').length === 0 && $('#alert').classList.contains('good') && $('#llm').options.length === 2 && $('#llm').value === 'openai/gpt-oss-20b' && $('#voice').value === 'hannah');
  $('#tpl').value = 'sal'; w.tpl();
  check('agent template fills prompt + greeting', /sales rep/.test($('#prompt').value) && /brought them/.test($('#greet').value));

  // ---- n8n export ----
  $('#sid').value = 'ACx'; $('#tok').value = 't'; $('#tnum').value = '+1555'; $('#n8n').value = 'https://n8n.example.com/';
  let blobText = null; w.Blob = class { constructor(p) { blobText = p[0]; } };
  w.dlFlow();
  const wf = JSON.parse(blobText);
  check('n8n workflow export: 8 nodes, valid JSON, 6 connections', wf.nodes.length === 8 && Object.keys(wf.connections).length === 6);

  // ---- orb + full call flow ----
  await w.start(); await sleep(80);
  check('call starts: button shows End call and orb leaves idle', /End call/.test($('#mic').textContent) && ['speaking', 'listening', 'thinking'].includes(A.ev('S.orbMode')));
  w.interrupt(); await sleep(40);
  check('interrupt resets orb amplitude', A.ev('S.orbTarget') === 0);
  w.stop(); await sleep(40);
  check('call ends cleanly and releases the audio graph', /Start call/.test($('#mic').textContent) && A.ev('S.ttsAudio') === null);
  let threw = false; try { await w.start(); await sleep(80); } catch { threw = true; }
  check('a second call starts without a MediaElementSource error', !threw); w.stop();
  w.stage('tools'); check('tools stage -> thinking orb + label', A.ev('S.orbMode') === 'thinking' && /tool/i.test($('#orbLabel').textContent));
  w.stage('tts'); check('tts stage -> speaking orb', A.ev('S.orbMode') === 'speaking');
  w.stage(''); check('empty stage -> idle', A.ev('S.orbMode') === 'idle');
  w.eval("S.msgs=[{role:'user',content:'[x]'},{role:'assistant',content:'Hello'},{role:'user',content:'Hi'}]");
  w.copyTranscript(); await sleep(30);
  check('transcript copy', /Agent: Hello/.test(rec.clip) && /Caller: Hi/.test(rec.clip));

  // ---- phone tab against a SERVERLESS backend (route mock) ----
  const calls = [];
  const sl = makeDom({ route: (u, o) => { calls.push({ u, o }); return null; } });
  await sleep(100);
  sl.w.fetch = async (u, o = {}) => {
    calls.push({ u: String(u), o });
    const hdr = (o.headers || {})['x-admin-key'];
    if (String(u).endsWith('/api/status')) return jres(200, { mode: 'serverless', engine_up: true, groq: true, twilio: true, admin: true });
    if (String(u).includes('/api/status?check=1')) return hdr === 'secret' ? jres(200, { mode: 'serverless', admin: true, human_transfer: false, booking_webhook: true, checks: { groq: { ok: true, chat_model: 'llama-3.3-70b-versatile' }, twilio: { ok: false, error: 'Twilio rejected the SID/token (401)' } } }) : jres(401, { detail: 'Wrong or missing admin key.' });
    if (String(u).endsWith('/api/connect')) return hdr === 'secret' ? jres(200, { ok: true, number: '+15550001111' }) : jres(401, { detail: 'Wrong or missing admin key.' });
    if (String(u).endsWith('/api/call')) { if (!hdr) return jres(401, { detail: 'Wrong or missing admin key.' }); const to = JSON.parse(o.body).to; return to === '+10000000000' ? jres(400, { detail: 'Fill TWILIO_ACCOUNT_SID in Vercel → Settings' }) : jres(200, { ok: true, sid: 'CA1' }); }
    return jres(200, {});
  };
  await sl.w.ping(); await sleep(50);
  check('status line understands the serverless backend', /Vercel backend/.test(sl.$('#engstat').textContent) && /Admin key set/.test(sl.$('#engstat').textContent));
  sl.$('#to').value = '+923001234567';
  await sl.w.dial(); await sleep(400);
  check('Call now without an admin key -> alert sends you to the admin-key field', sl.d.activeElement === sl.$('#adminkey') && /admin key/i.test(sl.$('#alert').textContent));
  sl.$('#adminkey').value = 'secret';
  await sl.w.dial(); await sleep(50);
  const callReq = calls.filter((c) => c.u.endsWith('/api/call')).pop();
  check('Call now sends the admin key header and shows success', callReq.o.headers['x-admin-key'] === 'secret' && /Real call placed/.test(sl.$('#dialres').textContent));
  sl.$('#to').value = '+10000000000';
  await sl.w.dial(); await sleep(400);
  check('backend config error (missing Vercel env) -> alert scrolls to the Phone section', /Vercel/.test(sl.$('#alert').textContent));
  sl.$('#adminkey').value = '';
  await sl.w.connectNumber(); await sleep(400);
  check('Connect without key -> clear error + focus on admin key', /Wrong or missing/.test(sl.$('#connres').textContent) && sl.d.activeElement === sl.$('#adminkey'));
  sl.$('#adminkey').value = 'secret';
  await sl.w.connectNumber(); await sleep(50);
  check('Connect with the key -> shows the connected number', /\+15550001111 now answers/.test(sl.$('#connres').textContent));
  await sl.w.setupCheck(); await sleep(50);
  check('Setup check shows per-service results (Groq ok, Twilio problem explained)', /✅ Groq/.test(sl.$('#connres').textContent) && /❌ Twilio/.test(sl.$('#connres').textContent) && /Twilio rejected/.test(sl.$('#connres').textContent));

  // backend unreachable
  sl.w.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await sl.w.connectNumber(); await sleep(50);
  check('Connect with an unreachable backend -> helpful message, no crash', /Cannot reach the backend/.test(sl.$('#connres').textContent));
  // Python-engine style backend (no /api/connect)
  sl.w.fetch = async () => jres(405, null, 'Method Not Allowed');
  await sl.w.connectNumber(); await sleep(50);
  check('Connect against a backend without /api/connect -> explains instead of failing', /no Connect step/.test(sl.$('#connres').textContent));

  // ================= B. hosted on https (Vercel-like origin) =================
  const B = makeDom({ url: 'https://demo.vercel.app/', route: (u) => (u.endsWith('/api/status') ? jres(200, { mode: 'serverless', engine_up: true, groq: false, twilio: false, admin: false }) : null) });
  await sleep(300);
  check('hosted: backend URL defaults to the site itself', B.$('#be').value === 'https://demo.vercel.app');
  check('hosted: embed snippet points at this site', /src="https:\/\/demo\.vercel\.app\/"/.test(B.$('#embedCode').textContent));
  check('hosted: unconfigured backend is reported honestly (missing keys)', /Twilio missing/.test(B.$('#engstat').textContent) && /Groq missing/.test(B.$('#engstat').textContent) && /Admin key missing/.test(B.$('#engstat').textContent));
  B.$('#to').value = '+923001234567'; B.$('#adminkey').value = 'k';
  B.w.fetch = async (u, o) => { B.rec.fetches.push({ url: String(u), opts: o }); return jres(200, { ok: true }); };
  await B.w.dial(); await sleep(50);
  check('hosted: outbound call goes to the same origin /api/call', B.rec.fetches.some((f) => f.url === 'https://demo.vercel.app/api/call'));
  B.w.copyEmbed(); await sleep(30);
  check('copy embed code puts the iframe on the clipboard', /<iframe src="https:\/\/demo\.vercel\.app\/"/.test(B.rec.clip));

  // C. hosted on a static host without a backend (e.g. GitHub Pages)
  const C = makeDom({ url: 'https://someone.github.io/ai-calling-agent-top-free/' });
  await sleep(300);
  check('static host: tells the user to deploy their own copy', /no backend on this site yet/.test(C.$('#engstat').textContent));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
