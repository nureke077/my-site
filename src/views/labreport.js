// Отчёты ЛЗ 12 и ЛЗ 13 — отдельные страницы для печати в PDF (Ctrl+P → «Сохранить как PDF»).
// Все цифры берутся из файлов прогонов и базы. Если замера ещё нет — так и написано.
import { esc } from '../util.js';
import { TARIFF, ASSUMPTIONS } from '../ai/cost.js';

const f3 = (x) => (typeof x === 'number' ? x.toFixed(3) : '—');
const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : '—');
const usd = (x) => (x < 0.01 ? `$${x.toFixed(5)}` : `$${x.toFixed(2)}`);
const kzt = (x) => `${Math.round(x).toLocaleString('ru-RU').replace(/\s/g, ' ')} ₸`;
const pending = (what, how) => `<div class="pending"><b>Ожидает замера:</b> ${what}<br><span>Как получить: ${how}</span></div>`;
const NAMES = { baseline: 'Правила без ИИ', 'zero-shot': 'Модель, промпт без примеров', 'few-shot': 'Модель, few-shot (7 примеров)' };

export function doc(title, body, generated, lang = 'ru') {
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 "Segoe UI", "DejaVu Sans", Arial, sans-serif; color: #16323a; margin: 0 auto; max-width: 820px; padding: 24px; background: #fff; }
  h1 { font-size: 20pt; margin: 0 0 4px; color: #0b7d70; }
  h2 { font-size: 13.5pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #dff5f0; color: #0b7d70; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 14px 0 6px; page-break-after: avoid; }
  p, li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #d5e3e0; padding: 4px 7px; text-align: left; vertical-align: top; }
  th { background: #f2faf8; font-weight: 700; }
  code, pre { font: 9pt/1.4 "Consolas", "DejaVu Sans Mono", monospace; background: #f5f8f8; border-radius: 4px; }
  code { padding: 0 4px; }
  pre { padding: 8px 10px; white-space: pre-wrap; page-break-inside: avoid; border: 1px solid #e2ecea; }
  .title { border-bottom: 3px solid #0b7d70; padding-bottom: 10px; margin-bottom: 14px; }
  .meta { color: #5b7078; font-size: 9.5pt; }
  .pending { border: 1.5px dashed #c98a00; background: #fff8e6; color: #6b4a00; border-radius: 6px; padding: 8px 10px; margin: 8px 0; page-break-inside: avoid; }
  .pending span { font-size: 9pt; }
  .note { border-left: 4px solid #14a394; background: #f2faf8; padding: 6px 10px; margin: 8px 0; page-break-inside: avoid; }
  .warn { border-left: 4px solid #cc4218; background: #ffede7; padding: 6px 10px; margin: 8px 0; page-break-inside: avoid; }
  .ok { color: #137a3f; font-weight: 700; } .bad { color: #c0352b; font-weight: 700; }
  .simple { border-left: 4px solid #3d5afe; background: #eef2ff; padding: 6px 10px; margin: 8px 0; page-break-inside: avoid; }
  .example { border: 1px solid #d5e3e0; border-radius: 6px; padding: 6px 10px; margin: 8px 0; background: #fcfefd; page-break-inside: avoid; }
  .example b:first-child { color: #0b7d70; }
  .official { text-align: center; margin-bottom: 14px; }
  .official p { margin: 2px 0; }
  .official .work { font-size: 15pt; font-weight: 700; margin-top: 10px; }
  .signs td { border: none; padding: 3px 0; }
  .summary li { margin: 3px 0; }
  .toolbar { position: sticky; top: 0; background: #fff; padding: 8px 0 12px; display: flex; gap: 8px; }
  .toolbar button, .toolbar a { font: inherit; padding: 8px 14px; border-radius: 999px; border: 1px solid #0b7d70; background: #0b7d70; color: #fff; cursor: pointer; text-decoration: none; }
  .toolbar a { background: #fff; color: #0b7d70; }
  @media print { .toolbar { display: none; } body { padding: 0; max-width: none; } }
</style></head><body>
<div class="toolbar"><button onclick="print()">${lang === 'kk' ? 'Басып шығару / PDF сақтау' : 'Печать / сохранить в PDF'}</button><a href="javascript:history.back()">${lang === 'kk' ? 'Артқа' : 'Назад'}</a></div>
${body}
<p class="meta" style="margin-top:24px">${lang === 'kk' ? `Есепті «Доктор Хвост» сайты ${esc(generated)} автоматты түрде жасады: сандар іске қосу файлдарынан (evals/, reports/) және сайттың дерекқорынан алынды.` : `Отчёт сформирован автоматически сайтом «Доктор Хвост» ${esc(generated)} из файлов прогонов (evals/, reports/) и базы данных сайта.`}</p>
</body></html>`;
}

function metricsTable(runs, labels) {
  const have = runs.filter((r) => r.meta);
  return `<table>
    <tr><th>Подход</th><th>accuracy</th><th>macro F1</th><th>покрытие</th><th>точность на ответах</th><th>сложные (7)</th></tr>
    ${have.map((r) => `<tr><td>${NAMES[r.name]}</td><td>${f3(r.meta.metrics.accuracy)}</td><td><b>${f3(r.meta.metrics.macro_f1)}</b></td>
      <td>${f2(r.meta.metrics.coverage)}</td><td>${f3(r.meta.metrics.accuracy_answered)}</td><td>${f3(r.meta.metrics.hard_accuracy)}</td></tr>`).join('')}
  </table>
  <table>
    <tr><th>F1 по классам</th>${labels.map((l) => `<th>${esc(l)}</th>`).join('')}</tr>
    ${have.map((r) => `<tr><td>${NAMES[r.name]}</td>${labels.map((l) => `<td>${f2(r.meta.per_class[l].f1)}</td>`).join('')}</tr>`).join('')}
    <tr><td><i>примеров в классе</i></td>${labels.map((l) => `<td>${have[0]?.meta.per_class[l].support ?? ''}</td>`).join('')}</tr>
  </table>`;
}

export function acceptance(runs) {
  const base = runs.find((r) => r.name === 'baseline')?.meta;
  const model = runs.filter((r) => r.name !== 'baseline' && r.meta).map((r) => r.meta)
    .sort((a, b) => b.metrics.macro_f1 - a.metrics.macro_f1)[0];
  if (!base || !model) return null;
  const labels = base.labels;
  const worse = labels.filter((l) => model.per_class[l].f1 < base.per_class[l].f1);
  const checks = [
    ['macro F1 модели ≥ правила + 0,05', model.metrics.macro_f1 >= base.metrics.macro_f1 + 0.05, `${f3(model.metrics.macro_f1)} против ${f3(base.metrics.macro_f1)}`],
    ['не хуже правил ни по одному классу', worse.length === 0, worse.length ? `хуже по: ${worse.join(', ')}` : 'да'],
    ['полнота «неотложно» ≥ 0,90', model.per_class['неотложно'].recall >= 0.9, f2(model.per_class['неотложно'].recall)],
    ['среднее время ответа ≤ 3 с', model.avg_seconds <= 3, `${f2(model.avg_seconds)} с`],
  ];
  return { model, checks, pass: checks.every((c) => c[1]) };
}

export function lab12Report({ dataset, runs, labeling, rules, cost, live, bookingsPerMonth, generated }) {
  const labels = runs[0].meta?.labels ?? [];
  const byClass = labels.map((l) => [l, dataset.filter((x) => x.label === l).length]);
  const hard = dataset.filter((x) => x.hard);
  const base = runs[0];
  const modelRuns = runs.filter((r) => r.name !== 'baseline');
  const hasModel = modelRuns.some((r) => r.meta);
  const acc = acceptance(runs);
  return doc('ЛЗ 12. План ИИ-функции — Доктор Хвост', `
<div class="title">
  <h1>ЛЗ 12. План ИИ-функции: evals, стоимость, риски</h1>
  <p class="meta">Проект: сайт сети ветклиник «Доктор Хвост» (Астана) · Дисциплина «Управление ИТ-проектами» · ${esc(generated.slice(0, 10))}</p>
  <p class="meta">Артефакты в репозитории: <code>evals/</code> (набор, правила, прогоны), <code>docs/adr/0002-ai-specialist-hint.md</code>, функция на сайте — <code>src/ai/</code>.</p>
</div>
${hasModel ? '' : `<div class="warn"><b>Статус замера.</b> Прогон модели ещё не выполнен: в учебной облачной среде, где готовился отчёт, запуск Ollama был недоступен. Всё остальное — набор, правила без ИИ с замером, скрипты прогона, функция на сайте, расчёт стоимости, риски и ADR — готово. Разделы, которые заполнятся после прогона, отмечены жёлтым. После запуска <code>run_lab12_13.bat</code> этот отчёт пересоберётся с цифрами модели.</div>`}

<h2>1. Карточка ИИ-функции</h2>
<table>
  <tr><th style="width:28%">Функция</th><td>Подсказка специалиста по жалобе владельца. Владелец (или регистратура при записи по телефону) пишет, что беспокоит животное, — сайт предлагает категорию: терапия, дерматология, хирургия, стоматология, офтальмология или «неотложно» — и кнопку «Показать врачей». Для «неотложно» — телефон и адреса круглосуточных филиалов.</td></tr>
  <tr><th>Бизнес-метрика</th><td>Доля записей «не к тому врачу» (перенос или переадресация на другого специалиста в день приёма). Цель — снижение. Исходное значение у заказчика не замерено (<i>допущение</i>: измерять по переносам записей и по журналу <code>ai_suggestions.accepted</code>).</td></tr>
  <tr><th>Метрика качества модели</th><td>macro F1 на наборе <code>evals/dataset.jsonl</code> (классы неравномерны — accuracy не годится как единственная метрика); отдельно — полнота класса «неотложно» и покрытие (доля ответов без отказа).</td></tr>
  <tr><th>Критерий приёмки</th><td>macro F1 модели выше правил не менее чем на 0,05; не хуже правил ни по одному классу; полнота «неотложно» ≥ 0,90; среднее время ответа ≤ 3 с.</td></tr>
  <tr><th>Границы — что функция НЕ делает</th><td>не ставит диагноз и не даёт советов по лечению; не выбирает врача и не записывает сама; не заменяет звонок в неотложном случае; не анализирует фото; не определяет врача-экзотолога (это делается по виду животного, а не по жалобе); не сохраняет текст жалобы в журнале.</td></tr>
</table>

<h2>2. Базовое решение без ИИ</h2>
<p>${rules.groups} правил по ключевым словам (${rules.patterns} шаблонов, файл <code>evals/rules.json</code>): первое совпадение побеждает, «неотложно» проверяется первым; если ничего не нашлось — «терапия» (на сайте в этом случае подсказка не показывается). Те же правила работают на сайте, тест проверяет совпадение ответов Python и JavaScript на всём наборе.</p>
${base.meta ? `<p>Замер ${esc(base.meta.date)}: accuracy <b>${f3(base.meta.metrics.accuracy)}</b>, macro F1 <b>${f3(base.meta.metrics.macro_f1)}</b>, на 7 сложных примерах — ${f3(base.meta.metrics.hard_accuracy)}.</p>` : ''}
<div class="warn"><b>Ограничение замера.</b> Правила и набор примеров составлял один автор, поэтому оценка правил оптимистична: правила невольно подогнаны под эти формулировки. На новых, реальных жалобах точность правил будет ниже. Честная проверка — пополнить набор жалобами, которых автор правил не видел.</div>

<h2>3. Набор для оценки</h2>
<p>${dataset.length} примеров в формате JSONL (<code>evals/dataset.jsonl</code>, одна строка — один пример: id, текст, эталон, признак сложного примера, комментарий). ${hard.length} намеренно сложных: казахский язык, смесь языков, одно слово, две просьбы в одной жалобе, совпадение слов с другой категорией, неотложный случай без слов «срочно».</p>
<table><tr><th>Класс</th>${byClass.map(([l]) => `<th>${esc(l)}</th>`).join('')}<th>Всего</th></tr>
  <tr><td>примеров</td>${byClass.map(([, n]) => `<td>${n}</td>`).join('')}<td>${dataset.length}</td></tr></table>
<h3>Сложные примеры</h3>
<table><tr><th>#</th><th>Жалоба</th><th>Эталон</th><th>Чем сложен</th></tr>
  ${hard.map((x) => `<tr><td>${x.id}</td><td>${esc(x.text)}</td><td>${esc(x.label)}</td><td>${esc(x.note)}</td></tr>`).join('')}</table>
<div class="note"><b>Происхождение и разметка.</b> Реальных обращений заказчика у команды нет (заказчик учебный), поэтому формулировки жалоб — <i>допущение</i>: составлены по типичным обращениям в ветклинику. Черновые эталоны предложены при подготовке набора; по методике их должны независимо разметить два участника команды (лист <code>evals/labeling.csv</code>), расхождения — разобрать с заказчиком, согласие посчитать скриптом <code>evals/agreement.py</code> (каппа Коэна). Эталоны не получены той моделью, которую проверяем.</div>
${labeling.both ? `<p>Разметка двумя участниками: ${labeling.both} из ${dataset.length}, совпадение ${f2(labeling.agree)}, каппа Коэна ${f2(labeling.kappa)}.</p>` : pending('независимая разметка двумя участниками и каппа Коэна', 'заполнить столбцы labeler_a и labeler_b в evals/labeling.csv, затем python evals/agreement.py')}

<h2>4. Прогон и метрики</h2>
<p>Модель: <code>qwen2.5:3b</code> через Ollama (http://localhost:11434), температура 0, seed 42, не более 12 токенов ответа. Два подхода: промпт без примеров и few-shot (7 примеров, ни один не входит в набор оценки). Промпт — <code>evals/prompts.json</code>, версия ${esc(runs.find((r) => r.meta?.prompt_version)?.meta.prompt_version ?? 'v1')}. Сырые ответы модели и число токенов по каждому примеру сохраняются в <code>evals/runs/*.jsonl</code>.</p>
${metricsTable(runs, labels)}
${modelRuns.map((r) => r.meta ? `<p class="meta">${NAMES[r.name]}: прогон ${esc(r.meta.date)}, модель ${esc(r.meta.model)} (${esc(JSON.stringify(r.meta.model_version))}), параметры ${esc(JSON.stringify(r.meta.options))}, средняя длина запроса ${Math.round(r.meta.avg_prompt_tokens)} ток., время ${f2(r.meta.avg_seconds)} с.</p>` : '').join('')}
${hasModel ? '' : pending('accuracy и macro F1 модели (zero-shot и few-shot), F1 по классам, сырые ответы', 'установить Ollama, затем двойной щелчок по run_lab12_13.bat (выполнит ollama pull qwen2.5:3b и python evals/run_llm.py)')}
${acc ? `<h3>Проверка критерия приёмки (лучший подход: ${esc(acc.model.approach)})</h3>
<table><tr><th>Условие</th><th>Выполнено</th><th>Значение</th></tr>
${acc.checks.map(([t, ok, v]) => `<tr><td>${t}</td><td class="${ok ? 'ok' : 'bad'}">${ok ? 'да' : 'нет'}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p><b>Итог: ${acc.pass ? 'критерий выполнен — модель можно включать (режим auto).' : 'критерий не выполнен — на сайте остаются правила без ИИ (AI_MODE=rules), модель не включается.'}</b></p>` : ''}

<h2>5. Разбор ошибок</h2>
<h3>Правила без ИИ</h3>
<table><tr><th>#</th><th>Жалоба</th><th>Ответ</th><th>Эталон</th><th>Причина</th></tr>
${(base.rows ?? []).filter((r) => r.pred !== r.label).map((r) => `<tr><td>${r.id}</td><td>${esc(r.text)}</td><td>${esc(r.pred)}</td><td>${esc(r.label)}</td><td>${esc({
    20: 'совпадение слова «глаз»: правило не понимает, что проблема кожная',
    28: 'дефект процесса, а не модели: в одной жалобе две разные просьбы. Решение — в форме записи предлагать отдельную запись на каждую проблему',
    42: 'нет знаний предметной области: закупорка уретры у кота — неотложный случай без «тревожных» слов',
  }[r.id] ?? 'не сработало ни одно правило')}</td></tr>`).join('')}</table>
${modelRuns.filter((r) => r.rows).map((r) => `<h3>${NAMES[r.name]}</h3>
<table><tr><th>#</th><th>Жалоба</th><th>Сырой ответ</th><th>Итог</th><th>Эталон</th></tr>
${r.rows.filter((x) => x.pred !== x.label).map((x) => `<tr><td>${x.id}</td><td>${esc(x.text)}</td><td><code>${esc(x.raw.trim())}</code></td><td>${esc(x.pred)}</td><td>${esc(x.label)}</td></tr>`).join('') || '<tr><td colspan="5">ошибок нет</td></tr>'}</table>`).join('')}
${hasModel ? '' : pending('поштучный разбор ошибок модели', 'после прогона таблицы ошибок появятся здесь автоматически; в каждой строке — сырой ответ модели')}

<h2>6. Правило отказа</h2>
<p>Модели разрешено отвечать «не уверен» (если данных мало или подходит несколько категорий); ответ, в котором названо несколько категорий или ни одной, тоже считается отказом. При отказе подсказка не показывается — владелец выбирает сам. Для правил без ИИ отказ — случай, когда не сработал ни один признак. В метриках отказ считается ошибкой (строгая оценка), отдельно показаны покрытие и точность на тех ответах, где модель не отказалась. Принцип: не подсказать лучше, чем подсказать неверно.</p>

<h2>7. Стоимость эксплуатации</h2>
<p><b>Формула:</b> стоимость в месяц = запросов в месяц × (средняя длина запроса в токенах × тариф за входной токен + длина ответа × тариф за выходной токен).</p>
<table>
  <tr><th>Тариф API для сравнения</th><td>${esc(TARIFF.name)}: $${TARIFF.inputPerM} за 1 млн входных и $${TARIFF.outputPerM} за 1 млн выходных токенов. Источник: <code>${esc(TARIFF.url)}</code>, дата обращения ${esc(TARIFF.accessed)}.</td></tr>
  <tr><th>Объём</th><td>${bookingsPerMonth} записей за последние 30 дней (демо-данные сайта — <i>допущение</i>: у учебного заказчика нет реальной статистики) × ${ASSUMPTIONS.callsPerBooking.value} = <b>${cost.requests}</b> запросов в месяц. ${esc(ASSUMPTIONS.callsPerBooking.text)}.</td></tr>
  <tr><th>Длина запроса</th><td>${cost.measured ? `${Math.round(cost.tokensIn)} токенов на запрос и ${f2(cost.tokensOut)} на ответ — измерено токенизатором модели при прогоне few-shot (поле prompt_eval_count Ollama). Для модели API длина в её токенизаторе будет другой — это ограничение расчёта.` : 'не измерена: длину нужно брать из токенизатора, а не на глаз; её даёт прогон few-shot (поле prompt_eval_count)'}</td></tr>
</table>
${cost.measured ? `<table>
  <tr><th>Сценарий</th><th>Запросов в месяц</th><th>API, $ в месяц</th><th>API, ₸ в месяц</th></tr>
  <tr><td>Текущая нагрузка</td><td>${cost.requests}</td><td>${usd(cost.monthUsd)}</td><td>${kzt(cost.monthKzt)}</td></tr>
  <tr><td>Рост в 10 раз</td><td>${cost.requests * 10}</td><td>${usd(cost.x10Usd)}</td><td>${kzt(cost.x10Kzt)}</td></tr>
</table>
<h3>Свой сервер против API</h3>
<p>Свой сервер: ${esc(ASSUMPTIONS.serverKzt.text)}; ${esc(ASSUMPTIONS.usdKzt.text)} → ${usd(cost.serverUsd)} в месяц независимо от числа запросов. Стоимость одного запроса через API — ${usd(cost.perRequest)}.</p>
<p><b>Точка перелома:</b> ${usd(cost.serverUsd)} / ${usd(cost.perRequest)} ≈ <b>${cost.breakEvenRequests.toLocaleString('ru-RU')}</b> запросов в месяц — это в ${Math.round(cost.breakEvenTimes)} раз больше текущей нагрузки. Для проекта точка перелома недостижима: по деньгам API дешевле. Свой сервер выбран не из-за цены, а из-за персональных данных (раздел 9).</p>`
    : pending('стоимость в месяц, сценарий ×10 и точка перелома «свой сервер против API»', 'формулы и тариф уже заложены; после прогона few-shot расчёт подставит измеренную длину запроса')}

<h2>8. Карточка рисков</h2>
<table>
  <tr><th style="width:30%">Вопрос</th><th>Ответ</th></tr>
  <tr><td>Что происходит при ошибке модели</td><td>Владелец видит неверную подсказку и может записаться не к тому врачу → перенос записи, лишний визит. Запись не создаётся автоматически — человек выбирает сам.</td></tr>
  <tr><td>Худший сценарий</td><td>Неотложный случай (отравление, закупорка уретры, травма) классифицирован как плановый: владелец записывается на завтра вместо поездки в круглосуточный филиал.</td></tr>
  <tr><td>Как обнаружим</td><td>Журнал <code>ai_suggestions</code> (подсказка, источник, принята ли); разбор переносов записей раз в неделю; отдельный контроль полноты «неотложно» при каждом повторном замере на наборе.</td></tr>
  <tr><td>Где человек в контуре</td><td>Владелец или регистратор выбирает врача сам; регистратура видит жалобу в очереди; врач на приёме. Модель только подсказывает.</td></tr>
  <tr><td>Как пользователь узнаёт, что работает ИИ</td><td>Метка «ИИ» на подсказке и текст: «Подсказку сформировала языковая модель qwen2.5:3b на сервере клиники. Она может ошибаться — выбор врача за вами». Если работают правила — метка «Подсказка» и пояснение, что модель недоступна.</td></tr>
  <tr><td>Какие данные уходят провайдеру</td><td>Никакие: модель локальная, запрос не покидает сервер клиники. В журнал не пишется текст жалобы — только длина и ответ.</td></tr>
  <tr><td>Если модель недоступна</td><td>Сайт через 1,5 с переключается на правила без ИИ; запись работает всегда. Доступность проверяется не чаще раза в 30 секунд.</td></tr>
</table>

<h2>9. Решение (ADR 0002)</h2>
<p><b>${acc ? (acc.pass ? 'Делаем: включить подсказку на модели.' : 'Не включаем модель: на сайте остаются правила без ИИ.') : 'Принято условно: подсказка на сайте работает на правилах без ИИ; модель включается, только если прогон выполнит критерий приёмки.'}</b> Площадка — локальная модель на сервере клиники: тексты жалоб могут содержать персональные данные (имя, телефон, адрес в свободном поле), поэтому выбор площадки решается не ценой. Отвергнутые варианты: внешний API (дешевле, но данные уходят за рубеж), автозапись моделью (человек должен оставаться в контуре), модель 7b (не хватает памяти сервера). Критерии пересмотра — в файле <code>docs/adr/0002-ai-specialist-hint.md</code>.</p>

<h2>10. Функция на сайте</h2>
<p>Форма записи (владелец и регистратура): поле «Что беспокоит» → через 0,7 с после ввода сайт вызывает <code>POST /api/triage</code> → подсказка с меткой «ИИ» и кнопкой «Показать: Дерматолог». Если владелец записался к врачу подсказанной специальности, подсказка отмечается как принятая. Администратор видит живую статистику на странице «Управление → ИИ-подсказки · ЛЗ 12».</p>
<table><tr><th>Подсказок всего</th><th>ИИ / правила</th><th>Отказов</th><th>С записью</th><th>Принято</th></tr>
<tr><td>${live.total}</td><td>${live.ai ?? 0} / ${live.rules ?? 0}</td><td>${live.abstained ?? 0}</td><td>${live.with_booking ?? 0}</td><td>${live.accepted ?? 0}</td></tr></table>

<h2>11. Раскрытие использования ИИ</h2>
<p>При подготовке работы использовался ИИ-ассистент Claude (Anthropic): код функции и скриптов, черновик набора примеров и черновые эталоны, черновики текстов документов. Тариф API взят со страницы провайдера (ссылка и дата в разделе 7). Все метрики получены запуском скриптов, а не написаны вручную. Проверку фактов, разметку эталонов двумя участниками и итоговое решение выполняет команда: ______________________.</p>
`, generated);
}

const KIND = { manual: 'вручную', generation: 'генерация', verification: 'проверка', editing: 'правка', development: 'разработка' };

export function lab13Report({ scriptRuns, reports, checks, times, savings: s, generated }) {
  const aiRuns = scriptRuns.filter((r) => r.source === 'ai');
  const factRow = (f) => `<td>${f.commits?.count ?? 'нет данных'}</td><td>${f.issues ? `${f.issues.opened} / ${f.issues.closed} / ${f.issues.open_now}` : 'нет данных'}</td>
    <td>${f.pull_requests?.merged ?? 'нет данных'}</td><td>${f.ci ? `${f.ci.runs} (${f.ci.success} / ${f.ci.failure})` : 'нет данных'}</td><td>${f.deployments ?? 'нет данных'}</td>`;
  const semantic = checks.filter((c) => c.verdict === 'semantic').length;
  const style = checks.filter((c) => c.verdict === 'style').length;
  return doc('ЛЗ 13. ИИ-ассистент менеджера проекта — Доктор Хвост', `
<div class="title">
  <h1>ЛЗ 13. Собственный ИИ-ассистент менеджера проекта</h1>
  <p class="meta">Проект: сайт сети ветклиник «Доктор Хвост» · репозиторий nureke077/my-site · ${esc(generated.slice(0, 10))}</p>
  <p class="meta">Артефакты: <code>scripts/weekly_status.py</code>, <code>scripts/pm_prompt.txt</code>, <code>.github/workflows/weekly-status.yml</code>, <code>reports/</code>, <code>docs/lab13/instruction.md</code>; на сайте — «Управление → PM-ассистент · ЛЗ 13».</p>
</div>
${aiRuns.length || reports.some((r) => r.source === 'ai') ? '' : `<div class="warn"><b>Статус.</b> Автоматизация работает на реальных данных репозитория, отчёты за два спринта получены — пока в режиме без модели: в учебной облачной среде, где готовился отчёт, запуск Ollama был недоступен. Черновики с ИИ, журнал проверки, ручные замеры времени и расчёт экономии выполняются на компьютере команды; места для этих данных отмечены жёлтым и заполняются автоматически из базы сайта.</div>`}

<h2>1. Выбор процесса</h2>
<table><tr><th>Кандидат</th><th>Частота</th><th>Ручной работы</th><th>Цена ошибки</th><th>Проверяемость</th><th>Решение</th></tr>
  <tr><td><b>Еженедельный статус-отчёт</b> из GitHub (задачи, коммиты, сборки)</td><td>каждую неделю</td><td>сбор цифр из трёх мест + текст</td><td>низкая: черновик проверяется до отправки</td><td>каждое число сверяется с GitHub</td><td class="ok">выбран</td></tr>
  <tr><td>Оценка сроков задач</td><td>каждый спринт</td><td>много</td><td>высокая</td><td>проверить нельзя до факта</td><td>отклонён: модель уверенно ошибается, а отвечает менеджер</td></tr>
  <tr><td>Протокол встречи</td><td>1–2 раза в неделю</td><td>средне</td><td>средняя</td><td>сложно — нужна запись встречи</td><td>отклонён: записи встреч с заказчиком содержат персональные данные, расшифровка не согласована</td></tr>
  <tr><td>Поиск зависших задач</td><td>каждый день</td><td>мало</td><td>низкая</td><td>легко</td><td>отклонён: решается фильтром на доске, модель не нужна</td></tr>
  <tr><td>Ответы владельцам питомцев в чате клиники</td><td>постоянно</td><td>много</td><td>высокая (медицинские советы)</td><td>сложно</td><td>отклонён: вне зоны менеджера проекта, высокий риск</td></tr>
</table>

<h2>2. Замер процесса вручную</h2>
${s.manualCount ? `<table><tr><th>Замер</th><th>Минут</th><th>Комментарий</th></tr>${times.filter((t) => t.kind === 'manual').map((t, i) => `<tr><td>${i + 1}</td><td>${t.minutes}</td><td>${esc(t.note)}</td></tr>`).join('')}</table>
<p>Среднее: <b>${(Math.round(s.manualAvg * 10) / 10)} мин</b> (${s.manualCount} замеров${s.enoughManual ? '' : ' — нужно не меньше 3'}).</p>` : ''}
${s.enoughManual ? '' : pending('три ручных замера времени на статус-отчёт (до автоматизации)', 'менеджер трижды собирает отчёт вручную с секундомером и записывает минуты на сайте: Управление → PM-ассистент → «Замеры времени» → «Вручную»')}

<h2>3. Устройство: числа считает скрипт, модель пишет текст</h2>
<pre>GitHub API ─► сбор фактов (скрипт: коммиты, задачи, PR, запуски CI, развёртывания)
          ─► словарь фактов (JSON) ─► промпт v1 ─► qwen2.5:3b (Ollama, локально, t=0,2)
          ─► автопроверка: каждое число в тексте должно быть в фактах; оценочные слова; объём
          ─► менеджер проверяет каждое утверждение ─► итоговый текст + раскрытие ИИ ─► спонсору</pre>
<p>Модель не видит сырых данных и ничего не считает: она получает готовые числа. Если модель недоступна (например, в GitHub Actions), собирается отчёт-шаблон без ИИ с теми же числами.</p>

<h2>4. Сбор данных через GitHub API</h2>
<table><tr><th>Показатель</th><th>Откуда</th></tr>
  <tr><td>коммиты за период, число авторов (без имён)</td><td><code>/repos/{repo}/commits?since&amp;until</code></td></tr>
  <tr><td>задачи: открыто и закрыто за период, открыто сейчас, «в работе», заблокировано</td><td><code>/repos/{repo}/issues</code> (метки in progress / blocked)</td></tr>
  <tr><td>слитые pull request</td><td><code>/repos/{repo}/pulls?state=closed</code></td></tr>
  <tr><td>запуски CI: всего, успешных, упавших</td><td><code>/repos/{repo}/actions/runs?created=from..to</code></td></tr>
  <tr><td>развёртывания</td><td>успешные запуски workflow с deploy/pages/release в названии; если таких нет — «нет данных»</td></tr>
</table>

<h2>5. Промпт (версия 1)</h2>
<p>Обязательные части по методике: роль и адресат (помощник менеджера → спонсор), данные как единственный источник фактов, ограничение объёма (120 слов), запрет придумывать числа и даты, запрет оценочных слов, требование писать «нет данных».</p>
<pre>${esc(scriptRuns[0]?.promptTemplate ?? '')}</pre>

<h2>6. Модель и расписание</h2>
<p>Модель: <code>qwen2.5:3b</code> через Ollama (http://localhost:11434), температура 0,2. Расписание: GitHub Actions <code>weekly-status.yml</code>, каждую пятницу в 10:00 UTC (16:00 в Астане) и кнопкой вручную; токен — встроенный <code>GITHUB_TOKEN</code> из секретов, не в коде. В Actions нет локальной модели, поэтому там собирается отчёт без ИИ и сохраняется как артефакт; черновик с ИИ делается на сайте или на компьютере с Ollama.</p>

<h2>7. Прогон на двух прошедших спринтах</h2>
<p>Спринт = неделя. Данные — реальный репозиторий проекта.</p>
<table><tr><th>Период</th><th>Как сделан</th><th>Коммиты</th><th>Задачи: открыто / закрыто / сейчас</th><th>PR</th><th>CI: всего (успех / сбой)</th><th>Развёртывания</th></tr>
${scriptRuns.map((r) => `<tr><td>${esc(r.period[0])} — ${esc(r.period[1])}</td><td>${r.source === 'ai' ? `ИИ, ${esc(r.model)}` : 'без ИИ'}</td>${factRow(r.facts)}</tr>`).join('')}</table>
${scriptRuns.map((r) => `<h3>Отчёт за ${esc(r.period[0])} — ${esc(r.period[1])} (${r.source === 'ai' ? 'черновик ИИ' : 'шаблон без ИИ'})</h3><pre>${esc(r.draft)}</pre>
<p class="meta">Автопроверка: ${r.auto_flags.length ? r.auto_flags.map((x) => `${esc(x.type)} — ${esc(x.value)}`).join('; ') : 'замечаний нет'}.</p>`).join('')}
<div class="note"><b>Что показали реальные данные.</b> В репозитории за оба спринта нет ни одной задачи (issues) и ни одного pull request: работа велась прямыми коммитами в main. Значит, половина статус-отчёта честно говорит «0» или «нет данных». На неделе 16–22 ноября упал 1 запуск CI из 5 — старая публикация на GitHub Pages; отчёт это показывает. Пока команда не ведёт задачи в трекере, ассистенту нечего пересказывать — сначала нужна доска.</div>
${aiRuns.length ? '' : pending('черновики с ИИ за те же два спринта', 'запустить Ollama и выполнить run_lab12_13.bat (или на сайте: PM-ассистент → «Собрать факты и сделать черновик»)')}

<h2>8. Журнал проверки</h2>
${checks.length ? `<table><tr><th>Отчёт</th><th>Что написала модель</th><th>Как на самом деле</th><th>Тип</th></tr>
${checks.map((c) => `<tr><td>#${c.report_id}</td><td>${esc(c.claim)}</td><td>${esc(c.actual)}</td><td>${{ ok: 'верно', semantic: '<b>меняет смысл</b>', style: 'стилистика' }[c.verdict]}</td></tr>`).join('')}</table>
<p>Всего утверждений: ${checks.length}; меняющих смысл: <b>${semantic}</b>; стилистических: ${style}.</p>` : pending('журнал проверки каждого утверждения черновика ИИ', 'на сайте в черновике отчёта — раздел «Журнал проверки»: утверждение, как на самом деле, тип ошибки')}
<p>Типы ошибок: <b>меняющие смысл</b> — придуманные числа, даты, причины, выданные за факт договорённости (из-за них проверка обязательна); <b>стилистические</b> — оценочные слова, лишний объём, неудачные формулировки. Автопроверка ловит числа, которых нет в фактах, и оценочные слова, но не заменяет человека.</p>

<h2>9. Правка промпта и повторный прогон</h2>
${(() => {
  const versions = [...new Set(reports.filter((r) => r.source === 'ai').map((r) => r.prompt_version))];
  return versions.length > 1 ? `<p>Версии промпта в прогонах: ${versions.map(esc).join(', ')} — сравнение доли смысловых ошибок на странице PM-ассистента.</p>`
    : pending('правка промпта по журналу (версия v2) и сравнение доли ошибок v1 → v2', 'по итогам журнала поправить scripts/pm_prompt.txt, записать v2 в scripts/pm_prompt.version и снова сделать черновики за те же два спринта');
})()}

<h2>10. Экономия и окупаемость</h2>
<p><b>Формула:</b> экономия на отчёт = время вручную − (время генерации + время проверки + время правки). Окупаемость = часы на разработку / экономия на отчёт (1 отчёт в неделю).</p>
<table><tr><th>Показатель</th><th>Значение</th></tr>
  <tr><td>Вручную, среднее</td><td>${s.manualAvg !== null ? `${Math.round(s.manualAvg * 10) / 10} мин` : '—'}</td></tr>
  <tr><td>С ассистентом (генерация + проверка + правка), среднее</td><td>${s.aiAvg !== null ? `${Math.round(s.aiAvg * 10) / 10} мин` : '—'}</td></tr>
  <tr><td>Экономия на отчёт</td><td>${s.saving !== null ? `${Math.round(s.saving * 10) / 10} мин` : '—'}</td></tr>
  <tr><td>Время на разработку автоматизации</td><td>${s.devMinutes ? `${Math.round(s.devMinutes / 6) / 10} ч` : '—'}</td></tr>
  <tr><td>Окупаемость</td><td>${s.paybackReports ? `${s.paybackReports} отчётов ≈ ${s.paybackReports} недель` : s.saving !== null && s.saving <= 0 ? 'не окупается: чистой экономии нет' : '—'}</td></tr>
</table>
${s.saving === null ? pending('экономия и срок окупаемости', 'записать на сайте ручные замеры (×3), время проверки и правки по каждому черновику ИИ и часы команды на разработку автоматизации; таблица заполнится сама') : ''}

<h2>11. Вывод</h2>
<p>${s.saving === null ? 'Окончательный вывод об экономии — после замеров. Предварительно, по реальным данным: ' : ''}Автоматизация технически работает на данных репозитория. Её главная польза сейчас — не экономия минут, а то, что отчёт выходит регулярно и все числа в нём проверяемы. Пока в трекере нет задач, отчёт почти пустой, и экономить нечего; сначала нужно вести задачи на доске. ${s.saving !== null && s.saving <= 0 ? 'Чистой экономии нет — и это честный результат.' : ''}${s.paybackReports && s.paybackReports > 15 ? ' Окупаемость выходит за пределы семестра (15 недель).' : ''}</p>

<h2>12. Инструкция для команды</h2>
<p>Полный текст — <code>docs/lab13/instruction.md</code>. Кратко: по пятницам менеджер делает черновик на сайте, проверяет <b>каждое</b> утверждение по GitHub и заносит его в журнал, правит текст, отмечает «факты проверены мной», записывает время. Отвечает за отчёт менеджер проекта; разработчик отвечает за скрипт и версию промпта. Черновик хранится в базе сайта (<code>pm_reports</code>) и в <code>reports/</code>.</p>
<h3>Данные, которые запрещено передавать модели</h3>
<table><tr><th>Данные</th><th>Почему</th></tr>
  <tr><td>Персональные данные владельцев и сотрудников</td><td>Закон РК о ПДн: только с согласия и для заявленной цели; статус-отчёту не нужны</td></tr>
  <tr><td>Медицинские записи пациентов</td><td>конфиденциальные данные клиники, не относятся к статусу проекта</td></tr>
  <tr><td>Токены, пароли, ключи API, .env</td><td>утечка даёт доступ к системам; модель может повторить их в тексте</td></tr>
  <tr><td>Финансы клиники и договоры</td><td>коммерческая тайна заказчика</td></tr>
  <tr><td>Переписка с заказчиком, протоколы встреч</td><td>модель может выдать обсуждение за договорённость</td></tr>
  <tr><td>Оценки работы конкретных людей</td><td>отчёт о проекте не должен становиться оценкой сотрудника</td></tr>
</table>

<h2>13. Раскрытие использования ИИ</h2>
<p>В каждый отчёт автоматически добавляется: «Текст черновика сформулировала языковая модель qwen2.5:3b (локально, Ollama) по данным GitHub API; все числа посчитаны скриптом, модель их не вычисляла. Факты проверил(а): ФИО, дата». Для этой лабораторной: код автоматизации, промпт и черновики документов подготовлены с помощью ИИ-ассистента Claude (Anthropic); факты в отчётах получены из GitHub API скриптом; проверку фактов выполняет команда: ______________________.</p>
`, generated);
}
