// Персонал: очередь, приём и протокол, счёт и оплата, поиск пациентов, запись по телефону.
import { log } from '../db.js';
import { hashPassword, randomPassword } from '../auth.js';
import { HttpError, readForm, redirect, send } from '../http.js';
import { localDate, addDays, isDate, isTime, digits, samePhone, STATUS, PAYMENT } from '../util.js';
import { slotProblem } from '../schedule.js';
import { BOOK_DAYS_AHEAD, checkBookingDate } from './client.js';
import * as view from '../views/staff.js';
import { markSuggestion } from './ai.js';

const STAFF = ['reception', 'vet', 'admin'];
const FRONT = ['reception', 'admin'];

export default function register(app) {
  const { db, route, page, requireRole, checkCsrf } = app;

  const invoiceOf = (a) => {
    const lines = db.prepare('SELECT * FROM invoice_lines WHERE appointment_id = ? ORDER BY id').all(a.id);
    return { lines, total: a.price + lines.reduce((s, l) => s + l.price * l.qty, 0) };
  };

  route('GET', '/queue', (ctx, res) => {
    requireRole(ctx, STAFF);
    const p = ctx.url.searchParams;
    const date = isDate(p.get('date') ?? '') ? p.get('date') : localDate();
    const vetFilter = ctx.user.role === 'vet' ? ctx.user.id : Number(p.get('vet')) || '';
    const branchFilter = ctx.user.role === 'vet' ? '' : Number(p.get('branch')) || '';
    const where = [vetFilter && 'a.vet_id = ?', branchFilter && 'a.branch_id = ?'].filter(Boolean);
    const rows = db.prepare(`${app.apptSql} WHERE a.starts_at LIKE ? ${where.map((w) => `AND ${w}`).join(' ')} ORDER BY a.starts_at, v.name`)
      .all(`${date}T%`, ...[vetFilter, branchFilter].filter(Boolean));
    page(res, ctx, 'Очередь', view.queue({
      user: ctx.user, date, prev: addDays(date, -1), next: addDays(date, 1), rows, branches: app.branches(),
      doctors: app.doctors(), vetFilter: ctx.user.role === 'vet' ? '' : vetFilter, branchFilter, csrf: ctx.user.csrf,
    }));
  });

  route('POST', '/appointments/:id/status', async (ctx, res, req, { id }) => {
    requireRole(ctx, FRONT);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = app.apptById(id);
    const allowed = { booked: ['arrived', 'cancelled'], arrived: ['cancelled'] };
    if (!a || !allowed[a.status]?.includes(f.status)) throw new HttpError(400, 'Нельзя перевести запись в этот статус.');
    if (f.status === 'cancelled' && a.paid_at) throw new HttpError(400, 'Запись уже оплачена — сначала оформите возврат.');
    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(f.status, a.id);
    log(db, ctx.user.id, 'Статус записи', `#${a.id} ${a.pet_name}: ${STATUS[f.status]}`);
    redirect(res, `/queue?date=${a.starts_at.slice(0, 10)}&ok=status`);
  });

  route('GET', '/appointments/:id', (ctx, res, req, { id }) => {
    requireRole(ctx, STAFF);
    const a = app.apptById(id);
    if (!a) throw new HttpError(404);
    const record = db.prepare('SELECT * FROM records WHERE appointment_id = ?').get(a.id);
    const history = db.prepare(`SELECT a.starts_at, s.name AS service_name, v.name AS vet_name, r.diagnosis, r.treatment
      FROM appointments a JOIN records r ON r.appointment_id = a.id JOIN services s ON s.id = a.service_id JOIN users v ON v.id = a.vet_id
      WHERE a.pet_id = ? AND a.id <> ? ORDER BY a.starts_at DESC LIMIT 5`).all(a.pet_id, a.id);
    const items = db.prepare('SELECT * FROM items WHERE active = 1 ORDER BY kind, name').all();
    page(res, ctx, a.pet_name, view.appointment({ user: ctx.user, a, record, history, items, ...invoiceOf(a), csrf: ctx.user.csrf }));
  });

  route('POST', '/appointments/:id/record', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['vet']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = app.apptById(id);
    if (!a || a.vet_id !== ctx.user.id || !['booked', 'arrived'].includes(a.status)) throw new HttpError(403, 'Протокол заполняет врач этого приёма.');
    if (!f.diagnosis) throw new HttpError(400, 'Укажите диагноз.');
    const weight = f.weight_kg ? Number(f.weight_kg) : null;
    if (weight !== null && !(weight > 0 && weight < 200)) throw new HttpError(400, 'Неверный вес.');
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO records (appointment_id, diagnosis, treatment, recommendations, weight_kg) VALUES (?, ?, ?, ?, ?)')
        .run(a.id, f.diagnosis.slice(0, 200), (f.treatment ?? '').slice(0, 1000), (f.recommendations ?? '').slice(0, 1000), weight);
      db.prepare("UPDATE appointments SET status = 'done' WHERE id = ?").run(a.id);
      log(db, ctx.user.id, 'Протокол', `#${a.id} ${a.pet_name}: ${f.diagnosis}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    redirect(res, `/appointments/${a.id}?ok=record`);
  });

  // --- счёт ---
  function editableInvoice(ctx, id) {
    const a = app.apptById(id);
    if (!a) throw new HttpError(404);
    if (a.status === 'cancelled' || a.paid_at) throw new HttpError(400, 'Счёт уже закрыт.');
    if (ctx.user.role === 'vet' && a.vet_id !== ctx.user.id) throw new HttpError(403, 'Это пациент другого врача.');
    return a;
  }

  route('POST', '/appointments/:id/lines', async (ctx, res, req, { id }) => {
    requireRole(ctx, STAFF);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = editableInvoice(ctx, id);
    const item = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(Number(f.item_id));
    const qty = Number(f.qty);
    if (!item || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Выберите позицию и количество.');
    db.prepare('INSERT INTO invoice_lines (appointment_id, item_id, name, price, qty, added_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(a.id, item.id, item.name, item.price, qty, ctx.user.id);
    log(db, ctx.user.id, 'Счёт', `#${a.id}: + ${item.name} × ${qty}`);
    redirect(res, `/appointments/${a.id}?ok=line`);
  });

  route('POST', '/appointments/:id/lines/:line/delete', async (ctx, res, req, { id, line }) => {
    requireRole(ctx, STAFF);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = editableInvoice(ctx, id);
    const l = db.prepare('SELECT * FROM invoice_lines WHERE id = ? AND appointment_id = ?').get(Number(line), a.id);
    if (!l) throw new HttpError(404);
    db.prepare('DELETE FROM invoice_lines WHERE id = ?').run(l.id);
    log(db, ctx.user.id, 'Счёт', `#${a.id}: − ${l.name}`);
    redirect(res, `/appointments/${a.id}?ok=line`);
  });

  route('POST', '/appointments/:id/pay', async (ctx, res, req, { id }) => {
    requireRole(ctx, FRONT);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = editableInvoice(ctx, id);
    if (a.status === 'booked') throw new HttpError(400, 'Сначала отметьте, что пациент пришёл.');
    if (!PAYMENT[f.method]) throw new HttpError(400, 'Выберите способ оплаты.');
    const { total } = invoiceOf(a);
    db.prepare("UPDATE appointments SET paid_at = datetime('now','localtime'), payment_method = ? WHERE id = ?").run(f.method, a.id);
    log(db, ctx.user.id, 'Оплата', `#${a.id} ${a.pet_name}: ${total} ₸, ${PAYMENT[f.method]}`);
    redirect(res, `/appointments/${a.id}?ok=paid`);
  });

  route('GET', '/appointments/:id/receipt', (ctx, res, req, { id }) => {
    requireRole(ctx, STAFF);
    const a = app.apptById(id);
    if (!a) throw new HttpError(404);
    send(res, 200, view.receipt({ a, ...invoiceOf(a) }));
  });

  // --- пациенты ---
  route('GET', '/patients', (ctx, res) => {
    requireRole(ctx, STAFF);
    const q = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 60);
    const base = `
      SELECT p.*, o.name AS owner_name, o.phone AS owner_phone,
             (SELECT 1 FROM pet_photos ph WHERE ph.pet_id = p.id) AS has_photo,
             (SELECT COUNT(*) FROM appointments a WHERE a.pet_id = p.id AND a.status = 'done') AS visits,
             (SELECT MAX(starts_at) FROM appointments a WHERE a.pet_id = p.id AND a.status = 'done') AS last_visit
      FROM pets p JOIN users o ON o.id = p.owner_id`;
    let rows;
    if (q) {
      // Кириллицу SQLite в lower() не понимает, поэтому сравниваем в JS. Телефон ищем по цифрам:
      // «700 123» найдёт «+7 700 123 45 67».
      const ql = q.toLowerCase();
      const d = digits(q);
      rows = db.prepare(`${base} ORDER BY p.name`).all().filter((p) =>
        [p.name, p.owner_name, p.breed].some((s) => String(s ?? '').toLowerCase().includes(ql))
        || (d.length >= 3 && digits(p.owner_phone).includes(d))).slice(0, 50);
    } else {
      rows = db.prepare(`${base} ORDER BY last_visit DESC NULLS LAST LIMIT 20`).all();
    }
    page(res, ctx, 'Пациенты', view.patients({ q, rows }));
  });

  route('GET', '/patients/:id', (ctx, res, req, { id }) => {
    requireRole(ctx, STAFF);
    const p = db.prepare(`SELECT p.*, o.name AS owner_name, o.phone AS owner_phone, o.phone_only,
      (SELECT 1 FROM pet_photos ph WHERE ph.pet_id = p.id) AS has_photo
      FROM pets p JOIN users o ON o.id = p.owner_id WHERE p.id = ?`).get(Number(id));
    if (!p) throw new HttpError(404);
    const visits = db.prepare(`
      SELECT a.id, a.starts_at, a.status, a.complaint, s.name AS service_name, s.is_vaccination, v.name AS vet_name,
             (SELECT name FROM branches b WHERE b.id = a.branch_id) AS branch_name,
             r.diagnosis, r.treatment, r.recommendations, r.weight_kg
      FROM appointments a JOIN services s ON s.id = a.service_id JOIN users v ON v.id = a.vet_id
      LEFT JOIN records r ON r.appointment_id = a.id
      WHERE a.pet_id = ? ORDER BY a.starts_at DESC`).all(p.id);
    const weights = visits.filter((v) => v.weight_kg).reverse();
    const lastVacc = visits.find((v) => v.is_vaccination && v.status === 'done')?.starts_at;
    page(res, ctx, p.name, view.patientCard({ user: ctx.user, p, visits, weights, lastVacc }));
  });

  // --- запись по телефону ---
  const findOwner = (phone) => {
    const d = digits(phone);
    if (d.length < 10) return null;
    return db.prepare("SELECT id, name, phone FROM users WHERE role = 'client' AND phone IS NOT NULL").all()
      .find((u) => samePhone(u.phone, d)) ?? null;
  };

  function receptionPage(ctx, res, values, error, status = 200) {
    const phone = values.phone ?? '';
    const owner = phone ? findOwner(phone) : null;
    const pets = owner ? db.prepare('SELECT * FROM pets WHERE owner_id = ? ORDER BY name').all(owner.id) : [];
    const today = localDate();
    page(res, ctx, 'Запись по телефону', view.receptionBook({
      phone, owner, pets, services: app.services(), doctors: app.doctors(), branches: app.branches(),
      values, error, today, maxDate: addDays(today, BOOK_DAYS_AHEAD), csrf: ctx.user.csrf,
    }), { status });
  }

  route('GET', '/reception/book', (ctx, res) => {
    requireRole(ctx, FRONT);
    receptionPage(ctx, res, Object.fromEntries(ctx.url.searchParams));
  });

  route('POST', '/reception/book', async (ctx, res, req) => {
    requireRole(ctx, FRONT);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    if (digits(f.phone).length < 10) return receptionPage(ctx, res, f, 'Проверьте номер телефона.', 400);
    let owner = findOwner(f.phone);
    const vet = db.prepare('SELECT d.user_id, d.branch_id FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.user_id = ? AND u.blocked = 0').get(Number(f.vet_id));
    const svc = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(Number(f.service_id));
    const newPet = f.pet_id === 'new' || !f.pet_id;
    const pet = !newPet && owner ? db.prepare('SELECT id, name FROM pets WHERE id = ? AND owner_id = ?').get(Number(f.pet_id), owner.id) : null;

    let error = null;
    if (!owner && !f.owner_name) error = 'Укажите имя владельца.';
    else if (newPet && !f.pet_name) error = 'Укажите кличку нового питомца.';
    else if (!newPet && !pet) error = 'Выберите питомца.';
    else if (!vet || !svc) error = 'Выберите услугу и врача.';
    error ??= checkBookingDate(f.date) ?? (!isTime(f.time) ? 'Выберите время приёма.' : null)
      ?? slotProblem(db, vet.user_id, f.date, f.time, svc.duration_min);
    if (error) return receptionPage(ctx, res, f, error, 400);

    db.exec('BEGIN');
    try {
      if (!owner) {
        // Владелец без кабинета: позже он сможет зарегистрироваться на сайте с этим телефоном
        const id = Number(db.prepare(`INSERT INTO users (email, password_hash, name, phone, role, phone_only)
          VALUES (?, ?, ?, ?, 'client', 1)`).run(`phone-${digits(f.phone)}@khvost.local`, hashPassword(randomPassword()), f.owner_name.slice(0, 80), f.phone).lastInsertRowid);
        owner = { id, name: f.owner_name };
      }
      const petId = pet?.id ?? Number(db.prepare('INSERT INTO pets (owner_id, name, species) VALUES (?, ?, ?)')
        .run(owner.id, f.pet_name.slice(0, 40), (f.species || 'Другое').slice(0, 20)).lastInsertRowid);
      db.prepare(`INSERT INTO appointments (pet_id, vet_id, branch_id, service_id, starts_at, complaint, duration_min, price, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(petId, vet.user_id, vet.branch_id, svc.id, `${f.date}T${f.time}`, (f.complaint ?? '').slice(0, 500), svc.duration_min, svc.price, ctx.user.id);
      if (f.ai_suggestion_id) markSuggestion(db, f.ai_suggestion_id, ctx.user.id, Number(db.prepare('SELECT last_insert_rowid() AS id').get().id));
      log(db, ctx.user.id, 'Запись по телефону', `${owner.name}, ${pet?.name ?? f.pet_name}: ${svc.name}, ${f.date} ${f.time}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    redirect(res, `/queue?date=${f.date}&ok=booked`);
  });
}

