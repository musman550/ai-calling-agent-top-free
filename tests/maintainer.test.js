'use strict';
// Tests for scripts/*.js with mocked network. Run: node tests/maintainer.test.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { extractUrls, checkOne, checkAll } = require(path.join(root, 'scripts/check_links'));
const { buildTrends } = require(path.join(root, 'scripts/trends'));
const { parseTests, parseLinks, buildReport } = require(path.join(root, 'scripts/weekly_report'));
const groq = require(path.join(root, 'lib/groq'));

let passed = 0, failed = 0;
const check = (n, c, x) => { if (c) { passed++; console.log('PASS - ' + n); } else { failed++; console.log('FAIL - ' + n + (x ? ' :: ' + x : '')); } };
const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

(async () => {
  // ---- link extraction from the REAL page ----
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const urls = extractUrls(html);
  check('extractUrls finds the channel, repo, download and profile links',
    ['https://www.youtube.com/@automatewithmusfiraai', 'https://github.com/musman550/ai-calling-agent-top-free', 'https://raw.githubusercontent.com/musman550/ai-calling-agent-top-free/main/ai-calling-agent.zip', 'https://musfiraai.com'].every((u) => urls.includes(u)), urls.join(' '));
  check('extractUrls ignores API base URLs inside the script (no false alarms)', !urls.some((u) => /api\.groq\.com|api\.twilio\.com/.test(u)));

  // ---- link checking ----
  check('200 -> ok', (await checkOne('https://a.example/x', async () => res(200))).ok === true);
  check('404 -> broken (reported with status)', (await checkOne('https://a.example/x', async () => res(404))).status === 404);
  const bot = await checkOne('https://www.linkedin.com/in/someone', async () => res(999));
  check('LinkedIn 999 (bot wall) -> not counted as broken, but noted', bot.ok === true && /blocks bots/.test(bot.note));
  check('a normal site returning 403 IS broken', (await checkOne('https://a.example/x', async () => res(403))).ok === false);
  let n = 0;
  const flaky = await checkOne('https://a.example/x', async () => (n++ === 0 ? res(503) : res(200)));
  check('a transient 5xx is retried once', flaky.ok === true && n === 2);
  const thrown = await checkOne('https://a.example/x', async () => { throw new Error('ENOTFOUND'); });
  check('network errors are reported, not thrown', thrown.ok === false && /ENOTFOUND/.test(thrown.error));
  const all = await checkAll(['https://a.example/1', 'https://a.example/2'], async (u) => (u.endsWith('1') ? res(200) : res(404)));
  check('checkAll aggregates results in order', all.length === 2 && all[0].ok && !all[1].ok);

  // ---- trends ----
  const ghMock = async (u) => {
    if (u.includes('/search/repositories')) return res(200, { items: [{ full_name: 'a/voice', html_url: 'https://github.com/a/voice', stargazers_count: 900, description: 'Cool | voice bot' }, { full_name: 'b/other', html_url: 'https://github.com/b/other', stargazers_count: 100, description: null }] });
    if (u.includes('/releases/latest')) return res(200, { tag_name: 'v9.9.9', html_url: 'https://github.com/x/y/releases/tag/v9.9.9', published_at: '2026-10-01T00:00:00Z' });
    return res(404, {});
  };
  const md = await buildTrends(ghMock, 'tok');
  check('trends: table de-duplicates repos across topics and sorts by stars', (md.match(/\| \[a\/voice\]/g) || []).length === 1 && md.indexOf('[a/voice]') < md.indexOf('[b/other]'));
  check('trends: pipes in descriptions cannot break the markdown table', /Cool \/ voice bot/.test(md));
  check('trends: lists latest releases of watched tools', /v9\.9\.9/.test(md) && /Pipecat/.test(md) && /n8n/.test(md));
  const mdFail = await buildTrends(async () => res(500, {}), '');
  check('trends: API outage degrades to notes, never throws', /No results this week/.test(mdFail) && /unavailable/.test(mdFail));

  // ---- parsing ----
  const goodOut = 'x\n63 passed, 0 failed\n53 passed, 0 failed\n';
  check('parseTests sums suites', parseTests(goodOut).passed === 116 && parseTests(goodOut).ok);
  check('parseTests flags failures', !parseTests('PASS - a\nFAIL - b\n10 passed, 1 failed').ok && parseTests('FAIL - b\n10 passed, 1 failed').problems.length === 1);
  check('parseTests treats a crashed run (no summary) as unhealthy', parseTests('CRASH TypeError').unknown === true && !parseTests('CRASH TypeError').ok);
  check('parseLinks', parseLinks('OK 200 x\n8/8 links OK').ok && !parseLinks('FAIL 404 https://x\n7/8 links OK').ok && parseLinks('FAIL 404 https://x\n7/8 links OK').bad.length === 1);

  // ---- report assembly ----
  const base = { tests: goodOut, links: '8/8 links OK', trends: '### T\nrow' };
  let r = await buildReport({ ...base, key: '', date: new Date('2026-10-05T00:00:00Z') });
  check('report without a Groq key: healthy, explains how to enable the AI review', r.healthy && /Weekly report — 2026-10-05/.test(r.markdown) && /GROQ_API_KEY/.test(r.markdown) && /Not enabled/.test(r.markdown));
  groq.resetCache();
  const groqMock = async (u, o) => {
    if (u.endsWith('/models')) return res(200, { data: [{ id: 'llama-3.3-70b-versatile' }] });
    const body = JSON.parse(o.body);
    check('AI review: sends health + trends and asks for suggestions only', /Weekly health/.test(body.messages[1].content) && /Trends this week/.test(body.messages[1].content) && body.max_tokens === 700 && !body.tools);
    return res(200, { choices: [{ message: { content: '- Add Urdu voice — callers ask for it — M' } }] });
  };
  r = await buildReport({ ...base, key: 'gsk_x', fetchImpl: groqMock });
  check('report with a key: AI section names the model and is marked suggestions-only', /AI review \(llama-3\.3-70b-versatile\)/.test(r.markdown) && /suggestions only/.test(r.markdown) && /Add Urdu voice/.test(r.markdown));
  groq.resetCache();
  r = await buildReport({ ...base, key: 'gsk_bad', fetchImpl: async (u) => (u.endsWith('/models') ? res(401, {}) : res(200, {})) });
  check('a rejected key never fails the run — the report says why', r.healthy === true && /AI review skipped/.test(r.markdown) && /rejected \(401\)/.test(r.markdown));
  r = await buildReport({ tests: '12 passed, 2 failed\nFAIL - x\n', links: 'FAIL 404 https://gone.example\n7/8 links OK', trends: '', key: '' });
  check('unhealthy report lists the failing tests and links', !r.healthy && /❌ 2 failed/.test(r.markdown) && /FAIL - x/.test(r.markdown) && /gone\.example/.test(r.markdown));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
