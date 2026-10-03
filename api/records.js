'use strict';
// Bookings/messages are written to Vercel Logs (and sent to CALCOM_WEBHOOK_URL when set).
const { cors, json } = require('../lib/http');
module.exports = function handler(req, res) {
  if (cors(req, res)) return;
  return json(res, 200, []);
};
