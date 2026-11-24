// ЛЗ 13 на сайте: PM-ассистент — черновик статус-отчёта, журнал проверки и расчёт экономии.
import { HttpError, readForm, redirect, send } from '../http.js';
import { localDate, addDays, isDate, localDateTime } from '../util.js';
import { log } from '../db.js';
import { collectFacts, DEFAULT_REPO } from '../pm/facts.js';
import { makeDraft, autoCheck, disclosure, PROMPT_VERSION } from '../pm/report.js';
import { available, OLLAMA_MODEL } from '../ai/ollama.js';
import * as view from '../views/pm.js';

const KINDS = ['manual', 'generation', 'verification', 'editing', 'development'];

// Экономия по методичке: время вручную − (генерация + проверка + правка); отдельно — часы на разработку и окупаемость
export function savings(db) {
  const manual = db.prepare("SELECT minutes FROM pm_time_log WHERE kind = 'manual'").all().map((r) => r.minutes);
  const perReport = db.prepare(`SELECT report_id, SUM(minutes) AS m FROM pm_time_log
    WHERE kind IN ('generation','verification','editing') AND report_id IS NOT NULL GROUP BY report_id`).all().map((r) => r.m);
  const dev = db.prepare("SELECT COALESCE(SUM(minutes), 0) AS m FROM pm_time_log WHERE kind = 'development'").get().m;
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const manualAvg = avg(manual);
  const aiAvg = avg(perReport);
  const saving = manualAvg !== null && aiAvg !== null ? manualAvg - aiAvg : null;
  return {
    manualCount: manual.length, manualAvg, aiCount: perReport.length, aiAvg, saving, devMinutes: dev,
    paybackReports: saving > 0 ? Math.ceil(dev / saving) : null,
    enoughManual: manual.length >= 3,
  };
}

export default function register(app) {
  const { db, route, page, requireRole, checkCsrf } = app;
  const admin = (ctx) => requireRole(ctx, ['admin']);
  const getFacts = app.pmFacts ?? collectFacts;

  const reportById = (id) => {
    const r = db.prepare('SELECT * FROM pm_reports WHERE id = ?').get(Number(id));
    if (!r) throw new HttpError(404);
    return { ...r, facts: JSON.parse(r.facts_json), flags: JSON.parse(r.auto_flags) };
  };

  route('GET', '/admin/pm', async (ctx, res) => {
    admin(ctx);
    const reports = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM pm_checks c WHERE c.report_id = r.id) AS checks,
      (SELECT COUNT(*) FROM pm_checks c WHERE c.report_id = r.id AND c.verdict = 'semantic') AS semantic,
      (SELECT COUNT(*) FROM pm_checks c WHERE c.report_id = r.id AND c.verdict = 'style') AS style
      FROM pm_reports r ORDER BY r.id DESC`).all();
    const errorsByPrompt = db.prepare(`SELECT r.prompt_version, r.source, COUNT(c.id) AS checks,
      SUM(c.verdict = 'semantic') AS semantic, SUM(c.verdict = 'style') AS style
      FROM pm_reports r LEFT JOIN pm_checks c ON c.report_id = r.id GROUP BY r.prompt_version, r.source`).all();
    const times = db.prepare('SELECT * FROM pm_time_log ORDER BY id DESC LIMIT 40').all();
    page(res, ctx, 'PM-ассистент', view.pmIndex({
      reports, errorsByPrompt, times, savings: savings(db), csrf: ctx.user.csrf,
      defaults: { repo: DEFAULT_REPO, from: addDays(localDate(), -7), to: addDays(localDate(), -1) },
      model: { name: OLLAMA_MODEL, up: await available(), prompt: PROMPT_VERSION },
    }));
  });

  route('POST', '/admin/pm', async (ctx, res, req) => {
    admin(ctx);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const repo = (f.repo || DEFAULT_REPO).trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new HttpError(400, 'Репозиторий в формате владелец/название.');
    if (!isDate(f.from ?? '') || !isDate(f.to ?? '') || f.from > f.to) throw new HttpError(400, 'Проверьте период.');
    const { source: factsSource, facts } = await getFacts(repo, f.from, f.to);
    const d = await makeDraft(facts);
    const flags = autoCheck(d.draft, facts);
    const id = Number(db.prepare(`INSERT INTO pm_reports (created_by, repo, period_from, period_to, facts_json, facts_source,
        prompt_version, source, model, draft, raw_output, gen_seconds, auto_flags, final_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ctx.user.id, repo, f.from, f.to, JSON.stringify(facts), factsSource,
      PROMPT_VERSION, d.source, d.model, d.draft, d.raw, d.seconds, JSON.stringify(flags),
      `${d.draft}\n\n${disclosure(d)}`).lastInsertRowid);
    // Время генерации записывается автоматически — оно входит в расчёт экономии
    db.prepare("INSERT INTO pm_time_log (report_id, kind, minutes, note, user_id) VALUES (?, 'generation', ?, 'автоматически', ?)")
      .run(id, Math.max(0.1, Math.round((d.seconds / 60) * 10) / 10), ctx.user.id);
    log(db, ctx.user.id, 'PM-ассистент', `черновик #${id} ${repo} ${f.from}—${f.to} (${d.source === 'ai' ? 'ИИ' : 'без ИИ'})`);
    redirect(res, `/admin/pm/${id}`);
  });

  route('GET', '/admin/pm/:id', (ctx, res, req, { id }) => {
    admin(ctx);
    const r = reportById(id);
    const checks = db.prepare('SELECT * FROM pm_checks WHERE report_id = ? ORDER BY id').all(r.id);
    const times = db.prepare('SELECT * FROM pm_time_log WHERE report_id = ? ORDER BY id').all(r.id);
    const verifier = r.verified_by ? db.prepare('SELECT name FROM users WHERE id = ?').get(r.verified_by)?.name : null;
    page(res, ctx, `Отчёт #${r.id}`, view.pmReport({ r, checks, times, verifier, csrf: ctx.user.csrf }));
  });

  route('POST', '/admin/pm/:id/checks', async (ctx, res, req, { id }) => {
    admin(ctx);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const r = reportById(id);
    if (!f.claim || !['ok', 'semantic', 'style'].includes(f.verdict)) throw new HttpError(400, 'Заполните утверждение и вердикт.');
    db.prepare('INSERT INTO pm_checks (report_id, claim, actual, verdict) VALUES (?, ?, ?, ?)')
      .run(r.id, f.claim.slice(0, 500), (f.actual ?? '').slice(0, 500), f.verdict);
    redirect(res, `/admin/pm/${r.id}#checks`);
  });

  route('POST', '/admin/pm/:id/final', async (ctx, res, req, { id }) => {
    admin(ctx);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const r = reportById(id);
    const verify = f.verify === '1';
    const text = String(f.final_text ?? '').slice(0, 10_000)
      .replace(/(Факты ещё не проверены человеком\.|Факты проверил\(а\): .*)$/m,
        verify ? `Факты проверил(а): ${ctx.user.name}, ${localDate()}.` : '$1');
    db.prepare(`UPDATE pm_reports SET final_text = ?, verified_by = CASE WHEN ? THEN ? ELSE verified_by END,
      verified_at = CASE WHEN ? THEN ? ELSE verified_at END WHERE id = ?`)
      .run(text, verify ? 1 : 0, ctx.user.id, verify ? 1 : 0, localDateTime(), r.id);
    redirect(res, `/admin/pm/${r.id}`);
  });

  route('POST', '/admin/pm/time', async (ctx, res, req) => {
    admin(ctx);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const minutes = Number(String(f.minutes).replace(',', '.'));
    if (!KINDS.includes(f.kind) || !(minutes > 0 && minutes < 10_000)) throw new HttpError(400, 'Укажите вид работы и минуты.');
    const reportId = f.report_id ? Number(f.report_id) : null;
    if (reportId) reportById(reportId);
    db.prepare('INSERT INTO pm_time_log (report_id, kind, minutes, note, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(reportId, f.kind, minutes, (f.note ?? '').slice(0, 200), ctx.user.id);
    redirect(res, reportId ? `/admin/pm/${reportId}#time` : '/admin/pm#time');
  });

  route('GET', '/admin/pm/:id/report.md', (ctx, res, req, { id }) => {
    admin(ctx);
    const r = reportById(id);
    send(res, 200, `# Статус-отчёт ${r.repo}: ${r.period_from} — ${r.period_to}\n\n${r.final_text ?? r.draft}\n`, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="status-${r.period_to}.md"`,
    });
  });
}
