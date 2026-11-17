// Общий каркас страницы и маленькие повторяющиеся элементы.
import { esc, STATUS, ROLE } from '../util.js';

export const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
export const badge = (status) => `<span class="badge badge-${esc(status)}">${esc(STATUS[status] ?? status)}</span>`;
export const time = (startsAt) => esc(startsAt.slice(11, 16));

const SPECIES_ICON = { Собака: '🐕', Кошка: '🐈', Кролик: '🐇', Птица: '🐦', Грызун: '🐹', Хорёк: '🦦' };

// Фото питомца или значок вида животного
export function petAvatar(p, size = 'md') {
  const id = p.pet_id ?? p.id;
  return p.has_photo
    ? `<img class="pet-photo pet-${size}" src="/pets/${id}/photo" alt="${esc(p.pet_name ?? p.name)}" loading="lazy">`
    : `<span class="pet-photo pet-${size} pet-icon" aria-hidden="true">${SPECIES_ICON[p.species] ?? '🐾'}</span>`;
}

function nav(user, path) {
  const links = [['/', 'Главная']];
  if (!user || user.role === 'client') links.push(['/#services', 'Услуги'], ['/#doctors', 'Врачи']);
  if (user?.role === 'client') links.push(['/cabinet', 'Кабинет'], ['/book', 'Записаться']);
  if (['reception', 'vet', 'admin'].includes(user?.role)) links.push(['/queue', 'Очередь'], ['/patients', 'Пациенты']);
  if (['reception', 'admin'].includes(user?.role)) links.push(['/reception/book', 'Записать']);
  if (user?.role === 'admin') links.push(['/admin', 'Управление']);
  return links.map(([href, text]) => {
    const active = href !== '/' && !href.includes('#') && path.startsWith(href);
    return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ''}>${text}</a>`;
  }).join('');
}

export function layout({ title, body, user, csrf, flash, path = '/' }) {
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
    <nav class="nav" data-nav>${nav(user, path)}<div class="account">${account}</div></nav>
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
