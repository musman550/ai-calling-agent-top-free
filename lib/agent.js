'use strict';
const groq = require('./groq');
const { validE164 } = require('./twilio');

const DEFAULT_PROMPT =
  'You are the phone receptionist for {{BUSINESS}}. Be warm and brief. Help with hours, services and bookings. ' +
  'For a booking, collect name, phone and preferred time, confirm them aloud, then call book_appointment. ' +
  'If the caller asks for a human, call transfer_to_human. If you cannot help, offer take_message. ' +
  'Never invent prices, hours or policies you were not given. When the caller is done, say goodbye and call end_call.';

function systemPrompt(env) {
  const biz = env.BUSINESS_NAME || 'our business';
  let p = (env.SYSTEM_PROMPT || DEFAULT_PROMPT).replace(/\{\{BUSINESS\}\}/g, biz);
  if (env.KNOWLEDGE) p += '\n\nKNOWLEDGE BASE (answer from this):\n' + env.KNOWLEDGE;
  p += '\n\nThis is a live PHONE call: reply in 1-2 short spoken sentences. No markdown, lists, emojis or URLs.';
  return p;
}

const str = { type: 'string' };
const fn = (name, description, properties, required) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});
const TOOLS = [
  fn('book_appointment', 'Book an appointment after confirming the details aloud', { name: str, phone: str, preferred_time: str, reason: str }, ['name', 'phone', 'preferred_time']),
  fn('transfer_to_human', 'Transfer the call to a human when asked, or when the caller is upset', { reason: str }, ['reason']),
  fn('take_message', 'Take a message for the business', { name: str, phone: str, message: str }, ['name', 'message']),
  fn('end_call', 'End the call after saying goodbye', {}, []),
];

// ---- conversation state travels inside the signed webhook URL (no database needed) ----
function encodeState(hist) {
  let h = hist.slice(-10).map(([r, t]) => [r, String(t).slice(0, 280)]);
  let s = Buffer.from(JSON.stringify(h)).toString('base64url');
  while (s.length > 2200 && h.length > 2) {
    h = h.slice(1);
    s = Buffer.from(JSON.stringify(h)).toString('base64url');
  }
  return s;
}
function decodeState(s) {
  try {
    const a = JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8'));
    if (!Array.isArray(a)) return [];
    return a.filter((x) => Array.isArray(x) && (x[0] === 'u' || x[0] === 'a') && typeof x[1] === 'string').slice(-10);
  } catch {
    return [];
  }
}

async function notify(env, kind, args, fetchImpl) {
  const record = { event: kind, ...args, business: env.BUSINESS_NAME || '', at: new Date().toISOString() };
  console.log(JSON.stringify(record)); // always visible in Vercel → Logs, even with no webhook
  const url = env.CALCOM_WEBHOOK_URL;
  if (!url) return { status: 'saved', note: 'recorded in the business log' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record), signal: ctl.signal });
    return r.ok ? { status: 'booked' } : { status: 'saved', note: 'calendar sync pending' };
  } catch {
    return { status: 'saved', note: 'calendar sync pending' };
  } finally {
    clearTimeout(timer);
  }
}

async function runTool(name, args, env, flags, fetchImpl) {
  try {
    if (name === 'book_appointment') return await notify(env, 'booking', args, fetchImpl);
    if (name === 'take_message') return await notify(env, 'message', args, fetchImpl);
    if (name === 'transfer_to_human') {
      if (validE164(env.HUMAN_TRANSFER_NUMBER || '')) { flags.transfer = true; return { status: 'ok' }; }
      return { status: 'unavailable', note: 'no human line is set up; offer to take a message instead' };
    }
    if (name === 'end_call') { flags.end = true; return { status: 'ok' }; }
    return { status: 'error', note: 'unknown tool' };
  } catch {
    return { status: 'error', note: 'that action failed; apologise briefly' };
  }
}

// One dialogue turn. Returns { text, end, transfer }. Throws if Groq is unusable (error.status set).
async function runTurn({ env, history, userText, fetchImpl = fetch }) {
  const messages = [{ role: 'system', content: systemPrompt(env) }];
  for (const [r, t] of history) messages.push({ role: r === 'u' ? 'user' : 'assistant', content: t });
  messages.push({ role: 'user', content: userText });

  const flags = { end: false, transfer: false };
  let text = '';
  for (let i = 0; i < 3; i++) {
    const { message } = await groq.complete({ key: env.GROQ_API_KEY, messages, tools: TOOLS, modelOverride: env.GROQ_LLM_MODEL, fetchImpl });
    const calls = message.tool_calls || [];
    const said = (message.content || '').trim();
    if (!calls.length) { text = said || text; break; }
    if (said) text = said;
    messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse((c.function && c.function.arguments) || '{}'); } catch { /* keep {} */ }
      const result = await runTool(c.function && c.function.name, args, env, flags, fetchImpl);
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  if (!text) {
    text = flags.end ? 'Thank you for calling. Goodbye!' : flags.transfer ? 'Connecting you now.' : 'Sorry, could you say that again?';
  }
  return { text, end: flags.end, transfer: flags.transfer };
}

module.exports = { systemPrompt, TOOLS, encodeState, decodeState, runTurn, runTool, DEFAULT_PROMPT };
