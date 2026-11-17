// Владелец: кабинет, питомцы и фото, запись, перенос, отмена, отзывы. Плюс API свободного времени.
import { log } from '../db.js';
import { HttpError, readForm, redirect, json, send, imageMime } from '../http.js';
import { localDate, localDateTime, addDays, isDate, isTime } from '../util.js';
import { daySlots, slotProblem } from '../schedule.js';
import * as view from '../views/client.js';

export const BOOK_DAYS_AHEAD = 60;
const PHOTO_LIMIT = 2 * 1024 * 1024;

export function savePhoto(db, petId, file) {
  if (!file) return false;
  if (file.data.length > PHOTO_LIMIT) throw new HttpError(413, 'Фото больше 2 МБ. Уменьшите его и попробуйте снова.');
  const mime = imageMime(file.data);
  if (!mime) throw new HttpError(400, 'Это не похоже на фото. Подойдут JPG, PNG или WebP.');
  db.prepare(`INSERT INTO pet_photos (pet_id, mime, data) VALUES (?, ?, ?)
    ON CONFLICT(pet_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = datetime('now','localtime')`)
    .run(petId, mime, file.data);
  return true;
}

export function checkBookingDate(date) {
  const today = localDate();
  if (!isDate(date ?? '') || date < today || date > addDays(today, BOOK_DAYS_AHEAD)) {
    return `Можно записаться на ближайшие ${BOOK_DAYS_AHEAD} дней.`;
  }
  return null;
}

export default function register(app) {
  const { db, route, page, requireRole, checkCsrf } = app;
  const petsOf = (ownerId) => db.prepare(`SELECT p.*, (SELECT 1 FROM pet_photos ph WHERE ph.pet_id = p.id) AS has_photo
    FROM pets p WHERE owner_id = ? ORDER BY name`).all(ownerId);

  route('GET', '/cabinet', (ctx, res) => {
    requireRole(ctx, ['client']);
    const now = localDateTime();
    const pets = petsOf(ctx.user.id);
    const upcoming = db.prepare(`${app.apptSql}
      WHERE p.owner_id = ? AND a.starts_at >= ? AND a.status IN ('booked','arrived') ORDER BY a.starts_at`)
      .all(ctx.user.id, now.slice(0, 10));
    const history = db.prepare(`
      SELECT a.id, a.starts_at, a.status, p.name AS pet_name, s.name AS service_name, v.name AS vet_name,
             r.diagnosis, r.treatment, r.recommendations, r.weight_kg, rv.rating, rv.comment
      FROM appointments a JOIN records r ON r.appointment_id = a.id
      JOIN pets p ON p.id = a.pet_id JOIN services s ON s.id = a.service_id JOIN users v ON v.id = a.vet_id
      LEFT JOIN reviews rv ON rv.appointment_id = a.id
      WHERE p.owner_id = ? ORDER BY a.starts_at DESC`).all(ctx.user.id);

    // Напоминание: прививки не было больше года и нет будущей записи на вакцинацию
    const vacc = db.prepare('SELECT id FROM services WHERE is_vaccination = 1 AND active = 1 ORDER BY id LIMIT 1').get();
    const reminders = !vacc ? [] : pets.map((p) => {
      const last = db.prepare(`SELECT MAX(a.starts_at) AS d FROM appointments a JOIN services s ON s.id = a.service_id
        WHERE a.pet_id = ? AND s.is_vaccination = 1 AND a.status = 'done'`).get(p.id).d;
      const planned = db.prepare(`SELECT 1 FROM appointments a JOIN services s ON s.id = a.service_id
        WHERE a.pet_id = ? AND s.is_vaccination = 1 AND a.status IN ('booked','arrived')`).get(p.id);
      const due = !last || last.slice(0, 10) <= addDays(localDate(), -365);
      return due && !planned ? { id: p.id, name: p.name, last, service_id: vacc.id } : null;
    }).filter(Boolean);

    page(res, ctx, 'Кабинет', view.cabinet({ user: ctx.user, pets, upcoming, history, reminders, csrf: ctx.user.csrf, now }));
  });

  route('POST', '/pets', async (ctx, res, req) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req, { limit: PHOTO_LIMIT + 64 * 1024 });
    checkCsrf(ctx, f);
    if (!f.name) throw new HttpError(400, 'Укажите кличку питомца.');
    if (f.birth_date && (!isDate(f.birth_date) || f.birth_date > localDate())) throw new HttpError(400, 'Неверная дата рождения.');
    db.exec('BEGIN');
    try {
      const id = Number(db.prepare('INSERT INTO pets (owner_id, name, species, breed, birth_date, notes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ctx.user.id, f.name.slice(0, 40), (f.species || 'Другое').slice(0, 20), (f.breed ?? '').slice(0, 60), f.birth_date || null, (f.notes ?? '').slice(0, 200))
        .lastInsertRowid);
      savePhoto(db, id, f._files?.photo);
      log(db, ctx.user.id, 'Добавлен питомец', f.name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    redirect(res, '/cabinet?ok=pet');
  });

  route('POST', '/pets/:id/photo', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req, { limit: PHOTO_LIMIT + 64 * 1024 });
    checkCsrf(ctx, f);
    const pet = db.prepare('SELECT id, name FROM pets WHERE id = ? AND owner_id = ?').get(Number(id), ctx.user.id);
    if (!pet) throw new HttpError(404);
    if (!savePhoto(db, pet.id, f._files?.photo)) throw new HttpError(400, 'Выберите файл с фото.');
    log(db, ctx.user.id, 'Фото питомца', pet.name);
    redirect(res, '/cabinet?ok=photo');
  });

  // Фото видят владелец и сотрудники
  route('GET', '/pets/:id/photo', (ctx, res, req, { id }) => {
    if (!ctx.user) throw new HttpError(401);
    const ph = db.prepare('SELECT ph.mime, ph.data, p.owner_id FROM pet_photos ph JOIN pets p ON p.id = ph.pet_id WHERE ph.pet_id = ?').get(Number(id));
    if (!ph || (ctx.user.role === 'client' && ph.owner_id !== ctx.user.id)) throw new HttpError(404);
    send(res, 200, Buffer.from(ph.data), { 'Content-Type': ph.mime, 'Cache-Control': 'private, max-age=60' });
  });

  // --- запись ---
  function bookPage(ctx, res, values, error, status = 200) {
    const today = localDate();
    page(res, ctx, 'Запись на приём', view.book({
      pets: petsOf(ctx.user.id), services: app.services(), doctors: app.doctors(),
      values, error, today, maxDate: addDays(today, BOOK_DAYS_AHEAD), csrf: ctx.user.csrf,
    }), { status });
  }

  route('GET', '/book', (ctx, res) => {
    requireRole(ctx, ['client']);
    bookPage(ctx, res, Object.fromEntries(ctx.url.searchParams));
  });

  route('POST', '/book', async (ctx, res, req) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const pet = db.prepare('SELECT id, name FROM pets WHERE id = ? AND owner_id = ?').get(Number(f.pet_id), ctx.user.id);
    const vet = db.prepare('SELECT d.user_id FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.user_id = ? AND u.blocked = 0').get(Number(f.vet_id));
    const svc = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(Number(f.service_id));
    let error = !pet || !vet || !svc ? 'Выберите питомца, услугу и врача.'
      : checkBookingDate(f.date) ?? (!isTime(f.time) ? 'Выберите время приёма.' : null);
    error ??= slotProblem(db, vet.user_id, f.date, f.time, svc.duration_min);
    if (error) return bookPage(ctx, res, f, error, 400);

    db.prepare(`INSERT INTO appointments (pet_id, vet_id, service_id, starts_at, complaint, duration_min, price, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(pet.id, vet.user_id, svc.id, `${f.date}T${f.time}`, (f.complaint ?? '').slice(0, 500), svc.duration_min, svc.price, ctx.user.id);
    log(db, ctx.user.id, 'Запись', `${pet.name}: ${svc.name}, ${f.date} ${f.time}`);
    redirect(res, '/cabinet?ok=booked');
  });

  route('GET', '/api/slots', (ctx, res) => {
    if (!ctx.user) throw new HttpError(401);
    const p = ctx.url.searchParams;
    const date = p.get('date') ?? '';
    const vet = Number(p.get('vet'));
    if (!isDate(date) || !vet) throw new HttpError(400, 'Нужны date и vet');
    const exclude = Number(p.get('exclude')) || null;
    const svc = db.prepare('SELECT duration_min FROM services WHERE id = ?').get(Number(p.get('service')));
    const duration = svc?.duration_min ?? 30;
    json(res, { date, duration, ...daySlots(db, vet, date, duration, { excludeId: exclude }) });
  });

  // --- изменения своих записей ---
  function ownBooked(ctx, id) {
    const a = app.apptById(id);
    if (!a || a.owner_id !== ctx.user.id) throw new HttpError(404);
    if (a.status !== 'booked' || a.starts_at <= localDateTime()) throw new HttpError(400, 'Эту запись уже нельзя изменить. Позвоните в клинику.');
    return a;
  }

  route('POST', '/appointments/:id/cancel', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = ownBooked(ctx, id);
    db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(a.id);
    log(db, ctx.user.id, 'Отмена записи', `#${a.id} ${a.pet_name}, ${a.starts_at.replace('T', ' ')}`);
    redirect(res, '/cabinet?ok=cancelled');
  });

  function reschedulePage(ctx, res, a, values, error, status = 200) {
    const today = localDate();
    page(res, ctx, 'Перенос записи', view.reschedule({ a, values, error, today, maxDate: addDays(today, BOOK_DAYS_AHEAD), csrf: ctx.user.csrf }), { status });
  }

  route('GET', '/appointments/:id/reschedule', (ctx, res, req, { id }) => {
    requireRole(ctx, ['client']);
    reschedulePage(ctx, res, ownBooked(ctx, id), {});
  });

  route('POST', '/appointments/:id/reschedule', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = ownBooked(ctx, id);
    const error = checkBookingDate(f.date) ?? (!isTime(f.time) ? 'Выберите время.' : null)
      ?? slotProblem(db, a.vet_id, f.date, f.time, a.duration_min, { excludeId: a.id });
    if (error) return reschedulePage(ctx, res, a, f, error, 400);
    const to = `${f.date}T${f.time}`;
    db.prepare('UPDATE appointments SET starts_at = ? WHERE id = ?').run(to, a.id);
    log(db, ctx.user.id, 'Перенос записи', `#${a.id} ${a.pet_name}: ${a.starts_at.replace('T', ' ')} → ${to.replace('T', ' ')}`);
    redirect(res, '/cabinet?ok=moved');
  });

  route('POST', '/appointments/:id/review', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = app.apptById(id);
    if (!a || a.owner_id !== ctx.user.id || a.status !== 'done') throw new HttpError(400, 'Отзыв можно оставить после завершённого приёма.');
    const rating = Number(f.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Поставьте оценку от 1 до 5.');
    try {
      db.prepare('INSERT INTO reviews (appointment_id, rating, comment) VALUES (?, ?, ?)').run(a.id, rating, (f.comment ?? '').slice(0, 300));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Вы уже оставили отзыв об этом приёме.');
      throw e;
    }
    log(db, ctx.user.id, 'Отзыв', `${a.vet_name}: ${rating}/5`);
    redirect(res, '/cabinet?ok=review');
  });
}
