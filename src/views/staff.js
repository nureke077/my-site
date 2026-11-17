// Страницы персонала: очередь, приём, счёт и чек, поиск и карта пациента, запись по телефону.
import { esc, humanDate, money, STATUS, SPECIES, PAYMENT, ITEM_KIND } from '../util.js';
import { csrfField, badge, time, petAvatar, slotPicker, branchVetFields } from './layout.js';

const canReception = (u) => ['reception', 'admin'].includes(u.role);

export function queue({ user, date, prev, next, rows, doctors, branches, vetFilter, branchFilter, csrf }) {
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, rows.filter((r) => r.status === k).length]));
  const q = (d) => `/queue?date=${d}${vetFilter ? `&vet=${vetFilter}` : ''}${branchFilter ? `&branch=${branchFilter}` : ''}`;
  return `
<div class="page-head">
  <div><h1>Очередь · ${esc(humanDate(date))}</h1>
  <p class="muted">Записано ${counts.booked}, в клинике ${counts.arrived}, принято ${counts.done}, отменено ${counts.cancelled}</p></div>
  <form class="filters" method="get" action="/queue">
    <a class="btn btn-ghost btn-sm" href="${q(prev)}" aria-label="Предыдущий день">←</a>
    <input type="date" name="date" value="${esc(date)}" data-autosubmit-field aria-label="Дата">
    <a class="btn btn-ghost btn-sm" href="${q(next)}" aria-label="Следующий день">→</a>
    ${user.role === 'vet' ? '' : `<select name="branch" data-autosubmit-field aria-label="Филиал"><option value="">Все филиалы</option>${branches.map((b) => `<option value="${b.id}"${String(b.id) === String(branchFilter) ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    <select name="vet" data-autosubmit-field aria-label="Врач"><option value="">Все врачи</option>${doctors.filter((d) => !branchFilter || d.branch_id === Number(branchFilter)).map((d) => `<option value="${d.id}"${String(d.id) === String(vetFilter) ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`}
    ${canReception(user) ? `<a class="btn btn-sm" href="/reception/book?date=${esc(date)}">+ Записать</a>` : ''}
  </form>
</div>
${rows.length ? `<div class="table-wrap"><table class="table">
  <thead><tr><th>Время</th><th>Питомец</th><th>Владелец</th><th>Услуга</th><th>Врач и филиал</th><th>Статус</th><th>Действия</th></tr></thead>
  <tbody>${rows.map((r) => `<tr class="row-${esc(r.status)}">
    <td><b>${time(r.starts_at)}</b><br><small class="muted">${r.duration_min} мин</small></td>
    <td><div class="pet-cell">${petAvatar(r, 'sm')}<div><a href="/patients/${r.pet_id}">${esc(r.pet_name)}</a><br><small class="muted">${esc(r.species)}</small></div></div></td>
    <td>${esc(r.owner_name)}<br><small class="muted">${esc(r.owner_phone)}</small></td>
    <td>${esc(r.service_name)}</td>
    <td>${esc(r.vet_name)}<br><small class="muted">${esc(r.branch_name ?? '')}</small></td>
    <td>${badge(r.status)}${r.paid_at ? '<br><span class="badge badge-paid">Оплачено</span>' : ''}</td>
    <td class="actions">
      ${canReception(user) && r.status === 'booked' ? `<form method="post" action="/appointments/${r.id}/status">${csrfField(csrf)}<input type="hidden" name="status" value="arrived"><button class="btn btn-sm">Пришёл</button></form>` : ''}
      ${canReception(user) && ['booked', 'arrived'].includes(r.status) ? `<form method="post" action="/appointments/${r.id}/status" data-confirm="Отменить запись?">${csrfField(csrf)}<input type="hidden" name="status" value="cancelled"><button class="btn btn-ghost btn-sm">Отмена</button></form>` : ''}
      <a class="btn btn-ghost btn-sm" href="/appointments/${r.id}">${user.role === 'vet' && ['booked', 'arrived'].includes(r.status) ? 'Протокол' : canReception(user) && r.status === 'done' && !r.paid_at ? 'Счёт' : 'Открыть'}</a>
    </td>
  </tr>`).join('')}</tbody></table></div>` : '<p class="empty">На этот день записей нет.</p>'}`;
}

function invoice({ user, a, lines, items, total, csrf }) {
  const editable = a.status !== 'cancelled' && !a.paid_at;
  return `
<article class="card">
  <h3>Счёт ${a.paid_at ? '<span class="badge badge-paid">Оплачено</span>' : ''}</h3>
  <table class="table table-compact invoice">
    <thead><tr><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th>${editable ? '<th></th>' : ''}</tr></thead>
    <tbody>
      <tr><td>${esc(a.service_name)}</td><td>1</td><td>${money(a.price)}</td><td>${money(a.price)}</td>${editable ? '<td></td>' : ''}</tr>
      ${lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(l.price * l.qty)}</td>
        ${editable ? `<td><form method="post" action="/appointments/${a.id}/lines/${l.id}/delete">${csrfField(csrf)}<button class="btn btn-ghost btn-sm" aria-label="Убрать ${esc(l.name)}">✕</button></form></td>` : ''}</tr>`).join('')}
    </tbody>
    <tfoot><tr><th colspan="3">Итого</th><th>${money(total)}</th>${editable ? '<th></th>' : ''}</tr></tfoot>
  </table>
  ${editable ? `
  <form method="post" action="/appointments/${a.id}/lines" class="form form-row">
    ${csrfField(csrf)}
    <label class="grow">Препарат или материал<select name="item_id" required>
      ${items.map((i) => `<option value="${i.id}">${esc(i.name)} — ${money(i.price)} (${esc(ITEM_KIND[i.kind])})</option>`).join('')}
    </select></label>
    <label class="qty">Кол-во<input type="number" name="qty" value="1" min="1" max="99" required></label>
    <button class="btn btn-ghost">Добавить</button>
  </form>` : ''}
  ${a.paid_at ? `<p class="muted">Оплачено ${esc(a.paid_at.slice(0, 16))} · ${esc(PAYMENT[a.payment_method] ?? '')}</p>` : ''}
  <div class="row-actions">
    ${canReception(user) && editable && a.status !== 'booked' ? `
    <form method="post" action="/appointments/${a.id}/pay" class="form-row" data-confirm="Принять оплату ${money(total)}?">
      ${csrfField(csrf)}
      <select name="method" aria-label="Способ оплаты">${Object.entries(PAYMENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <button class="btn">Принять оплату</button>
    </form>` : ''}
    <a class="btn btn-ghost" href="/appointments/${a.id}/receipt" target="_blank">🖨 ${a.paid_at ? 'Чек' : 'Счёт для печати'}</a>
  </div>
</article>`;
}

export function appointment({ user, a, record, history, lines, items, total, csrf }) {
  const canWrite = user.role === 'vet' && user.id === a.vet_id && ['booked', 'arrived'].includes(a.status);
  return `
<p><a href="/queue?date=${esc(a.starts_at.slice(0, 10))}">← к очереди</a></p>
<div class="page-head"><div class="pet-head">
  ${petAvatar(a, 'lg')}
  <div>
    <h1>${esc(a.pet_name)} <small class="muted">${esc(a.species)}${a.breed ? `, ${esc(a.breed)}` : ''}</small></h1>
    <p class="muted">${esc(humanDate(a.starts_at))}, ${time(a.starts_at)} · ${esc(a.service_name)} · ${esc(a.vet_name)} · ${esc(a.branch_name ?? '')} ${badge(a.status)}</p>
  </div>
</div><a class="btn btn-ghost" href="/patients/${a.pet_id}">Медкарта</a></div>
<div class="grid grid-2">
  <article class="card">
    <h3>Пациент и владелец</h3>
    <dl>
      <dt>Владелец</dt><dd>${esc(a.owner_name)}, ${esc(a.owner_phone)}</dd>
      ${a.birth_date ? `<dt>Дата рождения</dt><dd>${esc(a.birth_date)}</dd>` : ''}
      ${a.notes ? `<dt>Особенности</dt><dd class="note">⚠ ${esc(a.notes)}</dd>` : ''}
      <dt>Жалоба</dt><dd>${esc(a.complaint || '—')}</dd>
    </dl>
  </article>
  <article class="card">
    <h3>Протокол приёма</h3>
    ${record ? `<dl>
      <dt>Диагноз</dt><dd>${esc(record.diagnosis)}</dd>
      <dt>Лечение</dt><dd>${esc(record.treatment || '—')}</dd>
      <dt>Рекомендации</dt><dd>${esc(record.recommendations || '—')}</dd>
      ${record.weight_kg ? `<dt>Вес</dt><dd>${esc(record.weight_kg)} кг</dd>` : ''}
    </dl>` : canWrite ? `
    <form method="post" action="/appointments/${a.id}/record" class="form">
      ${csrfField(csrf)}
      <label>Вес, кг<input type="number" name="weight_kg" step="0.1" min="0" max="200"></label>
      <label>Диагноз<input name="diagnosis" required maxlength="200"></label>
      <label>Лечение<textarea name="treatment" rows="3" maxlength="1000"></textarea></label>
      <label>Рекомендации<textarea name="recommendations" rows="3" maxlength="1000"></textarea></label>
      <button class="btn">Сохранить и завершить приём</button>
    </form>` : '<p class="empty">Протокол ещё не заполнен.</p>'}
  </article>
</div>
<div class="section">${invoice({ user, a, lines, items, total, csrf })}</div>
<section class="section">
  <h2>Прошлые визиты</h2>
  ${history.length ? history.map((h) => `
  <article class="card record">
    <div class="record-head"><b>${esc(humanDate(h.starts_at))}</b> · ${esc(h.service_name)} · ${esc(h.vet_name)}</div>
    <dl><dt>Диагноз</dt><dd>${esc(h.diagnosis)}</dd>${h.treatment ? `<dt>Лечение</dt><dd>${esc(h.treatment)}</dd>` : ''}</dl>
  </article>`).join('') : '<p class="empty">Других завершённых визитов нет.</p>'}
</section>`;
}

// Отдельная страница без шапки — для печати
export function receipt({ a, lines, total }) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${a.paid_at ? 'Чек' : 'Счёт'} №${a.id} — Доктор Хвост</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; color: #111; background: #fff; max-width: 380px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 18px; text-align: center; margin: 0; }
  .c { text-align: center; } .m { color: #555; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { padding: 4px 0; vertical-align: top; } td:last-child { text-align: right; white-space: nowrap; }
  .line { border-top: 1px dashed #999; margin: 10px 0; }
  .total td { font-weight: 700; font-size: 16px; }
  button { margin-top: 16px; width: 100%; padding: 10px; font: inherit; cursor: pointer; }
  @media print { button { display: none; } body { margin: 0; } }
</style></head><body>
<h1>Доктор Хвост</h1>
<p class="c m">Ветеринарная клиника, филиал «${esc(a.branch_name ?? '')}»<br>г. Астана, ${esc(a.branch_address ?? '')}</p>
<div class="line"></div>
<p><b>${a.paid_at ? 'Кассовый чек' : 'Счёт'} №${a.id}</b><br>
Дата приёма: ${esc(a.starts_at.replace('T', ' '))}<br>
Пациент: ${esc(a.pet_name)} (${esc(a.species)})<br>
Владелец: ${esc(a.owner_name)}<br>
Врач: ${esc(a.vet_name)}</p>
<div class="line"></div>
<table>
  <tr><td>${esc(a.service_name)}</td><td>${money(a.price)}</td></tr>
  ${lines.map((l) => `<tr><td>${esc(l.name)}${l.qty > 1 ? ` × ${l.qty}` : ''}</td><td>${money(l.price * l.qty)}</td></tr>`).join('')}
  <tr class="total"><td>ИТОГО</td><td>${money(total)}</td></tr>
</table>
<div class="line"></div>
<p class="c">${a.paid_at ? `Оплачено: ${esc(PAYMENT[a.payment_method] ?? '')}<br>${esc(a.paid_at.slice(0, 16))}` : 'Не оплачено'}</p>
<p class="c m">Спасибо, что доверяете нам!</p>
<button onclick="print()">Печать</button>
</body></html>`;
}

export function patients({ q, rows }) {
  return `
<h1>Пациенты</h1>
<form method="get" action="/patients" class="search">
  <input type="search" name="q" value="${esc(q)}" placeholder="Кличка, имя владельца или телефон" aria-label="Поиск" autofocus>
  <button class="btn">Найти</button>
</form>
${q && !rows.length ? '<p class="empty">Ничего не найдено. Проверьте написание или ищите по последним цифрам телефона.</p>' : ''}
${rows.length ? `<p class="muted">${q ? `Найдено: ${rows.length}` : 'Недавние пациенты'}</p>
<div class="table-wrap"><table class="table">
  <thead><tr><th>Пациент</th><th>Владелец</th><th>Визитов</th><th>Последний визит</th></tr></thead>
  <tbody>${rows.map((p) => `<tr>
    <td><div class="pet-cell">${petAvatar(p, 'sm')}<div><a href="/patients/${p.id}"><b>${esc(p.name)}</b></a><br><small class="muted">${esc(p.species)}${p.breed ? `, ${esc(p.breed)}` : ''}</small></div></div></td>
    <td>${esc(p.owner_name)}<br><small class="muted">${esc(p.owner_phone)}</small></td>
    <td>${p.visits}</td>
    <td>${p.last_visit ? esc(humanDate(p.last_visit)) : '—'}</td>
  </tr>`).join('')}</tbody></table></div>` : ''}`;
}

export function patientCard({ user, p, visits, weights, lastVacc }) {
  return `
<p><a href="/patients">← к поиску</a></p>
<div class="page-head"><div class="pet-head">
  ${petAvatar(p, 'lg')}
  <div>
    <h1>${esc(p.name)} <small class="muted">${esc(p.species)}${p.breed ? `, ${esc(p.breed)}` : ''}</small></h1>
    <p class="muted">Владелец: ${esc(p.owner_name)}, ${esc(p.owner_phone)}${p.phone_only ? ' · записан по телефону' : ''}</p>
  </div>
</div>${canReception(user) ? `<a class="btn" href="/reception/book?phone=${encodeURIComponent(p.owner_phone ?? '')}&pet_id=${p.id}">+ Записать</a>` : ''}</div>
<div class="stats">
  <div class="stat"><span>Дата рождения</span><b class="b-sm">${esc(p.birth_date ?? '—')}</b></div>
  <div class="stat"><span>Визитов</span><b>${visits.filter((v) => v.status === 'done').length}</b></div>
  <div class="stat"><span>Последний вес</span><b class="b-sm">${weights.length ? `${esc(weights.at(-1).weight_kg)} кг` : '—'}</b></div>
  <div class="stat"><span>Последняя прививка</span><b class="b-sm">${lastVacc ? esc(humanDate(lastVacc)) : 'нет'}</b></div>
</div>
${p.notes ? `<p class="reminder reminder-gap">⚠ ${esc(p.notes)}</p>` : ''}
<section class="section">
  <h2>История</h2>
  ${visits.length ? visits.map((v) => `
  <article class="card record">
    <div class="record-head"><a href="/appointments/${v.id}"><b>${esc(humanDate(v.starts_at))}</b>, ${time(v.starts_at)}</a> · ${esc(v.service_name)} · ${esc(v.vet_name)} · ${esc(v.branch_name ?? '')} ${badge(v.status)}</div>
    ${v.diagnosis ? `<dl>
      <dt>Диагноз</dt><dd>${esc(v.diagnosis)}</dd>
      ${v.treatment ? `<dt>Лечение</dt><dd>${esc(v.treatment)}</dd>` : ''}
      ${v.recommendations ? `<dt>Рекомендации</dt><dd>${esc(v.recommendations)}</dd>` : ''}
      ${v.weight_kg ? `<dt>Вес</dt><dd>${esc(v.weight_kg)} кг</dd>` : ''}
    </dl>` : v.complaint ? `<p class="muted">Жалоба: ${esc(v.complaint)}</p>` : ''}
  </article>`).join('') : '<p class="empty">Визитов пока нет.</p>'}
</section>`;
}

export function receptionBook({ phone, owner, pets, services, doctors, branches, values = {}, error, today, maxDate, csrf }) {
  const sel = (a, b) => (String(a) === String(b) ? ' selected' : '');
  return `
<h1>Запись по телефону</h1>
<form method="get" action="/reception/book" class="search">
  <input type="tel" name="phone" value="${esc(phone)}" placeholder="Телефон владельца" aria-label="Телефон владельца" required>
  <input type="hidden" name="date" value="${esc(values.date ?? '')}">
  <button class="btn btn-ghost">Найти владельца</button>
</form>
${phone ? `<p class="muted">${owner ? `Найден владелец: <b>${esc(owner.name)}</b>, ${esc(owner.phone)}.` : 'Владелец с таким телефоном не найден — будет создана новая карта.'}</p>` : ''}
${error ? `<p class="error">${esc(error)}</p>` : ''}
${phone ? `
<form method="post" action="/reception/book" class="form card book-form" data-book>
  ${csrfField(csrf)}
  <input type="hidden" name="phone" value="${esc(phone)}">
  ${owner ? '' : `<label class="span-2">Имя владельца<input name="owner_name" value="${esc(values.owner_name)}" required maxlength="80"></label>`}
  <label>Питомец<select name="pet_id" data-pet-select>
    ${pets.map((p) => `<option value="${p.id}"${sel(p.id, values.pet_id)}>${esc(p.name)} (${esc(p.species)})</option>`).join('')}
    <option value="new"${values.pet_id === 'new' || !pets.length ? ' selected' : ''}>+ Новый питомец</option>
  </select></label>
  <div class="new-pet span-2" data-new-pet>
    <label>Кличка<input name="pet_name" value="${esc(values.pet_name)}" maxlength="40"></label>
    <label>Вид<select name="species">${SPECIES.map((s) => `<option${sel(s, values.species)}>${s}</option>`).join('')}</select></label>
  </div>
  <label>Услуга<select name="service_id" required data-service>${services.map((s) => `<option value="${s.id}"${sel(s.id, values.service_id)}>${esc(s.name)} — ${money(s.price)}, ${s.duration_min} мин</option>`).join('')}</select></label>
  ${branchVetFields({ branches, doctors, values })}
  <label>Дата<input type="date" name="date" required min="${today}" max="${maxDate}" value="${esc(values.date || today)}" data-date></label>
  ${slotPicker({ selected: values.time })}
  <label class="span-2">Жалоба<textarea name="complaint" rows="2" maxlength="500">${esc(values.complaint)}</textarea></label>
  <button class="btn btn-lg span-2">Записать</button>
</form>` : ''}`;
}
