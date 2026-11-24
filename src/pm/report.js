// ЛЗ 13. Черновик статус-отчёта: промпт, вызов модели, запасной шаблон без ИИ и автопроверка чисел.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { available, generate, OLLAMA_MODEL } from '../ai/ollama.js';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
export const PROMPT_TEMPLATE = readFileSync(join(SCRIPTS, 'pm_prompt.txt'), 'utf8');
export const PROMPT_VERSION = readFileSync(join(SCRIPTS, 'pm_prompt.version'), 'utf8').trim();

export function buildPrompt(facts) {
  return PROMPT_TEMPLATE
    .replace('{repo}', facts.repo)
    .replace('{period_from}', facts.period.from)
    .replace('{period_to}', facts.period.to)
    .replace('{facts}', JSON.stringify(facts, null, 2));
}

const nd = (v) => (v === null || v === undefined ? 'нет данных' : v);

// Отчёт без ИИ: тот же каркас, только подстановка чисел. Работает, когда модель недоступна.
export function templateDraft(f) {
  const lines = ['Сделано:'];
  lines.push(`- коммитов: ${nd(f.commits?.count)}; закрыто задач: ${nd(f.issues?.closed)}; слито pull request: ${nd(f.pull_requests?.merged)}.`);
  if (f.issues?.closed_titles?.length) lines.push(...f.issues.closed_titles.map((t) => `- ${t}`));
  lines.push('В работе:', `- открытых задач: ${nd(f.issues?.open_now)}, из них с меткой «в работе»: ${nd(f.issues?.in_progress)}; новых задач за период: ${nd(f.issues?.opened)}.`);
  lines.push('Риски и блокеры:', f.issues ? `- заблокированных задач: ${f.issues.blocked}.` : '- нет данных.');
  if (f.issues?.blocked_titles?.length) lines.push(...f.issues.blocked_titles.map((t) => `- ${t}`));
  lines.push('Качество сборок:', f.ci ? `- запусков CI: ${f.ci.runs}, успешных: ${f.ci.success}, упавших: ${f.ci.failure}; развёртываний: ${nd(f.deployments)}.` : '- нет данных.');
  return lines.join('\n');
}

// Все числа из фактов (включая даты периода) — только их можно упоминать в тексте
function allowedNumbers(facts) {
  const set = new Set();
  JSON.stringify(facts).match(/\d+/g)?.forEach((n) => set.add(String(Number(n))));
  return set;
}

const EVALUATIVE = ['отлично', 'успешно', 'к сожалению', 'значительно', 'хорошо', 'плохо', 'прекрасно', 'впечатляющ'];

// Автопроверка: числа, которых нет в фактах, и оценочные слова. Не заменяет проверку человеком.
export function autoCheck(text, facts) {
  const allowed = allowedNumbers(facts);
  const flags = [];
  for (const m of String(text).matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = m[0].replace(',', '.');
    if (!allowed.has(String(Number(n)))) flags.push({ type: 'число не из фактов', value: m[0] });
  }
  const low = String(text).toLowerCase();
  for (const w of EVALUATIVE) if (low.includes(w)) flags.push({ type: 'оценочное слово', value: w });
  if (String(text).split(/\s+/).filter(Boolean).length > 140) flags.push({ type: 'объём', value: 'больше 120 слов' });
  return flags;
}

export async function makeDraft(facts) {
  const t0 = Date.now();
  if (await available()) {
    const r = await generate(buildPrompt(facts), { options: { temperature: 0.2, seed: 42 }, timeoutMs: 180_000 });
    if (r && r.text.trim()) {
      return { source: 'ai', model: OLLAMA_MODEL, draft: r.text.trim(), raw: r.text, seconds: (Date.now() - t0) / 1000 };
    }
  }
  return { source: 'template', model: null, draft: templateDraft(facts), raw: null, seconds: (Date.now() - t0) / 1000 };
}

export function disclosure({ source, model }, verifier, date) {
  const who = verifier ? `Факты проверил(а): ${verifier}, ${date}.` : 'Факты ещё не проверены человеком.';
  return source === 'ai'
    ? `Раскрытие использования ИИ: текст черновика сформулировала языковая модель ${model} (локально, Ollama) по данным GitHub API; все числа посчитаны скриптом, модель их не вычисляла. ${who}`
    : `Отчёт собран скриптом по данным GitHub API без языковой модели. ${who}`;
}
