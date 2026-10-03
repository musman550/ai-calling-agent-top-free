'use strict';
// Serverless mode keeps no database. Call details are in Vercel -> your project -> Logs.
const { cors, json } = require('../lib/http');
module.exports = function handler(req, res) {
  if (cors(req, res)) return;
  return json(res, 200, []);
};
