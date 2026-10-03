'use strict';
// Verifies every public link the page depends on (channel, repo, download, social profiles...).
// Run: node scripts/check_links.js     (exit code 1 when a link is really broken)
const fs = require('fs');
const path = require('path');

const BOT_BLOCKED = /(^|\.)(linkedin|instagram|facebook|x|twitter)\.com$/i; // these refuse automated requests
const UA = 'Mozilla/5.0 (compatible; weekly-link-check; +https://github.com/musman550/ai-calling-agent-top-free)';

function extractUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/const (?:YOUTUBE_CHANNEL_URL|REPO_URL|RELEASE_ZIP_URL)\s*=\s*"(https?:\/\/[^"]+)"/g)) urls.add(m[1]);
  return [...urls].sort();
}

async function checkOne(url, fetchImpl = fetch) {
  const host = new URL(url).hostname;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA }, signal: ctl.signal });
      clearTimeout(timer);
      if (res.status < 400) return { url, ok: true, status: res.status };
      if (BOT_BLOCKED.test(host) && [403, 429, 999].includes(res.status)) return { url, ok: true, status: res.status, note: 'site blocks bots — cannot verify automatically' };
      if (attempt === 1 || res.status < 500) return { url, ok: false, status: res.status };
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 1) return { url, ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
    }
  }
  return { url, ok: false, error: 'unknown' };
}

async function checkAll(urls, fetchImpl = fetch) {
  const out = [];
  for (const u of urls) out.push(await checkOne(u, fetchImpl));
  return out;
}

async function main() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const urls = extractUrls(html);
  const results = await checkAll(urls);
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.status || r.error} ${r.url}${r.note ? ' (' + r.note + ')' : ''}`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} links OK`);
  process.exit(bad.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { extractUrls, checkOne, checkAll };
