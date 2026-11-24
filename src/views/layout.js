// Общий каркас страницы и маленькие повторяющиеся элементы.
import { esc, STATUS, ROLE } from '../util.js';
import { SPECIES_ART, icon } from '../art.js';

export const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
export const badge = (status) => `<span class="badge badge-${esc(status)}">${esc(STATUS[status] ?? status)}</span>`;
export const time = (startsAt) => esc(startsAt.slice(11, 16));

// Фото питомца (если загружено) или иллюстрация вида животного
export function petAvatar(p, size = 'md') {
  const id = p.pet_id ?? p.id;
  const name = esc(p.pet_name ?? p.name);
  const src = p.has_photo ? `/pets/${id}/photo` : `/art/pet/${SPECIES_ART[p.species] ?? 'paw'}.svg`;
  return `<img class="avatar-img pet-${size}" src="${src}" alt="${name}" loading="lazy">`;
}

// Фото врача (загруженное администратором) или нарисованный портрет
export function doctorAvatar(d, size = 'md') {
  return `<img class="avatar-img pet-${size}" src="/doctors/${d.id ?? d.vet_id}/photo" alt="${esc(d.name ?? d.vet_name)}" loading="lazy">`;
}

function nav(user, path) {
  const links = [];
  if (!user || user.role === 'client') links.push(['/#services', 'Услуги'], ['/doctors', 'Врачи'], ['/branches', 'Филиалы']);
  if (!user) links.push(['/#reviews', 'Отзывы']);
  if (user?.role === 'client') links.push(['/cabinet', 'Кабинет']);
  if (['reception', 'vet', 'admin'].includes(user?.role)) links.push(['/queue', 'Очередь'], ['/patients', 'Пациенты']);
  if (['reception', 'admin'].includes(user?.role)) links.push(['/reception/book', 'Записать']);
  if (['reception', 'vet', 'admin'].includes(user?.role)) links.push(['/branches', 'Филиалы']);
  if (user?.role === 'admin') links.push(['/admin', 'Управление']);
  return links.map(([href, text]) => {
    const active = !href.includes('#') && path.startsWith(href);
    return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ''}>${text}</a>`;
  }).join('');
}

export function layout({ title, body, user, csrf, flash, path = '/', map = false, branches = [] }) {
  const account = user
    ? `<span class="who"><b>${esc(user.name)}</b><small>${esc(ROLE[user.role])}</small></span>
       <form method="post" action="/logout">${csrfField(csrf)}<button class="btn btn-ghost btn-sm">Выйти</button></form>`
    : `<a class="btn btn-ghost btn-sm" href="/login">Войти</a>`;
  const cta = !user || user.role === 'client' ? '<a class="btn btn-accent btn-sm" href="/book">Записаться</a>' : '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#ffffff">
<title>${esc(title)} — Доктор Хвост</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Nunito:wght@700;800;900&display=swap">
${map ? '<link rel="stylesheet" href="/static/vendor/leaflet/leaflet.css">' : ''}
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
<div class="topline"><div class="container topline-in">
  <span>${icon('clock')} Два филиала работают круглосуточно</span>
  <a href="tel:+77172200001">${icon('phone')} +7 7172 20 00 01</a>
</div></div>
<header class="topbar">
  <div class="container topbar-in">
    <a class="logo" href="/"><img src="/static/favicon.svg" alt="" width="36" height="36"><span>Доктор Хвост<small>ветклиника · Астана</small></span></a>
    <button class="menu-btn" aria-label="Меню" aria-expanded="false" data-menu>☰</button>
    <nav class="nav" data-nav>${nav(user, path)}<div class="account">${cta}${account}</div></nav>
  </div>
</header>
<main>
${flash ? `<div class="container"><div class="flash flash-${esc(flash.type)}" role="status">${esc(flash.text)}</div></div>` : ''}
${body}
</main>
<footer class="footer">
  <div class="container footer-grid">
    <div>
      <a class="logo logo-footer" href="/"><img src="/static/favicon.svg" alt="" width="36" height="36"><span>Доктор Хвост</span></a>
      <p>Сеть ветеринарных клиник в Астане. Лечим кошек, собак и экзотических животных с 2014 года.</p>
      <p><a href="tel:+77172200001">+7 7172 20 00 01</a><br>hello@khvost.local</p>
    </div>
    <div>
      <h4>Филиалы</h4>
      <ul class="footer-list">${branches.map((b) => `<li><a href="/branches#b${b.id}">${esc(b.name)}</a> <span>${esc(b.address)}</span></li>`).join('')}</ul>
    </div>
    <div>
      <h4>Пациентам</h4>
      <ul class="footer-list">
        <li><a href="/book">Онлайн-запись</a></li><li><a href="/#services">Услуги и цены</a></li>
        <li><a href="/doctors">Врачи</a></li><li><a href="/branches">Карта филиалов</a></li><li><a href="/register">Личный кабинет</a></li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">© Доктор Хвост — учебный проект. Иллюстрации нарисованы для сайта, карта © участники OpenStreetMap.</div>
</footer>
${map ? '<script src="/static/vendor/leaflet/leaflet.js"></script><script src="/static/map.js" defer></script>' : ''}
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

export function message(title, text) {
  return `<section class="card auth"><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="btn" href="javascript:history.back()">Назад</a> <a class="btn btn-ghost" href="/">На главную</a></p></section>`;
}

// Поле выбора времени: слоты подгружает public/app.js
export function slotPicker({ selected = '', exclude = '' } = {}) {
  return `<fieldset class="span-2">
    <legend>Время</legend>
    <div class="slots" data-slots data-selected="${esc(selected)}"${exclude ? ` data-exclude="${esc(exclude)}"` : ''}>
      <noscript><p class="slots-msg">Для выбора времени включите JavaScript.</p></noscript>
    </div>
  </fieldset>`;
}

// Выбор филиала и врача: список врачей фильтруется по филиалу (public/app.js)
export function branchVetFields({ branches, doctors, values = {} }) {
  const sel = (a, b) => (String(a) === String(b) ? ' selected' : '');
  return `
  <label>Филиал<select name="branch_id" data-branch>
    <option value="">Любой филиал</option>
    ${branches.map((b) => `<option value="${b.id}"${sel(b.id, values.branch_id)}>${esc(b.name)} — ${esc(b.address)}</option>`).join('')}
  </select></label>
  <label>Врач<select name="vet_id" required data-vet>${doctors.map((d) => `<option value="${d.id}" data-branch="${d.branch_id}" data-specialty="${esc(d.specialty)}"${sel(d.id, values.vet_id)}>${esc(d.name)}, ${esc(d.specialty)} · ${esc(d.branch_name)}</option>`).join('')}</select></label>`;
}

// ЛЗ 12: поле жалобы и место для подсказки специалиста (заполняет public/app.js)
export function complaintWithHint(values = {}, label = 'Что беспокоит') {
  return `
  <label class="span-2">${label}<textarea name="complaint" rows="3" maxlength="500" data-complaint
    placeholder="Например: чешется и выпадает шерсть на спине">${esc(values.complaint)}</textarea></label>
  <input type="hidden" name="ai_suggestion_id" value="" data-ai-id>
  <div class="ai-hint span-2" data-ai-hint hidden aria-live="polite"></div>`;
}
