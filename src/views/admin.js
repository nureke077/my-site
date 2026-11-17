// Страницы администратора.
import { esc, money, ROLE, WEEK, ITEM_KIND, humanDate, stars, plural } from '../util.js';
import { csrfField, doctorAvatar } from './layout.js';
import { columnChart, barList, dataTable } from './charts.js';

const TABS = [['/admin', 'Сводка'], ['/admin/reports', 'Отчёты'], ['/admin/staff', 'Сотрудники'], ['/admin/prices', 'Прайс'], ['/admin/backups', 'Резервные копии']];

function tabs(active) {
  return `<nav class="tabs" aria-label="Разделы управления">${TABS.map(([href, text]) =>
    `<a href="${href}"${href === active ? ' class="active" aria-current="page"' : ''}>${text}</a>`).join('')}</nav>`;
}

const shortMoney = (v) => (v >= 1000 ? `${Math.round(v / 1000)} тыс` : String(v));

export function dashboard({ stats, log }) {
  return `
${tabs('/admin')}
<h1>Сводка</h1>
<div class="stats">
  <div class="stat"><span>Записей сегодня</span><b>${stats.today}</b></div>
  <div class="stat"><span>На 7 дней вперёд</span><b>${stats.week}</b></div>
  <div class="stat"><span>Выручка за месяц</span><b>${money(stats.revenue)}</b></div>
  <div class="stat"><span>Средняя оценка</span><b>${stats.rating ? `${stats.rating.toFixed(1)} <small class="stars">${stars(stats.rating)}</small>` : '—'}</b></div>
</div>
${stats.unpaid ? `<p class="reminder">💳 Неоплаченных завершённых приёмов: <b>${stats.unpaid}</b> на ${money(stats.unpaidSum)}. Их видно в очереди с кнопкой «Счёт».</p>` : ''}
<section class="section">
  <h2>Журнал действий</h2>
  <div class="table-wrap"><table class="table table-compact">
    <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Подробности</th></tr></thead>
    <tbody>${log.map((l) => `<tr><td class="nowrap">${esc(l.created_at)}</td><td>${esc(l.user_name ?? 'система')}</td><td>${esc(l.action)}</td><td>${esc(l.details)}</td></tr>`).join('')}</tbody>
  </table></div>
</section>`;
}

export function reports({ from, to, totals, daily, vets, services, branches }) {
  const presets = [[7, '7 дней'], [30, '30 дней'], [90, '90 дней']];
  return `
${tabs('/admin/reports')}
<div class="page-head">
  <div><h1>Отчёты</h1><p class="muted">${esc(humanDate(from))} — ${esc(humanDate(to))}</p></div>
  <form class="filters" method="get" action="/admin/reports">
    ${presets.map(([d, t]) => `<a class="btn btn-ghost btn-sm" href="/admin/reports?days=${d}">${t}</a>`).join('')}
    <input type="date" name="from" value="${esc(from)}" aria-label="С">
    <input type="date" name="to" value="${esc(to)}" aria-label="По">
    <button class="btn btn-sm">Показать</button>
    <a class="btn btn-sm" href="/admin/export.csv?from=${esc(from)}&to=${esc(to)}">⬇ Excel (CSV)</a>
  </form>
</div>
<div class="stats">
  <div class="stat"><span>Выручка (оплачено)</span><b>${money(totals.revenue)}</b></div>
  <div class="stat"><span>Приёмов проведено</span><b>${totals.done}</b></div>
  <div class="stat"><span>Средний чек</span><b>${money(totals.avg)}</b></div>
  <div class="stat"><span>Отмены</span><b>${totals.cancelRate}%</b></div>
</div>

<section class="section card">
  <h2>Выручка по дням</h2>
  ${columnChart({ data: daily.map((d) => ({ label: d.date.slice(8, 10) + '.' + d.date.slice(5, 7), value: d.revenue, tip: `${humanDate(d.date)}: ${money(d.revenue)}, приёмов ${d.visits}` })), format: money, short: shortMoney, ariaLabel: 'Выручка по дням' })}
  ${dataTable(['Дата', 'Приёмов', 'Выручка'], daily.map((d) => [d.date, d.visits, money(d.revenue)]))}
</section>

<section class="section card">
  <h2>Филиалы</h2>
  <p class="muted small">Оплаченная выручка за период</p>
  ${barList({ data: branches.map((b) => ({ label: b.name, value: b.revenue, display: money(b.revenue), sub: `${b.visits} приёмов · средний чек ${money(b.avg)}` })) })}
  ${dataTable(['Филиал', 'Приёмов', 'Выручка', 'Средний чек'], branches.map((b) => [b.name, b.visits, money(b.revenue), money(b.avg)]))}
</section>

<div class="grid grid-2 section">
  <article class="card">
    <h2>Загрузка врачей</h2>
    <p class="muted small">Доля рабочего времени по графику, занятая записями</p>
    ${barList({ data: vets.map((v) => ({ label: v.name, value: v.load, display: `${v.load}%`, sub: `${v.visits} приёмов · ${money(v.revenue)}` })), max: 100 })}
    ${dataTable(['Врач', 'Приёмов', 'Занято, ч', 'По графику, ч', 'Загрузка', 'Выручка'], vets.map((v) => [v.name, v.visits, v.busyH, v.workH, `${v.load}%`, money(v.revenue)]))}
  </article>
  <article class="card">
    <h2>Популярные услуги</h2>
    <p class="muted small">Количество приёмов за период</p>
    ${barList({ data: services.map((s) => ({ label: s.name, value: s.n, sub: money(s.revenue) })) })}
    ${dataTable(['Услуга', 'Приёмов', 'Выручка'], services.map((s) => [s.name, s.n, money(s.revenue)]))}
  </article>
</div>`;
}

export function staffList({ staff, branches, csrf, error, values = {} }) {
  return `
${tabs('/admin/staff')}
<h1>Сотрудники</h1>
<div class="table-wrap"><table class="table">
  <thead><tr><th>Сотрудник</th><th>Почта</th><th>Роль</th><th>График</th><th>Статус</th><th></th></tr></thead>
  <tbody>${staff.map((u) => `<tr class="${u.blocked ? 'row-cancelled' : ''}">
    <td><div class="pet-cell">${u.role === 'vet' ? doctorAvatar(u, 'sm') : ''}<div><b>${esc(u.name)}</b>${u.specialty ? `<br><small class="muted">${esc(u.specialty)} · ${esc(u.branch_name ?? '')}</small>` : ''}</div></div></td>
    <td>${esc(u.email)}</td><td>${esc(ROLE[u.role])}</td>
    <td><small>${esc(u.hours ?? '')}</small></td>
    <td>${u.blocked ? '<span class="badge badge-cancelled">Заблокирован</span>' : '<span class="badge badge-done">Активен</span>'}</td>
    <td><a class="btn btn-ghost btn-sm" href="/admin/staff/${u.id}">Изменить</a></td>
  </tr>`).join('')}</tbody>
</table></div>

<section class="section">
  <form method="post" action="/admin/staff" class="form form-inline card" data-role-form>
    ${csrfField(csrf)}
    <h3>Добавить сотрудника</h3>
    ${error ? `<p class="error span-all">${esc(error)}</p>` : ''}
    <label>Имя и фамилия<input name="name" value="${esc(values.name)}" required maxlength="80"></label>
    <label>Почта<input type="email" name="email" value="${esc(values.email)}" required></label>
    <label>Телефон<input type="tel" name="phone" value="${esc(values.phone)}"></label>
    <label>Роль<select name="role" data-role>${['vet', 'reception', 'admin'].map((r) => `<option value="${r}"${values.role === r ? ' selected' : ''}>${ROLE[r]}</option>`).join('')}</select></label>
    <label data-vet-only>Специализация<input name="specialty" value="${esc(values.specialty)}" maxlength="60" placeholder="Терапевт"></label>
    <label data-vet-only>Филиал<select name="branch_id">${branches.map((b) => `<option value="${b.id}"${String(values.branch_id) === String(b.id) ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
    <label data-vet-only>Пол <small>для портрета</small><select name="gender"><option value="m">Мужской</option><option value="f"${values.gender === 'f' ? ' selected' : ''}>Женский</option></select></label>
    <label>Пароль <small>от 8 символов</small><input type="text" name="password" required minlength="8" autocomplete="new-password"></label>
    <button class="btn">Добавить</button>
  </form>
  <p class="muted small">Новому врачу ставится график Пн–Пт 09:00–18:00 — его можно поменять на странице сотрудника.</p>
</section>`;
}

export function staffEdit({ u, me, schedule, timeOff, futureCount, branches, csrf, today }) {
  const isVet = u.role === 'vet';
  const byDay = new Map(schedule.map((s) => [s.weekday, s]));
  return `
${tabs('/admin/staff')}
<p><a href="/admin/staff">← все сотрудники</a></p>
<div class="page-head"><div class="pet-head">
  ${isVet ? doctorAvatar(u, 'lg') : ''}
  <div><h1>${esc(u.name)}</h1>
  <p class="muted">${esc(ROLE[u.role])} · ${esc(u.email)} ${u.blocked ? '<span class="badge badge-cancelled">Заблокирован</span>' : ''}</p></div>
</div></div>

<div class="grid grid-2">
  <form method="post" action="/admin/staff/${u.id}" class="form card">
    ${csrfField(csrf)}
    <h3>Данные</h3>
    <label>Имя и фамилия<input name="name" value="${esc(u.name)}" required maxlength="80"></label>
    <label>Телефон<input type="tel" name="phone" value="${esc(u.phone)}"></label>
    ${isVet ? `
    <label>Специализация<input name="specialty" value="${esc(u.specialty)}" required maxlength="60"></label>
    <label>Филиал<select name="branch_id">${branches.map((b) => `<option value="${b.id}"${b.id === u.branch_id ? ' selected' : ''}>${esc(b.name)} — ${esc(b.address)}</option>`).join('')}</select></label>
    <label>Стаж, лет<input type="number" name="experience_years" value="${esc(u.experience_years ?? '')}" min="0" max="60"></label>
    <label>Пол <small>для нарисованного портрета</small><select name="gender"><option value="m">Мужской</option><option value="f"${u.gender === 'f' ? ' selected' : ''}>Женский</option></select></label>
    <label>О враче (видно на сайте)<textarea name="bio" rows="3" maxlength="300">${esc(u.bio)}</textarea></label>` : ''}
    <button class="btn">Сохранить</button>
  </form>

  <div class="stack">
    ${isVet ? `
    <form method="post" action="/admin/staff/${u.id}/photo" class="form card" enctype="multipart/form-data">
      ${csrfField(csrf)}
      <h3>Фото на сайте</h3>
      <div class="photo-row">${doctorAvatar(u, 'lg')}<p class="muted small">${u.has_photo ? 'Загружено фото.' : 'Сейчас показан нарисованный портрет.'} Подойдёт квадратное фото JPG, PNG или WebP до 2 МБ.</p></div>
      <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>
      <div class="row-actions"><button class="btn btn-ghost">Загрузить фото</button>
      ${u.has_photo ? `<button class="btn btn-ghost" formaction="/admin/staff/${u.id}/photo/delete" formnovalidate>Вернуть портрет</button>` : ''}</div>
    </form>` : ''}
    <form method="post" action="/admin/staff/${u.id}/password" class="form card">
      ${csrfField(csrf)}
      <h3>Новый пароль</h3>
      <label>Пароль <small>от 8 символов, все входы сотрудника будут закрыты</small><input type="text" name="password" required minlength="8" autocomplete="new-password"></label>
      <button class="btn btn-ghost">Сменить пароль</button>
    </form>
    ${u.id === me ? '<p class="muted card">Себя заблокировать нельзя.</p>' : `
    <form method="post" action="/admin/staff/${u.id}/block" class="card" data-confirm="${u.blocked ? 'Разблокировать сотрудника?' : `Заблокировать сотрудника?${futureCount ? ` У него ${futureCount} ${plural(futureCount, 'будущая запись', 'будущие записи', 'будущих записей')} — перенесите их.` : ''}`}">
      ${csrfField(csrf)}
      <h3>${u.blocked ? 'Доступ закрыт' : 'Доступ'}</h3>
      ${futureCount && !u.blocked ? `<p class="note">У врача ${futureCount} ${plural(futureCount, 'будущая запись', 'будущие записи', 'будущих записей')}. После блокировки на него нельзя будет записаться.</p>` : ''}
      <button class="btn ${u.blocked ? '' : 'btn-danger'}">${u.blocked ? 'Разблокировать' : 'Заблокировать'}</button>
    </form>`}
  </div>
</div>

${isVet ? `
<section class="section grid grid-2">
  <form method="post" action="/admin/staff/${u.id}/schedule" class="card">
    ${csrfField(csrf)}
    <h3>График приёма</h3>
    <table class="table table-compact schedule">
      <thead><tr><th>День</th><th>Работает</th><th>С</th><th>До</th></tr></thead>
      <tbody>${WEEK.map(([d, label]) => {
        const s = byDay.get(d);
        return `<tr><td><b>${label}</b></td>
          <td><input type="checkbox" name="on_${d}" value="1"${s ? ' checked' : ''} aria-label="${label}: работает"></td>
          <td><input type="time" name="start_${d}" value="${esc(s?.start_time ?? '09:00')}" step="1800" aria-label="${label}: с"></td>
          <td><input type="time" name="end_${d}" value="${esc(s?.end_time ?? '18:00')}" step="1800" aria-label="${label}: до"></td></tr>`;
      }).join('')}</tbody>
    </table>
    <button class="btn">Сохранить график</button>
  </form>

  <div class="card">
    <h3>Отпуска и выходные</h3>
    ${timeOff.length ? `<ul class="plain">${timeOff.map((t) => `
      <li><span>${esc(humanDate(t.date_from))}${t.date_to !== t.date_from ? ` — ${esc(humanDate(t.date_to))}` : ''}${t.reason ? ` · ${esc(t.reason)}` : ''}</span>
      <form method="post" action="/admin/staff/${u.id}/timeoff/${t.id}/delete">${csrfField(csrf)}<button class="btn btn-ghost btn-sm" aria-label="Удалить">✕</button></form></li>`).join('')}</ul>` : '<p class="muted">Не запланировано.</p>'}
    <form method="post" action="/admin/staff/${u.id}/timeoff" class="form form-row">
      ${csrfField(csrf)}
      <label>С<input type="date" name="date_from" min="${today}" required></label>
      <label>По<input type="date" name="date_to" min="${today}" required></label>
      <label class="grow">Причина<input name="reason" maxlength="60" placeholder="Отпуск"></label>
      <button class="btn btn-ghost">Добавить</button>
    </form>
  </div>
</section>` : ''}`;
}

// Форма не может оборачивать <td>, поэтому поля привязаны к ней атрибутом form="…".
function serviceRow(id, action, s, label, csrf) {
  return `<tr>
    <td><input form="${id}" name="name" value="${esc(s.name)}" placeholder="Новая услуга" required maxlength="80" aria-label="Название"></td>
    <td><input form="${id}" type="number" name="price" value="${esc(s.price)}" min="0" step="100" required aria-label="Цена"></td>
    <td><input form="${id}" type="number" name="duration_min" value="${esc(s.duration_min)}" min="30" step="30" required aria-label="Длительность"></td>
    <td class="center"><input form="${id}" type="checkbox" name="is_vaccination" value="1"${s.is_vaccination ? ' checked' : ''} aria-label="Это вакцинация"></td>
    <td class="center"><input form="${id}" type="checkbox" name="active" value="1"${s.active ? ' checked' : ''} aria-label="Показывать на сайте"></td>
    <td><form id="${id}" method="post" action="${action}">${csrfField(csrf)}<button class="btn btn-sm">${label}</button></form></td>
  </tr>`;
}

function itemRow(id, action, i, label, csrf) {
  return `<tr>
    <td><input form="${id}" name="name" value="${esc(i.name)}" placeholder="Новая позиция" required maxlength="80" aria-label="Название"></td>
    <td><select form="${id}" name="kind" aria-label="Тип">${Object.entries(ITEM_KIND).map(([k, v]) => `<option value="${k}"${i.kind === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
    <td><input form="${id}" type="number" name="price" value="${esc(i.price)}" min="0" step="100" required aria-label="Цена"></td>
    <td class="center"><input form="${id}" type="checkbox" name="active" value="1"${i.active ? ' checked' : ''} aria-label="Доступно"></td>
    <td><form id="${id}" method="post" action="${action}">${csrfField(csrf)}<button class="btn btn-sm">${label}</button></form></td>
  </tr>`;
}

export function prices({ services, items, csrf }) {
  return `
${tabs('/admin/prices')}
<h1>Прайс</h1>
<section class="section">
  <h2>Услуги</h2>
  <p class="muted small">Изменение цены не меняет уже созданные записи. «Вакцинация» — по таким приёмам кабинет напоминает о прививках.</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Услуга</th><th>Цена, ₸</th><th>Мин</th><th>Вакцинация</th><th>На сайте</th><th></th></tr></thead>
    <tbody>${services.map((s) => serviceRow(`svc-${s.id}`, `/admin/services/${s.id}`, s, 'Сохранить', csrf)).join('')}
    ${serviceRow('svc-new', '/admin/services', { name: '', price: '', duration_min: 30, active: 1 }, 'Добавить', csrf)}
    </tbody></table></div>
</section>
<section class="section">
  <h2>Препараты и материалы</h2>
  <p class="muted small">Врач или регистратура добавляют их в счёт приёма.</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Название</th><th>Тип</th><th>Цена, ₸</th><th>Доступно</th><th></th></tr></thead>
    <tbody>${items.map((i) => itemRow(`item-${i.id}`, `/admin/items/${i.id}`, i, 'Сохранить', csrf)).join('')}
    ${itemRow('item-new', '/admin/items', { name: '', kind: 'drug', price: '', active: 1 }, 'Добавить', csrf)}
    </tbody></table></div>
</section>`;
}

export function backups({ files, dir, csrf }) {
  const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.ceil(b / 1024)} КБ`);
  return `
${tabs('/admin/backups')}
<div class="page-head">
  <div><h1>Резервные копии</h1><p class="muted">Папка: <code>${esc(dir)}</code>. Хранятся последние 30 копий.</p></div>
  <form method="post" action="/admin/backups">${csrfField(csrf)}<button class="btn">Создать копию сейчас</button></form>
</div>
${files.length ? `<div class="table-wrap"><table class="table">
  <thead><tr><th>Файл</th><th>Создан</th><th>Размер</th><th></th></tr></thead>
  <tbody>${files.map((f) => `<tr><td><code>${esc(f.name)}</code></td><td>${esc(f.created)}</td><td>${size(f.size)}</td>
    <td><a class="btn btn-ghost btn-sm" href="/admin/backups/${encodeURIComponent(f.name)}" download>Скачать</a></td></tr>`).join('')}</tbody>
</table></div>` : '<p class="empty">Копий пока нет.</p>'}
<section class="section card">
  <h3>Как восстановить базу из копии</h3>
  <ol>
    <li>Остановите сайт (Ctrl + C в окне сервера).</li>
    <li>Удалите файлы <code>data/clinic.db</code>, <code>data/clinic.db-wal</code> и <code>data/clinic.db-shm</code>, если они есть.</li>
    <li>Скопируйте нужную копию в <code>data/</code> и переименуйте её в <code>clinic.db</code>.</li>
    <li>Запустите сайт снова.</li>
  </ol>
</section>`;
}
