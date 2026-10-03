'use strict';
// GET /api/status            -> which settings exist (booleans only, never the values)
// GET /api/status?check=1    -> (admin key) also verifies the Groq key and Twilio login for real
const T = require('../lib/twilio');
const groq = require('../lib/groq');
const { cors, json, adminProblem } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { detail: 'GET only' });
  const env = process.env;
  const out = {
    mode: 'serverless',
    public_host: T.hostOf(req),
    engine_up: true,
    groq: !!env.GROQ_API_KEY,
    twilio: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER),
    admin: !!env.ADMIN_KEY,
    human_transfer: !!env.HUMAN_TRANSFER_NUMBER,
    booking_webhook: !!env.CALCOM_WEBHOOK_URL,
    models: { llm: env.GROQ_LLM_MODEL || null },
  };
  const q = new URL(req.url, 'http://localhost').searchParams;
  if (q.get('check') === '1') {
    const bad = adminProblem(req, env);
    if (bad) return json(res, bad.status, { detail: bad.detail });
    const checks = {};
    if (env.GROQ_API_KEY) {
      try {
        groq.resetCache();
        const ids = await groq.listModels(env.GROQ_API_KEY);
        const cands = groq.candidates(ids, env.GROQ_LLM_MODEL);
        checks.groq = { ok: cands.length > 0, chat_model: cands[0] || null, models_available: ids.length };
      } catch (e) {
        checks.groq = { ok: false, error: e.status === 401 ? 'Groq rejected the key (401)' : e.message };
      }
    } else checks.groq = { ok: false, error: 'GROQ_API_KEY is not set' };
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      try {
        const acct = await T.twilioRequest({ sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, path: '.json' });
        checks.twilio = { ok: true, account_status: acct.status, type: acct.type };
      } catch (e) {
        checks.twilio = { ok: false, error: e.status === 401 ? 'Twilio rejected the SID/token (401)' : e.message };
      }
    } else checks.twilio = { ok: false, error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set' };
    out.checks = checks;
  }
  return json(res, 200, out);
};
