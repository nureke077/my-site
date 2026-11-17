// HTML-шаблоны страниц. Все значения из базы проходят через esc().
import { esc, humanDate, money, STATUS, ROLE, SPECIES, SLOTS } from './util.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
const badge = (status) => `<span class="badge badge-${esc(status)}">${esc(STATUS[status] ?? status)}</span>`;
const time = (startsAt) => esc(startsAt.slice(11, 16));

function nav(user) {
  const links = [['/', 'Главная'], ['/#services', 'Услуги'], ['/#doctors', 'Врачи']];
  if (user?.role === 'client') links.push(['/cabinet', 'Кабинет'], ['/book', 'Записаться']);
  if (['reception', 'vet', 'admin'].includes(user?.role)) links.push(['/queue', 'Очередь']);
  if (user?.role === 'admin') links.push(['/admin', 'Сводка']);
  return links.map(([href, text]) => `<a href="${href}">${text}</a>`).join('');
}

export function layout({ title, body, user, csrf, flash }) {
  const account = user
    ? `<span class="who"><b>${esc(user.name)}</b><small>${esc(ROLE[user.role])}</small></span>
       <form method="post" action="/logout">${csrfField(csrf)}<button class="btn btn-ghost btn-sm">Выйти</button></form>`
    : `<a class="btn btn-ghost btn-sm" href="/login">Войти</a><a class="btn btn-sm" href="/register">Регистрация</a>`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Доктор Хвост</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
<header class="topbar">
  <div class="container topbar-in">
    <a class="logo" href="/"><img src="/static/favicon.svg" alt="" width="32" height="32"> Доктор Хвост</a>
    <button class="menu-btn" aria-label="Меню" aria-expanded="false" data-menu>☰</button>
    <nav class="nav" data-nav>${nav(user)}<div class="account">${account}</div></nav>
  </div>
</header>
<main class="container">
${flash ? `<div class="flash flash-${esc(flash.type)}" role="status">${esc(flash.text)}</div>` : ''}
${body}
</main>
<footer class="footer">
  <div class="container footer-in">
    <div><b>Доктор Хвост</b><br>Ветеринарная клиника · ежедневно 9:00–18:00</div>
    <div>г. Алматы, ул. Примерная, 12<br>+7 727 000 00 00</div>
  </div>
</footer>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

// ---------- Главная ----------
export function home({ services, doctors, user }) {
  const cta = user?.role === 'client' ? '/book' : user ? '/queue' : '/register';
  const ctaText = user && user.role !== 'client' ? 'Открыть очередь' : 'Записаться на приём';
  return `
<section class="hero">
  <div>
    <p class="eyebrow">Ветеринарная клиника</p>
    <h1>Заботимся о тех, кто&nbsp;не&nbsp;может пожаловаться словами</h1>
    <p class="lead">Запишитесь онлайн за минуту: выберите врача, свободное время и питомца. Протокол каждого приёма сохраняется в электронной карте.</p>
    <div class="hero-actions">
      <a class="btn btn-lg" href="${cta}">${ctaText}</a>
      <a class="btn btn-ghost btn-lg" href="#services">Цены</a>
    </div>
  </div>
  <div class="hero-card" aria-hidden="true">
    <img class="paw" src="/static/paw.svg" alt="" width="64" height="64">
    <ul>
      <li><b>${doctors.length}</b> врача</li>
      <li><b>${services.length}</b> услуг</li>
      <li><b>9–18</b> без выходных</li>
    </ul>
  </div>
</section>

<section id="how" class="section">
  <h2>Как это работает</h2>
  <ol class="steps">
    <li><b>Регистрация</b><span>Создайте кабинет и добавьте питомца.</span></li>
    <li><b>Запись</b><span>Выберите услугу, врача и свободный слот.</span></li>
    <li><b>Приём</b><span>Регистратура отмечает приход, врач ведёт приём.</span></li>
    <li><b>Карта</b><span>Диагноз и рекомендации появятся в кабинете.</span></li>
  </ol>
</section>

<section id="services" class="section">
  <h2>Услуги и цены</h2>
  <div class="grid grid-3">
    ${services.map((s) => `
    <article class="card service">
      <h3>${esc(s.name)}</h3>
      <p>${esc(s.description)}</p>
      <div class="service-meta"><span class="price">${money(s.price)}</span><span class="muted">${s.duration_min} мин</span></div>
    </article>`).join('')}
  </div>
</section>

<section id="doctors" class="section">
  <h2>Наши врачи</h2>
  <div class="grid grid-3">
    ${doctors.map((d) => `
    <article class="card doctor">
      <div class="avatar">${esc(d.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</div>
      <div><h3>${esc(d.name)}</h3><p class="tag">${esc(d.specialty)}</p><p>${esc(d.bio)}</p></div>
    </article>`).join('')}
  </div>
</section>`;
}

// ---------- Вход и регистрация ----------
export function login({ error, email = '' }) {
  return `
<section class="auth card">
  <h1>Вход</h1>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="post" action="/login" class="form">
    <label>Почта<input type="email" name="email" value="${esc(email)}" required autocomplete="email"></label>
    <label>Пароль<input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn btn-block">Войти</button>
  </form>
  <p class="muted center">Нет кабинета? <a href="/register">Зарегистрируйтесь</a></p>
  <details class="demo">
    <summary>Учебные входы</summary>
    <table>
      <tr><td>admin@khvost.local</td><td>Admin12345</td></tr>
      <tr><td>reception@khvost.local</td><td>Reception12345</td></tr>
      <tr><td>vet@khvost.local</td><td>Vet12345</td></tr>
      <tr><td>client@khvost.local</td><td>Client12345</td></tr>
    </table>
  </details>
</section>`;
}

export function register({ error, values = {} }) {
  return `
<section class="auth card">
  <h1>Регистрация владельца</h1>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="post" action="/register" class="form">
    <label>Имя и фамилия<input name="name" value="${esc(values.name)}" required maxlength="80" autocomplete="name"></label>
    <label>Телефон<input type="tel" name="phone" value="${esc(values.phone)}" required placeholder="+7 7__ ___ __ __" autocomplete="tel"></label>
    <label>Почта<input type="email" name="email" value="${esc(values.email)}" required autocomplete="email"></label>
    <label>Пароль <small>не короче 8 символов</small><input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
    <button class="btn btn-block">Создать кабинет</button>
  </form>
  <p class="muted center">Уже есть кабинет? <a href="/login">Войти</a></p>
</section>`;
}

// ---------- Кабинет владельца ----------
function petForm(csrf) {
  return `
<form method="post" action="/pets" class="form form-inline card">
  ${csrfField(csrf)}
  <h3>Добавить питомца</h3>
  <label>Кличка<input name="name" required maxlength="40"></label>
  <label>Вид<select name="species">${SPECIES.map((s) => `<option>${s}</option>`).join('')}</select></label>
  <label>Порода<input name="breed" maxlength="60"></label>
  <label>Дата рождения<input type="date" name="birth_date"></label>
  <label class="span-2">Особенности (аллергии, хронические болезни)<input name="notes" maxlength="200"></label>
  <button class="btn">Добавить</button>
</form>`;
}

export function cabinet({ user, pets, upcoming, history, csrf, now }) {
  return `
<div class="page-head">
  <div><h1>Здравствуйте, ${esc(user.name.split(' ')[0])}!</h1><p class="muted">Ваши питомцы, записи и история приёмов.</p></div>
  <a class="btn" href="/book">+ Записаться</a>
</div>

<section class="section">
  <h2>Питомцы</h2>
  ${pets.length ? `<div class="grid grid-3">${pets.map((p) => `
    <article class="card pet">
      <div class="pet-ico">${p.species === 'Собака' ? '🐕' : p.species === 'Кошка' ? '🐈' : '🐾'}</div>
      <div><h3>${esc(p.name)}</h3><p class="muted">${esc(p.species)}${p.breed ? `, ${esc(p.breed)}` : ''}${p.birth_date ? ` · род. ${esc(p.birth_date)}` : ''}</p>
      ${p.notes ? `<p class="note">⚠ ${esc(p.notes)}</p>` : ''}</div>
    </article>`).join('')}</div>` : '<p class="empty">Пока нет питомцев — добавьте первого ниже.</p>'}
  ${petForm(csrf)}
</section>

<section class="section">
  <h2>Предстоящие записи</h2>
  ${upcoming.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Когда</th><th>Питомец</th><th>Услуга</th><th>Врач</th><th>Статус</th><th></th></tr></thead>
    <tbody>${upcoming.map((a) => `<tr>
      <td><b>${esc(humanDate(a.starts_at))}</b>, ${time(a.starts_at)}</td>
      <td>${esc(a.pet_name)}</td><td>${esc(a.service_name)}</td><td>${esc(a.vet_name)}</td><td>${badge(a.status)}</td>
      <td>${a.status === 'booked' && a.starts_at > now ? `<form method="post" action="/appointments/${a.id}/cancel" data-confirm="Отменить запись?">${csrfField(csrf)}<button class="btn btn-ghost btn-sm">Отменить</button></form>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="empty">Записей нет.</p>'}
</section>

<section class="section">
  <h2>История приёмов</h2>
  ${history.length ? history.map((h) => `
  <article class="card record">
    <div class="record-head"><b>${esc(humanDate(h.starts_at))}</b> · ${esc(h.pet_name)} · ${esc(h.service_name)} · ${esc(h.vet_name)} ${badge(h.status)}</div>
    ${h.diagnosis ? `<dl>
      <dt>Диагноз</dt><dd>${esc(h.diagnosis)}</dd>
      ${h.treatment ? `<dt>Лечение</dt><dd>${esc(h.treatment)}</dd>` : ''}
      ${h.recommendations ? `<dt>Рекомендации</dt><dd>${esc(h.recommendations)}</dd>` : ''}
      ${h.weight_kg ? `<dt>Вес</dt><dd>${esc(h.weight_kg)} кг</dd>` : ''}
    </dl>` : ''}
  </article>`).join('') : '<p class="empty">Здесь появятся протоколы прошедших приёмов.</p>'}
</section>`;
}

// ---------- Запись ----------
export function book({ pets, services, doctors, values = {}, error, today, maxDate, csrf }) {
  if (!pets.length) {
    return `<h1>Запись на приём</h1><p class="empty">Сначала добавьте питомца в <a href="/cabinet">кабинете</a>.</p>`;
  }
  const sel = (a, b) => (String(a) === String(b) ? ' selected' : '');
  return `
<h1>Запись на приём</h1>
${error ? `<p class="error">${esc(error)}</p>` : ''}
<form method="post" action="/book" class="form card book-form" data-book>
  ${csrfField(csrf)}
  <label>Питомец<select name="pet_id" required>${pets.map((p) => `<option value="${p.id}"${sel(p.id, values.pet_id)}>${esc(p.name)} (${esc(p.species)})</option>`).join('')}</select></label>
  <label>Услуга<select name="service_id" required>${services.map((s) => `<option value="${s.id}"${sel(s.id, values.service_id)}>${esc(s.name)} — ${money(s.price)}</option>`).join('')}</select></label>
  <label>Врач<select name="vet_id" required data-vet>${doctors.map((d) => `<option value="${d.id}"${sel(d.id, values.vet_id)}>${esc(d.name)}, ${esc(d.specialty)}</option>`).join('')}</select></label>
  <label>Дата<input type="date" name="date" required min="${today}" max="${maxDate}" value="${esc(values.date || today)}" data-date></label>
  <fieldset class="span-2">
    <legend>Время</legend>
    <div class="slots" data-slots data-selected="${esc(values.time || '')}">
      <noscript>${SLOTS.map((t) => `<label class="slot"><input type="radio" name="time" value="${t}" required${values.time === t ? ' checked' : ''}><span>${t}</span></label>`).join('')}</noscript>
    </div>
  </fieldset>
  <label class="span-2">Что беспокоит<textarea name="complaint" rows="3" maxlength="500" placeholder="Например: плохо ест, хромает на заднюю лапу">${esc(values.complaint)}</textarea></label>
  <button class="btn btn-lg span-2">Записаться</button>
</form>`;
}

// ---------- Очередь дня ----------
export function queue({ user, date, prev, next, rows, doctors, vetFilter, csrf }) {
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, rows.filter((r) => r.status === k).length]));
  const canReception = ['reception', 'admin'].includes(user.role);
  return `
<div class="page-head">
  <div><h1>Очередь · ${esc(humanDate(date))}</h1>
  <p class="muted">Записано ${counts.booked}, в клинике ${counts.arrived}, принято ${counts.done}, отменено ${counts.cancelled}</p></div>
  <form class="filters" method="get" action="/queue">
    <a class="btn btn-ghost btn-sm" href="/queue?date=${prev}${vetFilter ? `&vet=${vetFilter}` : ''}" aria-label="Предыдущий день">←</a>
    <input type="date" name="date" value="${esc(date)}" onchange="this.form.submit()">
    <a class="btn btn-ghost btn-sm" href="/queue?date=${next}${vetFilter ? `&vet=${vetFilter}` : ''}" aria-label="Следующий день">→</a>
    ${user.role === 'vet' ? '' : `<select name="vet" onchange="this.form.submit()"><option value="">Все врачи</option>${doctors.map((d) => `<option value="${d.id}"${String(d.id) === String(vetFilter) ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`}
  </form>
</div>
${rows.length ? `<div class="table-wrap"><table class="table">
  <thead><tr><th>Время</th><th>Питомец</th><th>Владелец</th><th>Услуга</th><th>Врач</th><th>Статус</th><th>Действия</th></tr></thead>
  <tbody>${rows.map((r) => `<tr class="row-${esc(r.status)}">
    <td><b>${time(r.starts_at)}</b></td>
    <td><a href="/appointments/${r.id}">${esc(r.pet_name)}</a><br><small class="muted">${esc(r.species)}</small></td>
    <td>${esc(r.owner_name)}<br><small class="muted">${esc(r.owner_phone)}</small></td>
    <td>${esc(r.service_name)}</td>
    <td>${esc(r.vet_name)}</td>
    <td>${badge(r.status)}</td>
    <td class="actions">
      ${canReception && r.status === 'booked' ? `<form method="post" action="/appointments/${r.id}/status">${csrfField(csrf)}<input type="hidden" name="status" value="arrived"><button class="btn btn-sm">Пришёл</button></form>` : ''}
      ${canReception && ['booked', 'arrived'].includes(r.status) ? `<form method="post" action="/appointments/${r.id}/status" data-confirm="Отменить запись?">${csrfField(csrf)}<input type="hidden" name="status" value="cancelled"><button class="btn btn-ghost btn-sm">Отмена</button></form>` : ''}
      <a class="btn btn-ghost btn-sm" href="/appointments/${r.id}">${user.role === 'vet' && r.status !== 'done' && r.status !== 'cancelled' ? 'Протокол' : 'Открыть'}</a>
    </td>
  </tr>`).join('')}</tbody></table></div>` : '<p class="empty">На этот день записей нет.</p>'}`;
}

// ---------- Карточка приёма ----------
export function appointment({ user, a, record, history, csrf }) {
  const canWrite = user.role === 'vet' && user.id === a.vet_id && ['booked', 'arrived'].includes(a.status);
  return `
<p><a href="/queue?date=${esc(a.starts_at.slice(0, 10))}">← к очереди</a></p>
<div class="page-head"><div>
  <h1>${esc(a.pet_name)} <small class="muted">${esc(a.species)}${a.breed ? `, ${esc(a.breed)}` : ''}</small></h1>
  <p class="muted">${esc(humanDate(a.starts_at))}, ${time(a.starts_at)} · ${esc(a.service_name)} · ${esc(a.vet_name)} ${badge(a.status)}</p>
</div></div>
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
<section class="section">
  <h2>Прошлые визиты</h2>
  ${history.length ? history.map((h) => `
  <article class="card record">
    <div class="record-head"><b>${esc(humanDate(h.starts_at))}</b> · ${esc(h.service_name)} · ${esc(h.vet_name)}</div>
    <dl><dt>Диагноз</dt><dd>${esc(h.diagnosis)}</dd>${h.treatment ? `<dt>Лечение</dt><dd>${esc(h.treatment)}</dd>` : ''}</dl>
  </article>`).join('') : '<p class="empty">Других завершённых визитов нет.</p>'}
</section>`;
}

// ---------- Сводка администратора ----------
// Форма не может оборачивать <td>, поэтому поля привязаны к ней атрибутом form="…".
function serviceRow(id, action, s, label, csrf) {
  return `<tr>
    <td><input form="${id}" name="name" value="${esc(s.name)}" placeholder="Новая услуга" required maxlength="80" aria-label="Название"></td>
    <td><input form="${id}" type="number" name="price" value="${esc(s.price)}" min="0" step="100" required aria-label="Цена"></td>
    <td><input form="${id}" type="number" name="duration_min" value="${esc(s.duration_min)}" min="10" step="10" required aria-label="Длительность"></td>
    <td><input form="${id}" type="checkbox" name="active" value="1"${s.active ? ' checked' : ''} aria-label="Показывать на сайте"></td>
    <td><form id="${id}" method="post" action="${action}">${csrfField(csrf)}<button class="btn btn-sm">${label}</button></form></td>
  </tr>`;
}

export function admin({ stats, byService, services, log, users, csrf }) {
  const max = Math.max(1, ...byService.map((s) => s.n));
  return `
<h1>Сводка</h1>
<div class="stats">
  <div class="stat"><span>Записей сегодня</span><b>${stats.today}</b></div>
  <div class="stat"><span>На 7 дней вперёд</span><b>${stats.week}</b></div>
  <div class="stat"><span>Выручка за месяц</span><b>${money(stats.revenue)}</b></div>
  <div class="stat"><span>Владельцев</span><b>${stats.clients}</b></div>
</div>

<div class="grid grid-2 section">
  <article class="card">
    <h3>Популярные услуги (30 дней)</h3>
    ${byService.length ? `<ul class="bars">${byService.map((s) => `
      <li><span>${esc(s.name)}</span><div class="bar"><i style="width:${(s.n / max) * 100}%"></i></div><b>${s.n}</b></li>`).join('')}</ul>` : '<p class="empty">Нет данных.</p>'}
  </article>
  <article class="card">
    <h3>Пользователи</h3>
    <div class="table-wrap"><table class="table table-compact">
      <thead><tr><th>Имя</th><th>Почта</th><th>Роль</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(ROLE[u.role])}</td></tr>`).join('')}</tbody>
    </table></div>
  </article>
</div>

<section class="section">
  <h2>Услуги и цены</h2>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Услуга</th><th>Цена, ₸</th><th>Мин</th><th>На сайте</th><th></th></tr></thead>
    <tbody>${services.map((s) => serviceRow(`svc-${s.id}`, `/admin/services/${s.id}`, s, 'Сохранить', csrf)).join('')}
    ${serviceRow('svc-new', '/admin/services', { name: '', price: '', duration_min: 30, active: 1 }, 'Добавить', csrf)}
    </tbody></table></div>
</section>

<section class="section">
  <h2>Журнал действий</h2>
  <div class="table-wrap"><table class="table table-compact">
    <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Подробности</th></tr></thead>
    <tbody>${log.map((l) => `<tr><td>${esc(l.created_at)}</td><td>${esc(l.user_name ?? 'система')}</td><td>${esc(l.action)}</td><td>${esc(l.details)}</td></tr>`).join('')}</tbody>
  </table></div>
</section>`;
}

export function message(title, text) {
  return `<section class="card auth"><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="btn" href="/">На главную</a></p></section>`;
}
