'use strict';
// Twilio helpers: request-signature validation, TwiML builders, small REST client.
// Zero dependencies — uses Node's built-in crypto and global fetch (Node 18+).
const crypto = require('crypto');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Twilio signs: full URL + every POST param (sorted by name) as name+value, HMAC-SHA1, base64.
function expectedSignature(authToken, url, params) {
  let data = url;
  for (const k of Object.keys(params || {}).sort()) {
    const v = params[k];
    if (Array.isArray(v)) for (const x of [...v].sort()) data += k + x;
    else data += k + (v === undefined || v === null ? '' : v);
  }
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function validSignature(authToken, signature, url, params) {
  if (!authToken || !signature) return false;
  return safeEqual(expectedSignature(authToken, url, params), signature);
}

// Vercel parses urlencoded bodies for us, but stay defensive about string/Buffer bodies.
function formBody(req) {
  const b = req.body;
  if (Buffer.isBuffer(b)) return Object.fromEntries(new URLSearchParams(b.toString('utf8')));
  if (typeof b === 'string') return Object.fromEntries(new URLSearchParams(b));
  if (b && typeof b === 'object') return b;
  return {};
}

function hostOf(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
}
function protoOf(req) {
  return String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
}
// The exact public URL Twilio requested (needed to verify its signature).
function publicUrl(req) {
  return `${protoOf(req)}://${hostOf(req)}${req.url}`;
}
function baseUrl(req) {
  return `${protoOf(req)}://${hostOf(req)}`;
}

const VOICES = {
  'en-US': 'Polly.Joanna',
  'en-GB': 'Polly.Amy',
  'hi-IN': 'Polly.Aditi',
  'es-ES': 'Polly.Lucia',
  'fr-FR': 'Polly.Lea',
  'ar-SA': 'Polly.Zeina',
};

function say(text, language, voice) {
  const v = voice || VOICES[language];
  return `<Say${v ? ` voice="${esc(v)}"` : ''} language="${esc(language)}">${esc(text)}</Say>`;
}

function twiml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

// <Say> nested inside <Gather> lets the caller interrupt (barge-in) while the agent talks.
function gatherSay({ text, language, voice, action }) {
  return twiml(
    `<Gather input="speech" language="${esc(language)}" speechTimeout="auto" actionOnEmptyResult="true" ` +
      `action="${esc(action)}" method="POST">${say(text, language, voice)}</Gather>`
  );
}
function sayHangup({ text, language, voice }) {
  return twiml(`${say(text, language, voice)}<Hangup/>`);
}
function sayDial({ text, language, voice, number }) {
  return twiml(`${say(text, language, voice)}<Dial>${esc(number)}</Dial>`);
}

function validE164(n) {
  return typeof n === 'string' && /^\+[1-9]\d{7,14}$/.test(n.trim());
}

async function twilioRequest({ sid, token, path, method = 'GET', form, fetchImpl = fetch }) {
  // path like '.json' fetches the account itself (Accounts/{sid}.json); anything else is a sub-resource.
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}${path.startsWith('.') ? '' : '/'}${path}`;
  const res = await fetchImpl(url, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const e = new Error(json.message || `Twilio HTTP ${res.status}`);
    e.status = res.status;
    e.code = json.code;
    throw e;
  }
  return json;
}

module.exports = {
  esc, expectedSignature, validSignature, safeEqual, formBody, publicUrl, baseUrl, hostOf,
  say, twiml, gatherSay, sayHangup, sayDial, validE164, twilioRequest, VOICES,
};
