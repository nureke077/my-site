// ЛЗ 12 и 13: подсказка специалиста и PM-ассистент. Вместо настоящей Ollama — поддельный сервер
// с тем же API (/api/tags, /api/generate), чтобы проверить всю цепочку без модели.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

let fake, server, base, db, modelDown = false;
const prompts = [];

before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (modelDown) { res.writeHead(500); return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b' }] }));
      const { prompt, options } = JSON.parse(body);
      prompts.push({ prompt, options });
      const complaint = prompt.split('Жалоба: ').at(-1) ?? '';
      let response = 'терапия';
      if (prompt.includes('статус-отчёта')) response = 'Сделано: закрыто 7 задач, отлично. Коммитов: 5.';
      else if (/чеш/i.test(complaint)) response = 'дерматология';
      else if (/машин/i.test(complaint)) response = 'неотложно';
      else if (/непонятно/i.test(complaint)) response = 'не уверен';
      res.end(JSON.stringify({ response, prompt_eval_count: 180, eval_count: 3 }));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_URL = `http://127.0.0.1:${fake.address().port}`;

  const { openDb } = await import('../src/db.js');
  const { createApp } = await import('../src/server.js');
  db = openDb(':memory:');
  const pmFacts = async (repo, from, to) => ({
    source: 'github',
    facts: { repo, period: { from, to }, commits: { count: 5, authors_count: 2 },
      issues: { opened: 1, closed: 2, open_now: 3, in_progress: 1, blocked: 0, closed_titles: ['#1 Форма записи'], blocked_titles: [] },
      pull_requests: { merged: 0 }, ci: { runs: 5, success: 4, failure: 1 }, deployments: null },
  });
  server = http.createServer(createApp(db, { pmFacts }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fake.close(); });

async function login(email, password) {
  const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email, password }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const page = await (await fetch(`${base}${r.headers.get('location')}`, { headers: { cookie } })).text();
  return { cookie, csrf: page.match(/name="_csrf" value="([^"]+)"/)[1] };
}
const post = (path, s, data) => fetch(`${base}${path}`, {
  method: 'POST', redirect: 'manual', headers: { cookie: s.cookie }, body: new URLSearchParams({ _csrf: s.csrf, ...data }),
});
const html = async (path, s) => (await fetch(`${base}${path}`, { headers: { cookie: s.cookie } })).text();

describe('ЛЗ 12: подсказка специалиста', () => {
  test('правила на сайте отвечают так же, как evals/baseline.py на всём наборе', async () => {
    const { classifyRules } = await import('../src/ai/triage.js');
    const rows = readFileSync(new URL('../evals/runs/baseline.jsonl', import.meta.url), 'utf8').trim().split('\n').slice(1).map(JSON.parse);
    assert.equal(rows.length, 44);
    for (const r of rows) assert.equal(classifyRules(r.text).label, r.pred, r.text);
  });

  test('модель подсказывает дерматолога; текст жалобы в базе не хранится; запись отмечает принятие', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    const r = await (await post('/api/triage', s, { text: 'Чешется спина и лезет шерсть' })).json();
    assert.equal(r.source, 'ai');
    assert.equal(r.label, 'дерматология');
    assert.equal(r.specialty, 'Дерматолог');
    const last = prompts.at(-1);
    assert.equal(last.options.temperature, 0);
    assert.match(last.prompt, /Примеры:/, 'few-shot');

    const row = db.prepare('SELECT * FROM ai_suggestions WHERE id = ?').get(r.id);
    assert.equal(row.text_length, 'Чешется спина и лезет шерсть'.length);
    assert.ok(!JSON.stringify(row).includes('Чешется'), 'жалоба не сохранена');

    const derm = db.prepare("SELECT d.user_id, d.branch_id FROM doctors d WHERE d.specialty = 'Дерматолог' LIMIT 1").get();
    const { addDays, localDate, weekday } = await import('../src/util.js');
    let date = addDays(localDate(), 21);
    while (!db.prepare('SELECT 1 FROM vet_schedule WHERE vet_id = ? AND weekday = ?').get(derm.user_id, weekday(date))) date = addDays(date, 1);
    const { slots } = await (await fetch(`${base}/api/slots?vet=${derm.user_id}&date=${date}&service=1`, { headers: { cookie: s.cookie } })).json();
    const rex = db.prepare("SELECT id FROM pets WHERE name = 'Рекс'").get();
    const b = await post('/book', s, { pet_id: rex.id, service_id: 1, vet_id: derm.user_id, date, time: slots.find((x) => x.free).time, ai_suggestion_id: r.id, complaint: 'Чешется' });
    assert.equal(b.status, 303);
    assert.equal(db.prepare('SELECT accepted FROM ai_suggestions WHERE id = ?').get(r.id).accepted, 1);
  });

  test('«неотложно» показывает круглосуточные филиалы; «не уверен» — подсказки нет', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    const urgent = await (await post('/api/triage', s, { text: 'Сбила машина' })).json();
    assert.equal(urgent.emergency, true);
    assert.deepEqual(urgent.branches24.map((x) => x.name).sort(), ['Есиль', 'Тауелсиздик']);
    const unsure = await (await post('/api/triage', s, { text: 'Всё непонятно' })).json();
    assert.equal(unsure.label, null);
  });

  test('модель недоступна — работают правила, сайт не ломается', async () => {
    const { resetAvailability } = await import('../src/ai/ollama.js');
    modelDown = true;
    resetAvailability();
    const s = await login('client@khvost.local', 'Client12345');
    const r = await (await post('/api/triage', s, { text: 'Слезится глаз' })).json();
    assert.equal(r.source, 'rules');
    assert.equal(r.label, 'офтальмология');
    modelDown = false;
    resetAvailability();
  });

  test('админка показывает живую статистику и результаты замера правил', async () => {
    const s = await login('admin@khvost.local', 'Admin12345');
    const page = await html('/admin/ai', s);
    assert.match(page, /Правила без ИИ/);
    assert.match(page, /0\.927/, 'macro F1 правил из evals/runs/baseline.jsonl');
    assert.match(page, /Подсказку приняли/);
    const c = await login('client@khvost.local', 'Client12345');
    assert.equal((await fetch(`${base}/admin/ai`, { headers: { cookie: c.cookie } })).status, 403);
  });
});

describe('ЛЗ 13: PM-ассистент', () => {
  test('черновик: числа из фактов, автопроверка ловит придуманное число и оценочное слово', async () => {
    const s = await login('admin@khvost.local', 'Admin12345');
    const r = await post('/admin/pm', s, { repo: 'nureke077/my-site', from: '2026-11-17', to: '2026-11-23' });
    assert.equal(r.status, 303);
    const id = Number(r.headers.get('location').split('/').pop());
    const rep = db.prepare('SELECT * FROM pm_reports WHERE id = ?').get(id);
    assert.equal(rep.source, 'ai');
    const flags = JSON.parse(rep.auto_flags);
    assert.ok(flags.some((f) => f.value === '7'), '7 задач нет в фактах');
    assert.ok(flags.some((f) => f.value === 'отлично'));
    assert.ok(!flags.some((f) => f.value === '5'), '5 коммитов — из фактов');
    assert.match(rep.final_text, /Раскрытие использования ИИ/);
    assert.match(prompts.at(-1).prompt, /"commits"/, 'факты переданы в промпт');
    assert.equal(prompts.at(-1).options.temperature, 0.2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pm_time_log WHERE report_id = ? AND kind = 'generation'").get(id).n, 1);
  });

  test('журнал проверки, замеры времени, экономия и окупаемость', async () => {
    const s = await login('admin@khvost.local', 'Admin12345');
    const id = db.prepare('SELECT MAX(id) AS id FROM pm_reports').get().id;
    await post(`/admin/pm/${id}/checks`, s, { claim: 'закрыто 7 задач', actual: 'закрыто 2', verdict: 'semantic' });
    await post(`/admin/pm/${id}/checks`, s, { claim: 'отлично', actual: 'оценочное слово', verdict: 'style' });
    for (const m of [40, 35, 45]) await post('/admin/pm/time', s, { kind: 'manual', minutes: m });
    await post('/admin/pm/time', s, { kind: 'verification', minutes: 12, report_id: id });
    await post('/admin/pm/time', s, { kind: 'editing', minutes: 5, report_id: id });
    await post('/admin/pm/time', s, { kind: 'development', minutes: 360 });
    const { savings } = await import('../src/routes/pm.js');
    const sv = savings(db);
    assert.equal(sv.manualAvg, 40);
    assert.ok(sv.aiAvg > 17 && sv.aiAvg < 18, 'генерация (авто) + 12 + 5');
    assert.ok(sv.saving > 22 && sv.saving < 23);
    assert.equal(sv.paybackReports, Math.ceil(360 / sv.saving));
    const page = await html('/admin/pm', s);
    assert.match(page, /Меняют смысл/);
    assert.match(page, /1 \(50%\)/, 'доля смысловых ошибок по промпту');

    const text = db.prepare('SELECT final_text FROM pm_reports WHERE id = ?').get(id).final_text;
    await post(`/admin/pm/${id}/final`, s, { final_text: text, verify: '1' });
    const after = db.prepare('SELECT final_text, verified_at FROM pm_reports WHERE id = ?').get(id);
    assert.ok(after.verified_at);
    assert.match(after.final_text, /Факты проверил\(а\): Ирина Смирнова/);
    const md = await (await fetch(`${base}/admin/pm/${id}/report.md`, { headers: { cookie: s.cookie } })).text();
    assert.match(md, /Статус-отчёт nureke077\/my-site/);
  });

  test('без модели — отчёт-шаблон, все числа из фактов', async () => {
    const { templateDraft, autoCheck } = await import('../src/pm/report.js');
    const facts = { repo: 'x/y', period: { from: '2026-11-10', to: '2026-11-16' }, commits: { count: 0, authors_count: 0 }, issues: null, pull_requests: null, ci: null, deployments: null };
    const t = templateDraft(facts);
    assert.match(t, /нет данных/);
    assert.deepEqual(autoCheck(t, facts), []);
  });
});
