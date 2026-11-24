// ЛЗ 12 на сайте: подсказка специалиста при записи и мониторинг качества подсказок.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, readForm, json } from '../http.js';
import { triage, ROUTE, PROMPT_VERSION } from '../ai/triage.js';
import { available, OLLAMA_URL, OLLAMA_MODEL } from '../ai/ollama.js';
import * as view from '../views/ai.js';

const RUNS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'evals', 'runs');

// Результаты замера из evals/runs — показываем в админке рядом с живой статистикой
export function evalRuns() {
  return ['baseline', 'zero-shot', 'few-shot'].map((name) => {
    const path = join(RUNS, `${name}.jsonl`);
    if (!existsSync(path)) return { name, missing: true };
    const meta = JSON.parse(readFileSync(path, 'utf8').split('\n')[0]).meta;
    return { name, ...meta };
  });
}

// После записи отмечаем, приняли ли подсказку: записались к врачу подсказанной специальности
// (или в круглосуточный филиал при «неотложно»).
export function markSuggestion(db, suggestionId, userId, appointmentId) {
  const s = db.prepare('SELECT * FROM ai_suggestions WHERE id = ? AND user_id = ? AND appointment_id IS NULL').get(Number(suggestionId), userId);
  if (!s || !s.label) return;
  const a = db.prepare(`SELECT d.specialty, b.is_24h FROM appointments a JOIN doctors d ON d.user_id = a.vet_id
    LEFT JOIN branches b ON b.id = a.branch_id WHERE a.id = ?`).get(appointmentId);
  if (!a) return;
  const route = ROUTE[s.label];
  const accepted = route?.emergency ? a.is_24h === 1 : a.specialty === route?.specialty;
  db.prepare('UPDATE ai_suggestions SET accepted = ?, appointment_id = ? WHERE id = ?').run(accepted ? 1 : 0, appointmentId, s.id);
}

export default function register(app) {
  const { db, route, page, requireRole, checkCsrf } = app;

  route('POST', '/api/triage', async (ctx, res, req) => {
    requireRole(ctx, ['client', 'reception', 'admin']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const text = String(f.text ?? '').trim();
    const r = await triage(text);
    if (!r) return json(res, { label: null });
    const id = Number(db.prepare(`INSERT INTO ai_suggestions (user_id, source, model, prompt_version, label, latency_ms, text_length)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(ctx.user.id, r.source, r.model, r.source === 'ai' ? PROMPT_VERSION : null,
      r.label, r.latencyMs, text.length).lastInsertRowid);
    const info = r.label ? ROUTE[r.label] : null;
    const branches24 = info?.emergency ? db.prepare('SELECT id, name, address, phone FROM branches WHERE is_24h = 1').all() : [];
    json(res, { id, source: r.source, model: r.model, label: r.label, specialty: info?.specialty ?? null, text: info?.text ?? null, emergency: !!info?.emergency, branches24 });
  });

  route('GET', '/admin/ai', async (ctx, res) => {
    requireRole(ctx, ['admin']);
    const stats = db.prepare(`SELECT COUNT(*) AS total, SUM(source = 'ai') AS ai, SUM(source = 'rules') AS rules,
        SUM(label IS NULL) AS abstained, SUM(accepted IS NOT NULL) AS with_booking, SUM(accepted = 1) AS accepted,
        AVG(CASE WHEN source = 'ai' THEN latency_ms END) AS ai_latency
      FROM ai_suggestions`).get();
    const byLabel = db.prepare(`SELECT COALESCE(label, 'отказ') AS label, COUNT(*) AS n, SUM(accepted = 1) AS acc, SUM(accepted IS NOT NULL) AS booked
      FROM ai_suggestions GROUP BY label ORDER BY n DESC`).all();
    const recent = db.prepare('SELECT * FROM ai_suggestions ORDER BY id DESC LIMIT 30').all();
    page(res, ctx, 'ИИ-подсказки', view.aiAdmin({
      stats, byLabel, recent, runs: evalRuns(),
      model: { url: OLLAMA_URL, name: OLLAMA_MODEL, up: await available(), mode: process.env.AI_MODE || 'auto', prompt: PROMPT_VERSION },
    }));
  });

  route('GET', '/api/ai/status', async (ctx, res) => {
    if (!ctx.user) throw new HttpError(401);
    json(res, { model: OLLAMA_MODEL, available: await available() });
  });
}
