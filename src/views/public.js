// Главная, филиалы, врачи, вход и регистрация.
import { esc, money, stars, humanDate, plural } from '../util.js';
import { icon } from '../art.js';
import { doctorAvatar } from './layout.js';

const PET_KINDS = [['cat', 'Кошки'], ['dog', 'Собаки'], ['rabbit', 'Кролики'], ['bird', 'Птицы'], ['rodent', 'Грызуны'], ['ferret', 'Хорьки']];

function branchBadges(b) {
  return [
    b.is_24h ? `<span class="chip chip-accent">${icon('moon')} 24/7</span>` : '',
    b.has_surgery ? `<span class="chip">${icon('scalpel')} Хирургия</span>` : '',
    b.has_lab ? `<span class="chip">${icon('flask')} Лаборатория</span>` : '',
    b.has_hospital ? `<span class="chip">${icon('bed')} Стационар</span>` : '',
  ].join('');
}

// Данные для карты: только то, что нужно маркерам
export function mapData(branches) {
  return esc(JSON.stringify(branches.map((b) => ({
    id: b.id, name: b.name, address: b.address, hours: b.hours, phone: b.phone, lat: b.lat, lng: b.lng, h24: !!b.is_24h,
  }))));
}

function doctorCard(d) {
  return `
  <article class="doc-card">
    ${doctorAvatar(d, 'xl')}
    <h3>${esc(d.name)}</h3>
    <p class="doc-spec">${esc(d.specialty)}${d.experience_years ? ` · стаж ${d.experience_years} ${plural(d.experience_years, 'год', 'года', 'лет')}` : ''}</p>
    ${d.reviews ? `<p class="rating"><span class="stars">${stars(d.rating)}</span> <b>${d.rating.toFixed(1)}</b> <span class="muted">· ${d.reviews} ${plural(d.reviews, 'отзыв', 'отзыва', 'отзывов')}</span></p>` : ''}
    <p class="doc-branch">${icon('pin')} ${esc(d.branch_name ?? '')}</p>
    <a class="btn btn-soft btn-sm" href="/book?vet_id=${d.id}&branch_id=${d.branch_id ?? ''}">Записаться</a>
  </article>`;
}

export function home({ services, doctors, reviews, clinic, branches, user }) {
  const staff = user && user.role !== 'client';
  return `
<section class="hero">
  <div class="container hero-in">
    <div class="hero-text">
      <p class="eyebrow">${icon('heart')} Сеть ветклиник в Астане</p>
      <h1>Заботимся о&nbsp;тех, кто не&nbsp;может пожаловаться словами</h1>
      <p class="lead">${branches.length} ${plural(branches.length, 'филиал', 'филиала', 'филиалов')} по всему городу, ${clinic.doctors} ${plural(clinic.doctors, 'врач', 'врача', 'врачей')} и онлайн-запись за минуту. Диагнозы, прививки и рекомендации — в личном кабинете.</p>
      <div class="hero-actions">
        <a class="btn btn-accent btn-lg" href="${staff ? '/queue' : '/book'}">${staff ? 'Открыть очередь' : 'Записаться на приём'} ${icon('arrow')}</a>
        <a class="btn btn-ghost btn-lg" href="/branches">${icon('pin')} Ближайший филиал</a>
      </div>
      <ul class="hero-points">
        <li>${icon('check')} Без очередей — по времени</li>
        <li>${icon('check')} Напомним о прививке</li>
        <li>${icon('check')} 2 филиала круглосуточно</li>
      </ul>
    </div>
    <div class="hero-art"><img src="/art/hero.svg" alt="Собака и кошка" width="560" height="480"></div>
  </div>
  <div class="container">
    <div class="stat-strip">
      <div><b>${branches.length}</b><span>филиалов в Астане</span></div>
      <div><b>${clinic.doctors}</b><span>врачей разных специальностей</span></div>
      <div><b>${clinic.visits.toLocaleString('ru-RU')}</b><span>приёмов за 2 месяца</span></div>
      <div><b>${clinic.rating ? clinic.rating.toFixed(1) : '—'} <span class="stars">★</span></b><span>средняя оценка, ${clinic.reviews} отзывов</span></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="features">
      <div class="feature"><span class="feature-ico">${icon('moon')}</span><h3>Круглосуточно</h3><p>Филиалы на Мангилик Ел и Тауелсиздик принимают ночью и в праздники.</p></div>
      <div class="feature"><span class="feature-ico">${icon('flask')}</span><h3>Своя лаборатория</h3><p>Анализы крови готовы через 2 часа — результат сразу в карте.</p></div>
      <div class="feature"><span class="feature-ico">${icon('shield')}</span><h3>Электронная карта</h3><p>История визитов, вес и прививки питомца всегда под рукой.</p></div>
      <div class="feature"><span class="feature-ico">${icon('heart')}</span><h3>Бережно</h3><p>Отдельные зоны ожидания для кошек и собак — меньше стресса.</p></div>
    </div>
  </div>
</section>

<section id="services" class="section section-soft">
  <div class="container">
    <div class="section-head"><div><p class="eyebrow">Услуги</p><h2>Услуги и цены</h2></div><p class="muted">Цена приёма фиксируется при записи. Препараты и материалы — по прайсу.</p></div>
    <div class="grid grid-3">
      ${services.map((s) => `
      <article class="card service">
        <span class="service-ico">${icon(s.icon)}</span>
        <div class="service-body">
          <span class="chip chip-cat">${esc(s.category)}</span>
          <h4>${esc(s.name)}</h4>
          <p>${esc(s.description)}</p>
          <div class="service-meta"><span class="price">${money(s.price)}</span><span class="muted">${icon('clock')} ${s.duration_min} мин</span></div>
        </div>
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head"><div><p class="eyebrow">Кого лечим</p><h2>Не только кошки и собаки</h2></div><p class="muted">В филиале на Абая работает врач-экзотолог.</p></div>
    <div class="pets-row">
      ${PET_KINDS.map(([k, label]) => `<figure><img src="/art/pet/${k}.svg" alt="" width="120" height="120" loading="lazy"><figcaption>${label}</figcaption></figure>`).join('')}
    </div>
  </div>
</section>

<section id="branches" class="section section-soft">
  <div class="container">
    <div class="section-head"><div><p class="eyebrow">Филиалы</p><h2>${branches.length} ${plural(branches.length, 'клиника', 'клиники', 'клиник')} на карте Астаны</h2></div><a class="btn btn-ghost" href="/branches">Все адреса ${icon('arrow')}</a></div>
    <div class="map-layout">
      <div class="map" data-map="${mapData(branches)}" role="region" aria-label="Карта филиалов"></div>
      <ul class="branch-mini">
        ${branches.map((b) => `<li><a href="/branches#b${b.id}" data-branch-link="${b.id}"><b>${esc(b.name)}</b>${b.is_24h ? ' <span class="chip chip-accent">24/7</span>' : ''}<span>${esc(b.address)} · ${esc(b.hours)}</span></a></li>`).join('')}
      </ul>
    </div>
  </div>
</section>

<section id="doctors" class="section">
  <div class="container">
    <div class="section-head"><div><p class="eyebrow">Команда</p><h2>Врачи с лучшими отзывами</h2></div><a class="btn btn-ghost" href="/doctors">Все ${clinic.doctors} врачей ${icon('arrow')}</a></div>
    <div class="doc-grid">${doctors.map(doctorCard).join('')}</div>
  </div>
</section>

${reviews.length ? `
<section id="reviews" class="section section-soft">
  <div class="container">
    <div class="section-head"><div><p class="eyebrow">Отзывы</p><h2>Что говорят владельцы</h2></div></div>
    <div class="grid grid-3">
      ${reviews.map((r) => `
      <article class="card review">
        <p class="stars" aria-label="Оценка ${r.rating} из 5">${stars(r.rating)}</p>
        <p class="review-text">«${esc(r.comment)}»</p>
        <div class="review-foot">
          <img class="avatar-img pet-sm" src="/art/pet/${r.art}.svg" alt="">
          <p><b>${esc(r.owner_name.split(' ')[0])}</b> и ${esc(r.pet_name)}<br><span class="muted small">врач ${esc(r.vet_name)} · ${esc(humanDate(r.created_at))}</span></p>
        </div>
      </article>`).join('')}
    </div>
  </div>
</section>` : ''}

<section class="section">
  <div class="container">
    <div class="cta-band">
      <img src="/art/pet/dog.svg" alt="" width="96" height="96">
      <div><h2>Запишитесь онлайн за минуту</h2><p>Выберите филиал, врача и свободное время — подтверждение придёт в кабинет.</p></div>
      <a class="btn btn-accent btn-lg" href="${staff ? '/queue' : '/book'}">${staff ? 'Открыть очередь' : 'Записаться'}</a>
    </div>
  </div>
</section>`;
}

export function branchesPage({ branches, doctorsByBranch }) {
  return `
<section class="section page-hero">
  <div class="container">
    <p class="eyebrow">${icon('pin')} Астана</p>
    <h1>Филиалы «Доктор Хвост»</h1>
    <p class="lead">${branches.length} клиник в четырёх районах города. Два филиала работают круглосуточно.</p>
  </div>
</section>
<section class="section section-tight">
  <div class="container">
    <div class="map map-tall" data-map="${mapData(branches)}" role="region" aria-label="Карта филиалов"></div>
  </div>
</section>
<section class="section section-tight">
  <div class="container branch-list">
    ${branches.map((b) => `
    <article class="card branch-card" id="b${b.id}">
      <div class="branch-num">${b.id}</div>
      <div class="branch-main">
        <h2>${esc(b.name)} <span class="muted small">${esc(b.district)}</span></h2>
        <p class="branch-line">${icon('pin')} ${esc(b.address)}</p>
        <p class="branch-line">${icon('clock')} ${esc(b.hours)} &nbsp; ${icon('phone')} <a href="tel:${esc(b.phone.replace(/\s/g, ''))}">${esc(b.phone)}</a></p>
        <p>${esc(b.description)}</p>
        <div class="chips">${branchBadges(b)}</div>
      </div>
      <div class="branch-docs">
        <p class="muted small">Врачи филиала</p>
        ${(doctorsByBranch.get(b.id) ?? []).map((d) => `
          <a class="mini-doc" href="/book?vet_id=${d.id}&branch_id=${b.id}">${doctorAvatar(d, 'sm')}<span><b>${esc(d.name)}</b><small>${esc(d.specialty)}</small></span></a>`).join('') || '<p class="muted">Врачи уточняются</p>'}
        <a class="btn btn-accent btn-sm" href="/book?branch_id=${b.id}">Записаться в этот филиал</a>
      </div>
    </article>`).join('')}
  </div>
</section>`;
}

export function doctorsPage({ doctors, specialties, branches, filter }) {
  const sel = (a, b) => (String(a) === String(b) ? ' selected' : '');
  return `
<section class="section page-hero">
  <div class="container">
    <p class="eyebrow">Команда</p>
    <h1>Наши врачи</h1>
    <form class="filters filters-wide" method="get" action="/doctors">
      <select name="specialty" data-autosubmit-field aria-label="Специализация"><option value="">Все специализации</option>${specialties.map((s) => `<option${sel(s, filter.specialty)}>${esc(s)}</option>`).join('')}</select>
      <select name="branch" data-autosubmit-field aria-label="Филиал"><option value="">Все филиалы</option>${branches.map((b) => `<option value="${b.id}"${sel(b.id, filter.branch)}>${esc(b.name)}</option>`).join('')}</select>
      <noscript><button class="btn btn-sm">Показать</button></noscript>
    </form>
  </div>
</section>
<section class="section section-tight">
  <div class="container">
    ${doctors.length ? `<div class="doc-grid">${doctors.map(doctorCard).join('')}</div>` : '<p class="empty">Под фильтр никто не подошёл.</p>'}
  </div>
</section>`;
}

export function login({ error, email = '' }) {
  return `
<section class="auth card">
  <img class="auth-art" src="/art/pet/cat.svg" alt="" width="80" height="80">
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
  <img class="auth-art" src="/art/pet/dog.svg" alt="" width="80" height="80">
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
