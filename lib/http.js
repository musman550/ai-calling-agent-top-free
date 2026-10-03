'use strict';
const { safeEqual } = require('./twilio');

// CORS is safe here: every sensitive endpoint is protected by the x-admin-key header, not cookies.
// Returns true when the request was a preflight and has already been answered.
function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-admin-key');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

function json(res, status, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(obj));
}

function jsonBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b || '{}')); } catch { return {}; }
}

// null = ok, otherwise { status, detail } to return to the caller.
function adminProblem(req, env) {
  if (!env.ADMIN_KEY) return { status: 503, detail: 'Set ADMIN_KEY in Vercel → Settings → Environment Variables (any long random text), redeploy, then paste it into the dashboard.' };
  const given = req.headers['x-admin-key'] || '';
  if (!given || !safeEqual(given, env.ADMIN_KEY)) return { status: 401, detail: 'Wrong or missing admin key.' };
  return null;
}

module.exports = { cors, json, jsonBody, adminProblem };
