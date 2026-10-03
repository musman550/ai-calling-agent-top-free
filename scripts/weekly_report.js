'use strict';
// Builds report.md for the weekly GitHub issue.
// Inputs (all optional files in the working dir): test-output.txt, links-output.txt, trends.md
// Env: GROQ_API_KEY (optional) -> adds an AI review. The AI only SUGGESTS; nothing is changed automatically.
const fs = require('fs');
const path = require('path');
const groq = require('../lib/groq');

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

function parseTests(output) {
  let passed = 0, failed = 0, suites = 0;
  for (const m of output.matchAll(/(\d+) passed, (\d+) failed/g)) { passed += +m[1]; failed += +m[2]; suites++; }
  const problems = output.split('\n').filter((l) => /^(FAIL|CRASH)/.test(l)).slice(0, 10);
  const ok = suites > 0 && failed === 0 && problems.length === 0;
  return { ok, passed, failed, suites, problems, unknown: suites === 0 };
}

function parseLinks(output) {
  const m = output.match(/(\d+)\/(\d+) links OK/);
  const bad = output.split('\n').filter((l) => /^FAIL/.test(l)).slice(0, 10);
  return { ok: !!m && m[1] === m[2], summary: m ? `${m[1]}/${m[2]}` : 'no result', bad };
}

async function aiReview({ key, health, trends, fetchImpl = fetch }) {
  const { model, message } = await groq.complete({
    key, fetchImpl, maxTokens: 700,
    messages: [
      { role: 'system', content: 'You are a careful senior engineer reviewing an open-source AI phone-agent project (Vercel serverless functions + Twilio + Groq, plus a static dashboard). Be concrete and honest. Never invent facts that are not in the data you are given.' },
      { role: 'user', content: `Weekly health:\n${health}\n\nTrends this week:\n${trends.slice(0, 3500)}\n\nSuggest up to 5 small, safe improvements for next week. Format each as "- Title — why it matters — effort S/M/L". If tests or links failed, say what to check first. Max 220 words.` },
    ],
  });
  return { model, text: (message.content || '').trim() };
}

async function buildReport({ tests, links, trends, key, fetchImpl, date = new Date() }) {
  const t = parseTests(tests), l = parseLinks(links);
  const health = [
    `- Tests: ${t.unknown ? '❌ no result (the test run crashed?)' : t.ok ? `✅ ${t.passed} passed` : `❌ ${t.failed} failed / ${t.passed} passed`}`,
    ...t.problems.map((p) => `  - ${p}`),
    `- Links: ${l.ok ? '✅ ' : '❌ '}${l.summary}`,
    ...l.bad.map((p) => `  - ${p}`),
  ].join('\n');
  const out = [`# Weekly report — ${date.toISOString().slice(0, 10)}`, '', '## Health', health, '', '## Trends', trends || '_No trend data._'];
  let ai = null;
  if (key) {
    try { ai = await aiReview({ key, health, trends, fetchImpl }); out.push('', `## AI review (${ai.model}) — suggestions only, nothing is applied automatically`, ai.text || '_The model returned nothing._'); }
    catch (e) { out.push('', `## AI review skipped`, `Reason: ${e.status === 401 ? 'the GROQ_API_KEY secret was rejected (401) — add a valid free key from console.groq.com' : e.message}`); }
  } else {
    out.push('', '## AI review', '_Not enabled. To turn it on: repository Settings → Secrets and variables → Actions → New secret `GROQ_API_KEY` (a free key from console.groq.com)._');
  }
  return { markdown: out.join('\n') + '\n', healthy: t.ok && l.ok, tests: t, links: l, ai };
}

async function main() {
  const dir = process.cwd();
  const r = await buildReport({
    tests: read(path.join(dir, 'test-output.txt')), links: read(path.join(dir, 'links-output.txt')),
    trends: read(path.join(dir, 'trends.md')), key: process.env.GROQ_API_KEY || '',
  });
  fs.writeFileSync(path.join(dir, 'report.md'), r.markdown);
  console.log(r.markdown);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `healthy=${r.healthy}\n`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { parseTests, parseLinks, buildReport, aiReview };
