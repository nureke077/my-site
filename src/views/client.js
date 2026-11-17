// Кабинет владельца, запись, перенос, отзывы.
import { esc, humanDate, money, SPECIES, stars } from '../util.js';
import { csrfField, badge, time, petAvatar, slotPicker } from './layout.js';

function petForm(csrf) {
  return `
<form method="post" action="/pets" class="form form-inline card" enctype="multipart/form-data">
  ${csrfField(csrf)}
  <h3>Добавить питомца</h3>
  <label>Кличка<input name="name" required maxlength="40"></label>
  <label>Вид<select name="species">${SPECIES.map((s) => `<option>${s}</option>`).join('')}</select></label>
  <label>Порода<input name="breed" maxlength="60"></label>
  <label>Дата рождения<input type="date" name="birth_date"></label>
  <label class="span-2">Особенности (аллергии, хронические болезни)<input name="notes" maxlength="200"></label>
  <label>Фото <small>JPG, PNG, WebP до 2 МБ</small><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>
  <button class="btn">Добавить</button>
</form>`;
}

function reviewForm(a, csrf) {
  return `
<form method="post" action="/appointments/${a.id}/review" class="review-form">
  ${csrfField(csrf)}
  <span class="muted">Оцените приём:</span>
  <span class="star-input" role="radiogroup" aria-label="Оценка">
    ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="r${a.id}-${n}" name="rating" value="${n}" required><label for="r${a.id}-${n}" title="${n} из 5">★</label>`).join('')}
  </span>
  <input name="comment" maxlength="300" placeholder="Комментарий (необязательно)">
  <button class="btn btn-sm">Отправить</button>
</form>`;
}

export function cabinet({ user, pets, upcoming, history, reminders, csrf, now }) {
  return `
<div class="page-head">
  <div><h1>Здравствуйте, ${esc(user.name.split(' ')[0])}!</h1><p class="muted">Ваши питомцы, записи и история приёмов.</p></div>
  <a class="btn" href="/book">+ Записаться</a>
</div>

${reminders.map((r) => `
<div class="reminder" role="note">
  <span class="reminder-ico" aria-hidden="true">💉</span>
  <div><b>${esc(r.name)}: пора на прививку.</b>
  ${r.last ? `Последняя вакцинация — ${esc(humanDate(r.last))}, больше года назад.` : 'В карте нет ни одной прививки.'}</div>
  <a class="btn btn-sm" href="/book?pet_id=${r.id}&service_id=${r.service_id}">Записаться</a>
</div>`).join('')}

<section class="section">
  <h2>Питомцы</h2>
  ${pets.length ? `<div class="grid grid-3">${pets.map((p) => `
    <article class="card pet">
      ${petAvatar(p, 'lg')}
      <div class="pet-body">
        <h3>${esc(p.name)}</h3>
        <p class="muted">${esc(p.species)}${p.breed ? `, ${esc(p.breed)}` : ''}${p.birth_date ? ` · род. ${esc(p.birth_date)}` : ''}</p>
        ${p.notes ? `<p class="note">⚠ ${esc(p.notes)}</p>` : ''}
        <form method="post" action="/pets/${p.id}/photo" enctype="multipart/form-data" class="photo-form" data-autosubmit>
          ${csrfField(csrf)}
          <label class="link-btn">${p.has_photo ? 'Сменить фото' : 'Добавить фото'}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required hidden></label>
          <noscript><button class="btn btn-sm">Загрузить</button></noscript>
        </form>
      </div>
    </article>`).join('')}</div>` : '<p class="empty">Пока нет питомцев — добавьте первого ниже.</p>'}
  ${petForm(csrf)}
</section>

<section class="section">
  <h2>Предстоящие записи</h2>
  ${upcoming.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Когда</th><th>Питомец</th><th>Услуга</th><th>Врач</th><th>Статус</th><th></th></tr></thead>
    <tbody>${upcoming.map((a) => `<tr>
      <td><b>${esc(humanDate(a.starts_at))}</b>, ${time(a.starts_at)}</td>
      <td>${esc(a.pet_name)}</td><td>${esc(a.service_name)}<br><small class="muted">${money(a.price)}</small></td><td>${esc(a.vet_name)}</td><td>${badge(a.status)}</td>
      <td class="actions">${a.status === 'booked' && a.starts_at > now ? `
        <a class="btn btn-ghost btn-sm" href="/appointments/${a.id}/reschedule">Перенести</a>
        <form method="post" action="/appointments/${a.id}/cancel" data-confirm="Отменить запись?">${csrfField(csrf)}<button class="btn btn-ghost btn-sm">Отменить</button></form>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="empty">Записей нет.</p>'}
</section>

<section class="section">
  <h2>История приёмов</h2>
  ${history.length ? history.map((h) => `
  <article class="card record">
    <div class="record-head"><b>${esc(humanDate(h.starts_at))}</b> · ${esc(h.pet_name)} · ${esc(h.service_name)} · ${esc(h.vet_name)} ${badge(h.status)}</div>
    <dl>
      <dt>Диагноз</dt><dd>${esc(h.diagnosis)}</dd>
      ${h.treatment ? `<dt>Лечение</dt><dd>${esc(h.treatment)}</dd>` : ''}
      ${h.recommendations ? `<dt>Рекомендации</dt><dd>${esc(h.recommendations)}</dd>` : ''}
      ${h.weight_kg ? `<dt>Вес</dt><dd>${esc(h.weight_kg)} кг</dd>` : ''}
    </dl>
    ${h.rating ? `<p class="my-review"><span class="stars">${stars(h.rating)}</span> ${esc(h.comment)}</p>` : reviewForm(h, csrf)}
  </article>`).join('') : '<p class="empty">Здесь появятся протоколы прошедших приёмов.</p>'}
</section>`;
}

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
  <label>Услуга<select name="service_id" required data-service>${services.map((s) => `<option value="${s.id}"${sel(s.id, values.service_id)}>${esc(s.name)} — ${money(s.price)}, ${s.duration_min} мин</option>`).join('')}</select></label>
  <label>Врач<select name="vet_id" required data-vet>${doctors.map((d) => `<option value="${d.id}"${sel(d.id, values.vet_id)}>${esc(d.name)}, ${esc(d.specialty)}</option>`).join('')}</select></label>
  <label>Дата<input type="date" name="date" required min="${today}" max="${maxDate}" value="${esc(values.date || today)}" data-date></label>
  ${slotPicker({ selected: values.time })}
  <label class="span-2">Что беспокоит<textarea name="complaint" rows="3" maxlength="500" placeholder="Например: плохо ест, хромает на заднюю лапу">${esc(values.complaint)}</textarea></label>
  <button class="btn btn-lg span-2">Записаться</button>
</form>`;
}

export function reschedule({ a, values = {}, error, today, maxDate, csrf }) {
  return `
<p><a href="/cabinet">← в кабинет</a></p>
<h1>Перенос записи</h1>
<p class="muted">${esc(a.pet_name)} · ${esc(a.service_name)} · ${esc(a.vet_name)}. Сейчас: <b>${esc(humanDate(a.starts_at))}, ${time(a.starts_at)}</b></p>
${error ? `<p class="error">${esc(error)}</p>` : ''}
<form method="post" action="/appointments/${a.id}/reschedule" class="form card book-form" data-book>
  ${csrfField(csrf)}
  <input type="hidden" value="${a.vet_id}" data-vet>
  <input type="hidden" value="${a.service_id}" data-service>
  <label class="span-2">Новая дата<input type="date" name="date" required min="${today}" max="${maxDate}" value="${esc(values.date || a.starts_at.slice(0, 10))}" data-date></label>
  ${slotPicker({ selected: values.time, exclude: a.id })}
  <button class="btn btn-lg span-2">Перенести</button>
</form>`;
}
