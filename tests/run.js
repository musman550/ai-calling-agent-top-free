'use strict';
// Runs every test file; exits non-zero if any suite fails. Usage: node tests/run.js
const { spawnSync } = require('child_process');
const path = require('path');
const suites = ['serverless.test.js', 'maintainer.test.js', 'dashboard.test.js'];
let bad = 0;
for (const f of suites) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 180000 });
  if (r.status !== 0) { bad++; console.log(`!! ${f} failed (exit ${r.status}${r.signal ? ', ' + r.signal : ''})`); }
}
console.log(bad ? `\n${bad} suite(s) FAILED` : '\nAll suites passed');
process.exit(bad ? 1 : 0);
