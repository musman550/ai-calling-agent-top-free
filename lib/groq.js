'use strict';
// Groq client with the lessons learned from real-world 404s baked in:
//  - never trust a hard-coded model name: ask Groq which models THIS key can use
//  - if a model/param is rejected, degrade gracefully (strip extras -> strip tools -> next model)
//  - retry once on rate limits / 5xx
const BASE = 'https://api.groq.com/openai/v1';
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // key -> { at, ids }

const NOT_CHAT = /whisper|tts|orpheus|playai|guard|safeguard|embed|moderation/i;
const PREFERRED = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function listModels(key, fetchImpl = fetch) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const res = await fetchImpl(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw httpError(`Groq /models HTTP ${res.status}`, res.status);
  const body = await res.json();
  const ids = (body.data || []).map((m) => m.id).filter(Boolean);
  cache.set(key, { at: Date.now(), ids });
  return ids;
}

function candidates(ids, override) {
  const chat = ids.filter((i) => !NOT_CHAT.test(i));
  const out = [];
  if (override && ids.includes(override)) out.push(override);
  for (const p of PREFERRED) if (chat.includes(p) && !out.includes(p)) out.push(p);
  for (const c of chat) if (!out.includes(c)) out.push(c);
  return out;
}

// Reasoning models need their thinking budget kept small for phone-call latency.
function extrasFor(model) {
  if (/gpt-oss/i.test(model)) return { reasoning_effort: 'low' };
  if (/qwen3/i.test(model)) return { reasoning_effort: 'none' };
  return {};
}
const maxTokensFor = (model) => (/gpt-oss|qwen3/i.test(model) ? 700 : 300);

async function callOnce({ key, model, messages, tools, extras, fetchImpl, maxTokens }) {
  const body = {
    model,
    messages,
    temperature: 0.4,
    max_tokens: maxTokens || maxTokensFor(model),
    ...(extras ? extrasFor(model) : {}),
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
      if (typeof msg.content === 'string') msg.content = msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      return msg;
    }
    const status = res.status;
    if ((status === 429 || status >= 500) && attempt === 0) { await sleep(400); continue; }
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw httpError(`Groq chat HTTP ${status} ${detail}`, status);
  }
  throw httpError('Groq chat failed', 500);
}

// Returns { model, message } or throws (error.status = last HTTP status).
async function complete({ key, messages, tools, modelOverride, fetchImpl = fetch, maxTokens }) {
  const ids = await listModels(key, fetchImpl);
  const cands = candidates(ids, modelOverride).slice(0, 3);
  if (!cands.length) throw httpError('No chat model is available for this Groq API key', 404);
  let last;
  for (const model of cands) {
    const hasExtras = Object.keys(extrasFor(model)).length > 0;
    // Progressive degradation per model: [tools+extras] -> [tools] -> [plain text only]
    const modes = [];
    if (hasExtras) modes.push({ tools, extras: true });
    modes.push({ tools, extras: false });
    if (tools) modes.push({ tools: undefined, extras: false });
    for (const m of modes) {
      try {
        const message = await callOnce({ key, model, messages, tools: m.tools, extras: m.extras, fetchImpl, maxTokens });
        return { model, message };
      } catch (e) {
        last = e;
        if (e.status === 401) throw e;       // wrong key: no point trying anything else
        if (e.status === 400) continue;      // unsupported param/tool use: try a simpler request
        break;                               // 404/403/429/5xx: move on to the next model
      }
    }
  }
  throw last || httpError('Groq request failed', 500);
}

function resetCache() { cache.clear(); }

module.exports = { listModels, candidates, complete, resetCache, BASE };
