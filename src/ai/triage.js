// ЛЗ 12. Подсказка специалиста по жалобе владельца.
// 1) Если локальная модель доступна — спрашиваем её (few-shot, температура 0).
// 2) Если модель недоступна — правила по ключевым словам (то же базовое решение, что в evals/).
// Правило отказа: модель ответила «не уверен» или правила не нашли ни одного признака — подсказки нет.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { available, generate, OLLAMA_MODEL } from './ollama.js';

const EVALS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'evals');
const RULES = JSON.parse(readFileSync(join(EVALS, 'rules.json'), 'utf8'));
const PROMPTS = JSON.parse(readFileSync(join(EVALS, 'prompts.json'), 'utf8'));
const COMPILED = RULES.rules.map(([label, rx]) => [label, new RegExp(rx, 'iu')]);

export const LABELS = PROMPTS.labels;
export const PROMPT_VERSION = PROMPTS.version;

// Что делать по каждой категории
export const ROUTE = {
  терапия: { specialty: 'Терапевт', text: 'терапевта' },
  дерматология: { specialty: 'Дерматолог', text: 'дерматолога' },
  хирургия: { specialty: 'Хирург', text: 'хирурга' },
  стоматология: { specialty: 'Стоматолог', text: 'стоматолога' },
  офтальмология: { specialty: 'Офтальмолог', text: 'офтальмолога' },
  неотложно: { specialty: null, emergency: true, text: 'неотложную помощь' },
};

// Базовое решение без ИИ. matched=false — сработало только правило «по умолчанию».
export function classifyRules(text) {
  for (const [label, rx] of COMPILED) if (rx.test(text)) return { label, matched: true };
  return { label: RULES.default, matched: false };
}

export function buildPrompt(text) {
  const shots = PROMPTS.few_shot.map(([t, l]) => `Жалоба: ${t}\nКатегория: ${l}`).join('\n');
  return `${PROMPTS.instruction}\n\nПримеры:\n${shots}\n\nЖалоба: ${text}\nКатегория:`;
}

// Тот же разбор ответа, что в evals/common.py: ровно одна категория или отказ
export function normalize(answer) {
  const a = String(answer ?? '').trim().toLowerCase();
  if (!a || a.includes(PROMPTS.abstain)) return null;
  const hits = LABELS.filter((c) => a.includes(c));
  return hits.length === 1 ? hits[0] : null;
}

export async function triage(text, { useModel = true } = {}) {
  const clean = String(text ?? '').trim().slice(0, 500);
  if (clean.length < 3) return null;
  if (useModel && await available()) {
    const r = await generate(buildPrompt(clean), { options: { temperature: 0, seed: 42, num_predict: 12 } });
    if (r) return { source: 'ai', model: OLLAMA_MODEL, label: normalize(r.text), raw: r.text, latencyMs: r.ms };
  }
  const t0 = Date.now();
  const { label, matched } = classifyRules(clean);
  return { source: 'rules', model: null, label: matched ? label : null, latencyMs: Date.now() - t0 };
}
