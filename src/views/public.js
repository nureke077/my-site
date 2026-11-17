// Главная, вход и регистрация.
import { esc, money, stars, humanDate } from '../util.js';

export function home({ services, doctors, reviews, clinic, user }) {
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
      <li><b>${clinic.rating ? clinic.rating.toFixed(1) : '—'}</b> средняя оценка (${clinic.reviews} отзывов)</li>
      <li><b>${clinic.patients}</b> пациентов в базе</li>
      <li><b>${doctors.length}</b> врача, без выходных</li>
    </ul>
  </div>
</section>

<section id="how" class="section">
  <h2>Как это работает</h2>
  <ol class="steps">
    <li><b>Регистрация</b><span>Создайте кабинет и добавьте питомца с фото.</span></li>
    <li><b>Запись</b><span>Выберите услугу, врача и свободное время по его графику.</span></li>
    <li><b>Приём</b><span>Регистратура отмечает приход, врач ведёт приём.</span></li>
    <li><b>Карта</b><span>Диагноз, рекомендации и напоминания о прививках — в кабинете.</span></li>
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
      <div>
        <h3>${esc(d.name)}</h3>
        <p class="tag">${esc(d.specialty)}</p>
        ${d.reviews ? `<p class="rating" title="Средняя оценка ${d.rating.toFixed(1)} из 5"><span class="stars">${stars(d.rating)}</span> ${d.rating.toFixed(1)} · ${d.reviews} отз.</p>` : ''}
        <p>${esc(d.bio)}</p>
        <p class="muted small">🕘 ${esc(d.hours || 'график уточняйте')}</p>
      </div>
    </article>`).join('')}
  </div>
</section>

${reviews.length ? `
<section id="reviews" class="section">
  <h2>Отзывы</h2>
  <div class="grid grid-3">
    ${reviews.map((r) => `
    <article class="card review">
      <p class="stars" aria-label="Оценка ${r.rating} из 5">${stars(r.rating)}</p>
      <p>«${esc(r.comment)}»</p>
      <p class="muted small">${esc(r.owner_name.split(' ')[0])} о враче ${esc(r.vet_name)} · ${esc(humanDate(r.created_at))}</p>
    </article>`).join('')}
  </div>
</section>` : ''}`;
}

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
