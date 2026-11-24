// Страницы для печати отчётов ЛЗ 12 и ЛЗ 13 (PDF через «Печать → Сохранить как PDF»).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { send } from '../http.js';
import { localDate, addDays, localDateTime } from '../util.js';
import { costModel } from '../ai/cost.js';
import { savings } from './pm.js';
import { PROMPT_TEMPLATE } from '../pm/report.js';
import * as view from '../views/labreport.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const jsonl = (path) => readFileSync(path, 'utf8').split('\n').filter((s) => s.trim()).map((s) => JSON.parse(s));

function loadRun(name) {
  const path = join(ROOT, 'evals', 'runs', `${name}.jsonl`);
  if (!existsSync(path)) return { name };
  const [first, ...rows] = jsonl(path);
  return { name, meta: first.meta, rows };
}

// Лист разметки двумя участниками: совпадение и каппа Коэна
function labelingStats() {
  const path = join(ROOT, 'evals', 'labeling.csv');
  if (!existsSync(path)) return {};
  const rows = readFileSync(path, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map((l) => l.split(';'));
  const both = rows.filter((r) => r[2]?.trim() && r[3]?.trim());
  if (!both.length) return { both: 0 };
  const a = both.map((r) => r[2].trim());
  const b = both.map((r) => r[3].trim());
  const n = both.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const count = (arr, k) => arr.filter((x) => x === k).length;
  const pe = [...new Set([...a, ...b])].reduce((s, k) => s + count(a, k) * count(b, k), 0) / (n * n);
  return { both: n, agree: po, kappa: pe < 1 ? (po - pe) / (1 - pe) : 1 };
}

export default function register(app) {
  const { db, route, requireRole } = app;

  route('GET', '/admin/lab12/report', (ctx, res) => {
    requireRole(ctx, ['admin']);
    const runs = ['baseline', 'zero-shot', 'few-shot'].map(loadRun);
    const rulesCfg = JSON.parse(readFileSync(join(ROOT, 'evals', 'rules.json'), 'utf8'));
    const today = localDate();
    const bookingsPerMonth = db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE starts_at >= ? AND starts_at < ? AND status <> 'cancelled'")
      .get(addDays(today, -30), today).n;
    const few = runs.find((r) => r.name === 'few-shot')?.meta;
    const cost = costModel({ bookingsPerMonth, tokens: few ? { input: few.avg_prompt_tokens, output: few.avg_output_tokens } : null });
    const live = db.prepare(`SELECT COUNT(*) AS total, SUM(source = 'ai') AS ai, SUM(source = 'rules') AS rules, SUM(label IS NULL) AS abstained,
      SUM(accepted IS NOT NULL) AS with_booking, SUM(accepted = 1) AS accepted FROM ai_suggestions`).get();
    send(res, 200, view.lab12Report({
      dataset: jsonl(join(ROOT, 'evals', 'dataset.jsonl')), runs, labeling: labelingStats(),
      rules: { groups: rulesCfg.rules.length, patterns: rulesCfg.rules.reduce((s, [, p]) => s + p.split('|').length, 0) },
      cost, live, bookingsPerMonth, generated: localDateTime().replace('T', ' '),
    }));
  });

  route('GET', '/admin/lab13/report', (ctx, res) => {
    requireRole(ctx, ['admin']);
    const dir = join(ROOT, 'reports');
    const scriptRuns = existsSync(dir) ? readdirSync(dir).filter((n) => /^status-.*\.json$/.test(n)).sort()
      .map((n) => ({ ...JSON.parse(readFileSync(join(dir, n), 'utf8')), promptTemplate: PROMPT_TEMPLATE })) : [];
    if (!scriptRuns.length) scriptRuns.push({ promptTemplate: PROMPT_TEMPLATE, skip: true });
    send(res, 200, view.lab13Report({
      scriptRuns: scriptRuns.filter((r) => !r.skip).length ? scriptRuns.filter((r) => !r.skip) : [{ promptTemplate: PROMPT_TEMPLATE, period: ['—', '—'], facts: {}, draft: 'Прогонов скрипта ещё нет', auto_flags: [], source: 'template' }],
      reports: db.prepare('SELECT * FROM pm_reports ORDER BY id').all(),
      checks: db.prepare('SELECT * FROM pm_checks ORDER BY id').all(),
      times: db.prepare('SELECT * FROM pm_time_log ORDER BY id').all(),
      savings: savings(db), generated: localDateTime().replace('T', ' '),
    }));
  });
}
