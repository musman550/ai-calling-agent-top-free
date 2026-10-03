'use strict';
// Twilio calls this URL for every turn of a phone call (inbound AND outbound).
// Stateless by design: conversation history rides inside the signed webhook URL,
// so no database, no always-on server and no .bat are needed.
const T = require('../lib/twilio');
const agent = require('../lib/agent');

function send(res, status, type, body) {
  res.setHeader('Content-Type', type);
  res.status(status).send(body);
}
const xml = (res, body) => send(res, 200, 'text/xml; charset=utf-8', body);

module.exports = async function handler(req, res) {
  const env = process.env;
  const language = env.LANGUAGE || 'en-US';
  const voice = env.VOICE || undefined;
  try {
    if (req.method !== 'POST') return send(res, 405, 'text/plain', 'POST only');
    if (!env.TWILIO_AUTH_TOKEN || !env.GROQ_API_KEY) {
      return send(res, 503, 'text/plain', 'Not configured: set GROQ_API_KEY and TWILIO_AUTH_TOKEN in Vercel → Settings → Environment Variables, then redeploy.');
    }
    const params = T.formBody(req);
    if (!T.validSignature(env.TWILIO_AUTH_TOKEN, req.headers['x-twilio-signature'], T.publicUrl(req), params)) {
      return send(res, 403, 'text/plain', 'Invalid Twilio signature');
    }

    const base = T.baseUrl(req);
    const q = new URL(req.url, 'http://localhost').searchParams;
    const rawState = q.get('h');
    const history = rawState ? agent.decodeState(rawState) : [];
    const silent = Number(q.get('n') || 0) || 0;
    const speech = String(params.SpeechResult || '').trim();
    const nextAction = (hist, n) => `${base}/api/voice?h=${agent.encodeState(hist)}&n=${n}`;
    const biz = env.BUSINESS_NAME || 'our business';

    // 1) First request of the call -> greet, then listen.
    if (!rawState) {
      const greet = env.GREETING || `Hello, thank you for calling ${biz}. How can I help you today?`;
      return xml(res, T.gatherSay({ text: greet, language, voice, action: nextAction([['a', greet]], 0) }));
    }

    // 2) The caller said nothing -> one gentle nudge, then goodbye.
    if (!speech) {
      if (silent >= 1) return xml(res, T.sayHangup({ text: 'I did not hear anything, so I will end the call. Goodbye!', language, voice }));
      return xml(res, T.gatherSay({ text: 'Sorry, I did not catch that. Are you still there?', language, voice, action: nextAction(history, silent + 1) }));
    }

    // 3) A normal turn.
    let turn;
    try {
      turn = await agent.runTurn({ env, history, userText: speech });
    } catch (e) {
      console.error('turn failed', e.status, e.message);
      if (e.status === 401 || e.status === 403 || e.status === 404) {
        return xml(res, T.sayHangup({ text: 'Sorry, this line is not set up correctly right now. Goodbye.', language, voice }));
      }
      return xml(res, T.gatherSay({ text: 'Sorry, I had a technical problem. Could you say that again?', language, voice, action: nextAction(history, 0) }));
    }

    const newHistory = [...history, ['u', speech], ['a', turn.text]];
    if (turn.end) return xml(res, T.sayHangup({ text: turn.text, language, voice }));
    if (turn.transfer) return xml(res, T.sayDial({ text: turn.text, language, voice, number: env.HUMAN_TRANSFER_NUMBER.trim() }));
    return xml(res, T.gatherSay({ text: turn.text, language, voice, action: nextAction(newHistory, 0) }));
  } catch (e) {
    console.error('voice handler error', e);
    // Twilio must always get valid TwiML back, otherwise the caller hears "application error".
    return xml(res, T.sayHangup({ text: 'Sorry, something went wrong. Goodbye.', language, voice }));
  }
};
