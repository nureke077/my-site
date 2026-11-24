// ЛЗ 13. Сбор фактов для статус-отчёта. Все числа считает этот код — модель их только пересказывает.
// Источник: GitHub REST API (публичный репозиторий читается без токена; GITHUB_TOKEN — по желанию).
// Если GitHub недоступен — коммиты из локального git log, остальное «нет данных».
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_REPO = process.env.GITHUB_REPO || 'nureke077/my-site';

const inPeriod = (iso, from, to) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
const LABEL_IN_PROGRESS = /in progress|в работе|doing/i;
const LABEL_BLOCKED = /blocked|заблок/i;
const DEPLOY = /deploy|pages|release|релиз|развёрт/i;

async function gh(path, useToken = true) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'doktor-khvost-pm-assistant' };
  if (useToken && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(15_000) });
  // Неподходящий токен — публичный репозиторий читается и без него
  if (r.status === 401 && headers.Authorization) return gh(path, false);
  if (!r.ok) throw new Error(`GitHub API ${r.status} для ${path}`);
  return r.json();
}

export async function githubFacts(repo, from, to) {
  const since = `${from}T00:00:00Z`;
  const until = `${to}T23:59:59Z`;
  const [commits, issuesUpdated, openIssues, pulls, runs] = await Promise.all([
    gh(`/repos/${repo}/commits?since=${since}&until=${until}&per_page=100`),
    gh(`/repos/${repo}/issues?state=all&since=${since}&per_page=100`),
    gh(`/repos/${repo}/issues?state=open&per_page=100`),
    gh(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`),
    gh(`/repos/${repo}/actions/runs?created=${from}..${to}&per_page=100`),
  ]);
  const issues = issuesUpdated.filter((i) => !i.pull_request);
  const open = openIssues.filter((i) => !i.pull_request);
  const labels = (i) => i.labels.map((l) => (typeof l === 'string' ? l : l.name)).join(' ');
  const wr = runs.workflow_runs ?? [];
  const deployRuns = wr.filter((r) => DEPLOY.test(r.name ?? ''));
  return {
    commits: { count: commits.length, authors_count: new Set(commits.map((c) => c.author?.login ?? c.commit?.author?.name)).size },
    issues: {
      opened: issues.filter((i) => inPeriod(i.created_at, from, to)).length,
      closed: issues.filter((i) => inPeriod(i.closed_at, from, to)).length,
      open_now: open.length,
      in_progress: open.filter((i) => LABEL_IN_PROGRESS.test(labels(i))).length,
      blocked: open.filter((i) => LABEL_BLOCKED.test(labels(i))).length,
      closed_titles: issues.filter((i) => inPeriod(i.closed_at, from, to)).slice(0, 10).map((i) => `#${i.number} ${i.title}`),
      blocked_titles: open.filter((i) => LABEL_BLOCKED.test(labels(i))).slice(0, 10).map((i) => `#${i.number} ${i.title}`),
    },
    pull_requests: { merged: pulls.filter((p) => inPeriod(p.merged_at, from, to)).length },
    ci: {
      runs: wr.length,
      success: wr.filter((r) => r.conclusion === 'success').length,
      failure: wr.filter((r) => r.conclusion === 'failure').length,
    },
    deployments: deployRuns.length ? deployRuns.filter((r) => r.conclusion === 'success').length : null,
  };
}

export function gitFacts(from, to) {
  if (!existsSync(join(ROOT, '.git'))) return null;
  const out = execFileSync('git', ['log', `--since=${from} 00:00`, `--until=${to} 23:59`, '--format=%H|%ae'], { cwd: ROOT, encoding: 'utf8' });
  const lines = out.trim().split('\n').filter(Boolean);
  return {
    commits: { count: lines.length, authors_count: new Set(lines.map((l) => l.split('|')[1])).size },
    issues: null, pull_requests: null, ci: null, deployments: null,
  };
}

// Итог: { source, facts } — facts уже готовы для промпта
export async function collectFacts(repo, from, to) {
  try {
    return { source: 'github', facts: { repo, period: { from, to }, ...(await githubFacts(repo, from, to)) } };
  } catch (e) {
    const local = gitFacts(from, to);
    if (local) return { source: 'git', error: e.message, facts: { repo, period: { from, to }, ...local } };
    return { source: 'нет данных', error: e.message, facts: { repo, period: { from, to }, commits: null, issues: null, pull_requests: null, ci: null, deployments: null } };
  }
}
