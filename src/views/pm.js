// ЛЗ 13: страницы «PM-ассистент».
import { esc } from '../util.js';
import { csrfField } from './layout.js';
import { tabs } from './admin.js';

const KIND = { manual: 'Вручную (без ассистента)', generation: 'Генерация черновика', verification: 'Проверка фактов', editing: 'Правка текста', development: 'Разработка автоматизации' };
const VERDICT = { ok: 'Верно', semantic: 'Меняет смысл', style: 'Стилистика' };
const min = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 10) / 10} мин`);
const nd = (v) => (v === null || v === undefined ? 'нет данных' : esc(v));

function timeForm(csrf, reportId = '') {
  return `<form method="post" action="/admin/pm/time" class="form-row">
    ${csrfField(csrf)}<input type="hidden" name="report_id" value="${esc(reportId)}">
    <label>Что делали<select name="kind">${Object.entries(KIND).filter(([k]) => reportId ? k !== 'manual' && k !== 'development' : true)
      .map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="qty">Минут<input type="number" name="minutes" min="0.1" step="0.1" required></label>
    <label class="grow">Комментарий<input name="note" maxlength="200" placeholder="${reportId ? 'например: сверка с GitHub' : 'например: отчёт за неделю 46 вручную'}"></label>
    <button class="btn btn-ghost">Записать</button>
  </form>`;
}

export function pmIndex({ reports, errorsByPrompt, times, savings: s, csrf, defaults, model }) {
  return `
${tabs('/admin/pm')}
<div class="page-head"><div>
  <p class="eyebrow">ЛЗ 13 · ИИ-ассистент менеджера проекта</p>
  <h1>Еженедельный статус-отчёт</h1>
  <p class="muted">Числа считает сайт по данным GitHub. Модель только формулирует текст вокруг готовых чисел. Каждый черновик проверяет человек.</p>
</div><span class="row-actions" style="margin:0"><a class="btn" href="/admin/lab13/report" target="_blank">Есеп ЗЖ 13 (қаз., PDF)</a><a class="btn btn-ghost" href="/admin/lab13/report?lang=ru" target="_blank">Отчёт (рус.)</a></span></div>

<form method="post" action="/admin/pm" class="form form-inline card">
  ${csrfField(csrf)}
  <h3>Новый черновик</h3>
  <label class="span-2">Репозиторий GitHub<input name="repo" value="${esc(defaults.repo)}" required></label>
  <label>С<input type="date" name="from" value="${esc(defaults.from)}" required></label>
  <label>По<input type="date" name="to" value="${esc(defaults.to)}" required></label>
  <p class="span-all muted small">Модель ${esc(model.name)}: ${model.up ? '<span class="badge badge-done">работает</span>' : '<span class="badge badge-cancelled">недоступна — будет отчёт-шаблон без ИИ</span>'} · промпт ${esc(model.prompt)}</p>
  <button class="btn">Собрать факты и сделать черновик</button>
</form>

<div class="stats section">
  <div class="stat"><span>Вручную, в среднем</span><b>${min(s.manualAvg)}</b><small>замеров: ${s.manualCount}${s.enoughManual ? '' : ' — нужно не меньше 3'}</small></div>
  <div class="stat"><span>С ассистентом, в среднем</span><b>${min(s.aiAvg)}</b><small>генерация + проверка + правка, отчётов: ${s.aiCount}</small></div>
  <div class="stat"><span>Экономия на отчёт</span><b>${min(s.saving)}</b><small>${s.saving !== null && s.saving <= 0 ? 'чистой экономии нет' : 'вручную − с ассистентом'}</small></div>
  <div class="stat"><span>Окупаемость</span><b class="b-sm">${s.paybackReports ? `${s.paybackReports} отч. ≈ ${s.paybackReports} нед.` : '—'}</b><small>разработка: ${min(s.devMinutes)}</small></div>
</div>

<section class="section">
  <h2>Черновики</h2>
  ${reports.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>#</th><th>Период</th><th>Как сделан</th><th>Автопроверка</th><th>Журнал проверки</th><th>Статус</th></tr></thead>
    <tbody>${reports.map((r) => `<tr>
      <td><a href="/admin/pm/${r.id}">#${r.id}</a></td>
      <td>${esc(r.period_from)} — ${esc(r.period_to)}<br><small class="muted">${esc(r.repo)}</small></td>
      <td>${r.source === 'ai' ? `ИИ · ${esc(r.model)}` : 'шаблон без ИИ'}<br><small class="muted">промпт ${esc(r.prompt_version)} · факты: ${esc(r.facts_source)}</small></td>
      <td>${JSON.parse(r.auto_flags).length ? `<span class="badge badge-arrived">${JSON.parse(r.auto_flags).length} замеч.</span>` : '<span class="badge badge-done">чисто</span>'}</td>
      <td>${r.checks} утв.: ${r.semantic} смысл., ${r.style} стил.</td>
      <td>${r.verified_at ? '<span class="badge badge-done">проверен</span>' : '<span class="badge badge-booked">черновик</span>'}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="empty">Черновиков пока нет.</p>'}
</section>

<div class="grid grid-2 section">
  <article class="card">
    <h2>Ошибки по версиям промпта</h2>
    <div class="table-wrap"><table class="table table-compact">
      <thead><tr><th>Промпт</th><th>Источник</th><th>Утверждений</th><th>Меняют смысл</th><th>Стилистика</th></tr></thead>
      <tbody>${errorsByPrompt.map((e) => `<tr><td>${esc(e.prompt_version)}</td><td>${e.source === 'ai' ? 'ИИ' : 'шаблон'}</td><td>${e.checks}</td>
        <td>${e.checks ? `${e.semantic ?? 0} (${Math.round(((e.semantic ?? 0) / e.checks) * 100)}%)` : '—'}</td><td>${e.style ?? 0}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">нет данных</td></tr>'}</tbody>
    </table></div>
    <p class="muted small">После правки промпта по журналу смените номер версии в <code>scripts/pm_prompt.version</code> — так видно, изменилась ли доля ошибок.</p>
  </article>
  <article class="card" id="time">
    <h2>Замеры времени</h2>
    ${timeForm(csrf)}
    <div class="table-wrap" style="margin-top:12px"><table class="table table-compact">
      <thead><tr><th>Когда</th><th>Что</th><th>Мин</th><th>Отчёт</th></tr></thead>
      <tbody>${times.map((t) => `<tr><td class="nowrap">${esc(t.created_at.slice(0, 16))}</td><td>${esc(KIND[t.kind])}${t.note ? `<br><small class="muted">${esc(t.note)}</small>` : ''}</td><td>${t.minutes}</td><td>${t.report_id ? `#${t.report_id}` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Замеров пока нет. Сначала трижды засеките отчёт вручную.</td></tr>'}</tbody>
    </table></div>
  </article>
</div>`;
}

export function pmReport({ r, checks, times, verifier, csrf }) {
  const f = r.facts;
  const rows = [
    ['Коммитов', f.commits?.count], ['Задач открыто за период', f.issues?.opened], ['Задач закрыто за период', f.issues?.closed],
    ['Открытых задач сейчас', f.issues?.open_now], ['С меткой «в работе»', f.issues?.in_progress], ['Заблокированных', f.issues?.blocked],
    ['Слито pull request', f.pull_requests?.merged], ['Запусков CI', f.ci?.runs], ['— успешных', f.ci?.success], ['— упавших', f.ci?.failure],
    ['Развёртываний', f.deployments],
  ];
  return `
${tabs('/admin/pm')}
<p><a href="/admin/pm">← все черновики</a></p>
<div class="page-head"><div>
  <h1>Отчёт #${r.id}: ${esc(r.period_from)} — ${esc(r.period_to)}</h1>
  <p class="muted">${esc(r.repo)} · ${r.source === 'ai' ? `ИИ (${esc(r.model)}), ${r.gen_seconds?.toFixed(1)} с` : 'шаблон без ИИ'} · промпт ${esc(r.prompt_version)} · факты: ${esc(r.facts_source)}
  ${r.verified_at ? ` · <span class="badge badge-done">проверил(а) ${esc(verifier)} ${esc(r.verified_at.slice(0, 16))}</span>` : ''}</p>
</div><a class="btn btn-ghost" href="/admin/pm/${r.id}/report.md">Скачать .md</a></div>

<div class="grid grid-2">
  <article class="card">
    <h2>Факты (посчитаны сайтом)</h2>
    <table class="table table-compact"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td><b>${nd(v)}</b></td></tr>`).join('')}</tbody></table>
    ${f.issues?.closed_titles?.length ? `<p class="small"><b>Закрытые задачи:</b> ${f.issues.closed_titles.map(esc).join('; ')}</p>` : ''}
  </article>
  <article class="card">
    <h2>Черновик</h2>
    <pre class="draft">${esc(r.draft)}</pre>
    <h3>Автопроверка</h3>
    ${r.flags.length ? `<ul>${r.flags.map((x) => `<li class="note">${esc(x.type)}: <b>${esc(x.value)}</b></li>`).join('')}</ul>` : '<p class="muted">Чисел не из фактов и оценочных слов не найдено. Это не заменяет проверку человеком.</p>'}
  </article>
</div>

<section class="section card" id="checks">
  <h2>Журнал проверки</h2>
  <p class="muted small">Проверьте каждое утверждение черновика по GitHub. «Меняет смысл» — придуманные числа, даты, причины, договорённости. «Стилистика» — формулировки.</p>
  <div class="table-wrap"><table class="table table-compact">
    <thead><tr><th>Что написала модель</th><th>Как на самом деле</th><th>Вердикт</th></tr></thead>
    <tbody>${checks.map((c) => `<tr><td>${esc(c.claim)}</td><td>${esc(c.actual)}</td><td><span class="badge ${c.verdict === 'ok' ? 'badge-done' : c.verdict === 'semantic' ? 'badge-cancelled' : 'badge-arrived'}">${VERDICT[c.verdict]}</span></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Записей пока нет</td></tr>'}</tbody>
  </table></div>
  <form method="post" action="/admin/pm/${r.id}/checks" class="form-row" style="margin-top:12px">
    ${csrfField(csrf)}
    <label class="grow">Утверждение<input name="claim" required maxlength="500"></label>
    <label class="grow">Как на самом деле<input name="actual" maxlength="500"></label>
    <label>Вердикт<select name="verdict">${Object.entries(VERDICT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <button class="btn btn-ghost">Добавить</button>
  </form>
</section>

<section class="section card">
  <h2>Итоговый текст</h2>
  <form method="post" action="/admin/pm/${r.id}/final" class="form">
    ${csrfField(csrf)}
    <textarea name="final_text" rows="14">${esc(r.final_text ?? r.draft)}</textarea>
    <div class="row-actions"><button class="btn btn-ghost" name="verify" value="0">Сохранить правку</button>
    <button class="btn" name="verify" value="1">Сохранить: факты проверены мной</button></div>
  </form>
</section>

<section class="section card" id="time">
  <h2>Время на этот отчёт</h2>
  <ul class="plain">${times.map((t) => `<li><span>${esc(KIND[t.kind])}${t.note ? ` · <small class="muted">${esc(t.note)}</small>` : ''}</span><b>${t.minutes} мин</b></li>`).join('')}</ul>
  ${timeForm(csrf, r.id)}
</section>`;
}
