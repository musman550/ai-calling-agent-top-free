'use strict';
// POST with header x-admin-key -> points your Twilio number's "A call comes in" webhook at this site.
// This is what replaces copy-pasting the webhook URL by hand: one click, inbound calls work.
const T = require('../lib/twilio');
const { cors, json, adminProblem } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { detail: 'POST only' });
  const env = process.env;
  const bad = adminProblem(req, env);
  if (bad) return json(res, bad.status, { detail: bad.detail });
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE_NUMBER: number } = env;
  if (!(sid && token && number)) {
    return json(res, 400, { detail: 'Fill TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in Vercel → Settings → Environment Variables, then redeploy.' });
  }
  const voiceUrl = `${T.baseUrl(req)}/api/voice`;
  try {
    const list = await T.twilioRequest({ sid, token, path: `IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}` });
    const found = (list.incoming_phone_numbers || [])[0];
    if (!found) return json(res, 404, { detail: `${number} was not found in this Twilio account.` });
    await T.twilioRequest({ sid, token, path: `IncomingPhoneNumbers/${found.sid}.json`, method: 'POST', form: { VoiceUrl: voiceUrl, VoiceMethod: 'POST' } });
    return json(res, 200, { ok: true, voice_url: voiceUrl, number });
  } catch (e) {
    return json(res, 502, { detail: `Twilio refused the update: ${e.message}` });
  }
};
