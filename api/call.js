'use strict';
// POST { "to": "+923001234567" } with header x-admin-key -> places a real outbound call.
const T = require('../lib/twilio');
const { cors, json, jsonBody, adminProblem } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { detail: 'POST only' });
  const env = process.env;
  const bad = adminProblem(req, env);
  if (bad) return json(res, bad.status, { detail: bad.detail });
  if (!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER)) {
    return json(res, 400, { detail: 'Fill TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in Vercel → Settings → Environment Variables, then redeploy.' });
  }
  const to = String(jsonBody(req).to || '').trim();
  if (!T.validE164(to)) return json(res, 400, { detail: 'Use international format, e.g. +923001234567' });
  try {
    const call = await T.twilioRequest({
      sid: env.TWILIO_ACCOUNT_SID,
      token: env.TWILIO_AUTH_TOKEN,
      path: 'Calls.json',
      method: 'POST',
      form: { To: to, From: env.TWILIO_PHONE_NUMBER, Url: `${T.baseUrl(req)}/api/voice`, Method: 'POST' },
    });
    return json(res, 200, { ok: true, sid: call.sid, status: call.status });
  } catch (e) {
    return json(res, 502, { detail: `Twilio refused the call: ${e.message}` });
  }
};
