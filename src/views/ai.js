// ЛЗ 12: страница администратора «ИИ-подсказки».
import { esc } from '../util.js';
import { tabs } from './admin.js';

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const f3 = (x) => (typeof x === 'number' ? x.toFixed(3) : '—');
const NAMES = { baseline: 'Правила без ИИ', 'zero-shot': 'Модель, без примеров', 'few-shot': 'Модель, few-shot' };

export function aiAdmin({ stats, byLabel, recent, runs, model }) {
  const labels = runs.find((r) => !r.missing)?.labels ?? [];
  return `
${tabs('/admin/ai')}
<div class="page-head"><div>
  <p class="eyebrow">ЛЗ 12 · ИИ-функция</p>
  <h1>Подсказка специалиста по жалобе</h1>
  <p class="muted">Владелец пишет, что беспокоит, — сайт подсказывает, к какому врачу записаться. Подсказка не выбирает за человека.</p>
</div><span class="row-actions" style="margin:0"><a class="btn" href="/admin/lab12/report" target="_blank">Есеп ЗЖ 12 (қаз., PDF)</a><a class="btn btn-ghost" href="/admin/lab12/report?lang=ru" target="_blank">Отчёт (рус.)</a></span></div>

<div class="stats">
  <div class="stat"><span>Модель</span><b class="b-sm">${esc(model.name)}</b><small>${model.up ? '<span class="badge badge-done">работает</span>' : '<span class="badge badge-cancelled">недоступна — работают правила</span>'}</small></div>
  <div class="stat"><span>Подсказок всего</span><b>${stats.total}</b><small>ИИ: ${stats.ai ?? 0} · правила: ${stats.rules ?? 0}</small></div>
  <div class="stat"><span>Отказов («не уверен»)</span><b>${pct(stats.abstained ?? 0, stats.total)}</b><small>подсказка не показана</small></div>
  <div class="stat"><span>Подсказку приняли</span><b>${pct(stats.accepted ?? 0, stats.with_booking)}</b><small>из ${stats.with_booking ?? 0} записей с подсказкой</small></div>
</div>
<p class="muted small">Режим: <code>${esc(model.mode)}</code> · адрес модели: <code>${esc(model.url)}</code> · версия промпта: <code>${esc(model.prompt)}</code>${stats.ai_latency ? ` · среднее время ответа модели: ${Math.round(stats.ai_latency)} мс` : ''}.
Текст жалоб в эту таблицу не сохраняется — только длина.</p>

<section class="section card">
  <h2>Результаты замера на наборе evals/dataset.jsonl</h2>
  <div class="table-wrap"><table class="table table-compact">
    <thead><tr><th>Подход</th><th>Дата прогона</th><th>accuracy</th><th>macro F1</th><th>покрытие</th><th>сложные</th>${labels.map((l) => `<th>F1 ${esc(l)}</th>`).join('')}</tr></thead>
    <tbody>${runs.map((r) => r.missing
      ? `<tr><td>${esc(NAMES[r.name])}</td><td colspan="${5 + labels.length}" class="muted">нет прогона — запустите <code>python evals/run_llm.py</code> (нужна Ollama)</td></tr>`
      : `<tr><td><b>${esc(NAMES[r.name])}</b>${r.model ? `<br><small class="muted">${esc(r.model)}, t=${r.options?.temperature}</small>` : ''}</td><td>${esc(r.date)}</td>
        <td>${f3(r.metrics.accuracy)}</td><td><b>${f3(r.metrics.macro_f1)}</b></td><td>${f3(r.metrics.coverage)}</td><td>${f3(r.metrics.hard_accuracy)}</td>
        ${labels.map((l) => `<td>${r.per_class[l].f1.toFixed(2)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <p class="muted small">Критерий приёмки (ADR 0002): модель лучше правил по macro F1 не менее чем на 0,05 и не хуже правил ни по одному классу; полнота класса «неотложно» не ниже 0,9.</p>
</section>

<div class="grid grid-2 section">
  <article class="card">
    <h2>По категориям</h2>
    <div class="table-wrap"><table class="table table-compact">
      <thead><tr><th>Категория</th><th>Подсказок</th><th>С записью</th><th>Приняли</th></tr></thead>
      <tbody>${byLabel.map((b) => `<tr><td>${esc(b.label)}</td><td>${b.n}</td><td>${b.booked ?? 0}</td><td>${pct(b.acc ?? 0, b.booked)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Подсказок пока нет</td></tr>'}</tbody>
    </table></div>
  </article>
  <article class="card">
    <h2>Последние подсказки</h2>
    <div class="table-wrap"><table class="table table-compact">
      <thead><tr><th>Когда</th><th>Источник</th><th>Ответ</th><th>мс</th><th>Принята</th></tr></thead>
      <tbody>${recent.map((r) => `<tr><td class="nowrap">${esc(r.created_at.slice(5, 16))}</td><td>${r.source === 'ai' ? 'ИИ' : 'правила'}</td>
        <td>${r.label ? esc(r.label) : '<span class="muted">отказ</span>'}</td><td>${r.latency_ms ?? ''}</td>
        <td>${r.accepted === null ? '—' : r.accepted ? 'да' : 'нет'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Подсказок пока нет</td></tr>'}</tbody>
    </table></div>
  </article>
</div>`;
}
