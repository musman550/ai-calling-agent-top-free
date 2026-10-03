'use strict';
// Pulls this week's voice-agent trends from the public GitHub API (uses GITHUB_TOKEN if present).
// Run: node scripts/trends.js > trends.md
const WATCH_RELEASES = [
  ['pipecat-ai/pipecat', 'Pipecat (the real-time voice engine)'],
  ['livekit/agents', 'LiveKit Agents (competitor framework)'],
  ['n8n-io/n8n', 'n8n (workflow automation)'],
];
const TOPICS = ['voice-agent', 'ai-voice-agent', 'pipecat'];

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function gh(path, fetchImpl, token) {
  const res = await fetchImpl('https://api.github.com' + path, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'weekly-trends', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

async function buildTrends(fetchImpl = fetch, token = process.env.GITHUB_TOKEN) {
  const lines = [];
  const seen = new Map();
  for (const topic of TOPICS) {
    try {
      const q = encodeURIComponent(`topic:${topic} pushed:>${daysAgo(30)} stars:>50`);
      const data = await gh(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`, fetchImpl, token);
      for (const r of data.items || []) if (!seen.has(r.full_name)) seen.set(r.full_name, r);
    } catch (e) { lines.push(`_Could not load topic \`${topic}\`: ${e.message}_`); }
  }
  const repos = [...seen.values()].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 8);
  lines.unshift('### Active voice-agent projects (pushed in the last 30 days)');
  if (!repos.length) lines.push('_No results this week._');
  else {
    lines.push('| Project | ⭐ | What it is |', '|---|---|---|');
    for (const r of repos) lines.push(`| [${r.full_name}](${r.html_url}) | ${r.stargazers_count} | ${(r.description || '').replace(/\|/g, '/').slice(0, 90)} |`);
  }
  lines.push('', '### Latest releases of tools we depend on / compete with');
  for (const [repo, label] of WATCH_RELEASES) {
    try {
      const r = await gh(`/repos/${repo}/releases/latest`, fetchImpl, token);
      lines.push(`- **${label}** — [${r.tag_name}](${r.html_url}) (${String(r.published_at).slice(0, 10)})`);
    } catch (e) { lines.push(`- **${label}** — _unavailable (${e.message})_`); }
  }
  return lines.join('\n');
}

async function main() { process.stdout.write((await buildTrends()) + '\n'); }
if (require.main === module) main();
module.exports = { buildTrends };
