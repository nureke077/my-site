// Администратор: сводка, отчёты, CSV, сотрудники и график, прайс, резервные копии.
import { mkdirSync, readdirSync, statSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { log, INVOICE_TOTAL_SQL } from '../db.js';
import { hashPassword } from '../auth.js';
import { HttpError, readForm, redirect, send, toCsv } from '../http.js';
import { localDate, localDateTime, addDays, isDate, isTime, weekday, toMin, digits, STATUS, PAYMENT, ROLE, ITEM_KIND } from '../util.js';
import { formatHours } from './public.js';
import * as view from '../views/admin.js';

const MAX_BACKUPS = 30;

export default function register(app) {
  const { db, route, page, requireRole, checkCsrf } = app;
  const admin = (ctx) => requireRole(ctx, ['admin']);
  async function adminForm(ctx, req) {
    admin(ctx);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    return f;
  }

  // ---------- сводка ----------
  route('GET', '/admin', (ctx, res) => {
    admin(ctx);
    const today = localDate();
    const one = (sql, ...p) => db.prepare(sql).get(...p);
    const unpaid = one(`SELECT COUNT(*) AS n, COALESCE(SUM(${INVOICE_TOTAL_SQL}), 0) AS s FROM appointments a
      WHERE a.status = 'done' AND a.paid_at IS NULL`);
    const stats = {
      today: one("SELECT COUNT(*) AS n FROM appointments WHERE starts_at LIKE ? AND status <> 'cancelled'", `${today}T%`).n,
      week: one("SELECT COUNT(*) AS n FROM appointments WHERE starts_at >= ? AND starts_at < ? AND status <> 'cancelled'", today, addDays(today, 8)).n,
      revenue: one(`SELECT COALESCE(SUM(${INVOICE_TOTAL_SQL}), 0) AS n FROM appointments a WHERE a.paid_at >= ?`, `${today.slice(0, 7)}-01`).n,
      rating: one('SELECT AVG(rating) AS r FROM reviews').r,
      unpaid: unpaid.n,
      unpaidSum: unpaid.s,
    };
    const logRows = db.prepare(`SELECT l.*, u.name AS user_name FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.id DESC LIMIT 50`).all();
    page(res, ctx, 'Сводка', view.dashboard({ stats, log: logRows }));
  });

  // ---------- отчёты ----------
  function period(params) {
    const today = localDate();
    const days = Number(params.get('days'));
    let from = params.get('from');
    let to = params.get('to');
    if (days > 0 && days <= 366) { to = today; from = addDays(today, -(days - 1)); }
    if (!isDate(to ?? '')) to = today;
    if (!isDate(from ?? '') || from > to) from = addDays(to, -29);
    if (from < addDays(to, -365)) from = addDays(to, -365);
    return { from, to, end: addDays(to, 1) };
  }

  function dates(from, to) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  route('GET', '/admin/reports', (ctx, res) => {
    admin(ctx);
    const { from, to, end } = period(ctx.url.searchParams);
    const range = [from, end];

    const byDay = new Map(db.prepare(`
      SELECT substr(a.starts_at, 1, 10) AS d,
             SUM(a.status = 'done') AS visits,
             COALESCE(SUM(CASE WHEN a.paid_at IS NOT NULL THEN ${INVOICE_TOTAL_SQL} END), 0) AS revenue
      FROM appointments a WHERE a.starts_at >= ? AND a.starts_at < ? GROUP BY d`).all(...range).map((r) => [r.d, r]));
    const daily = dates(from, to).map((d) => ({ date: d, visits: byDay.get(d)?.visits ?? 0, revenue: byDay.get(d)?.revenue ?? 0 }));

    const t = db.prepare(`
      SELECT COUNT(*) AS total, SUM(a.status = 'done') AS done, SUM(a.status = 'cancelled') AS cancelled,
             SUM(a.paid_at IS NOT NULL) AS paid,
             COALESCE(SUM(CASE WHEN a.paid_at IS NOT NULL THEN ${INVOICE_TOTAL_SQL} END), 0) AS revenue
      FROM appointments a WHERE a.starts_at >= ? AND a.starts_at < ?`).get(...range);
    const totals = {
      revenue: t.revenue, done: t.done ?? 0,
      avg: t.paid ? Math.round(t.revenue / t.paid) : 0,
      cancelRate: t.total ? Math.round(((t.cancelled ?? 0) / t.total) * 100) : 0,
    };

    // Загрузка врача = минуты записей / минуты по графику (без отпусков)
    const vets = db.prepare('SELECT u.id, u.name FROM doctors d JOIN users u ON u.id = d.user_id ORDER BY u.name').all().map((v) => {
      const sched = new Map(db.prepare('SELECT weekday, start_time, end_time FROM vet_schedule WHERE vet_id = ?').all(v.id)
        .map((s) => [s.weekday, toMin(s.end_time) - toMin(s.start_time)]));
      const offs = db.prepare('SELECT date_from, date_to FROM vet_time_off WHERE vet_id = ? AND date_to >= ? AND date_from <= ?').all(v.id, from, to);
      const workMin = dates(from, to).reduce((s, d) => s + (offs.some((o) => d >= o.date_from && d <= o.date_to) ? 0 : sched.get(weekday(d)) ?? 0), 0);
      const r = db.prepare(`SELECT SUM(a.status = 'done') AS visits, COALESCE(SUM(a.duration_min), 0) AS busy,
          COALESCE(SUM(CASE WHEN a.paid_at IS NOT NULL THEN ${INVOICE_TOTAL_SQL} END), 0) AS revenue
        FROM appointments a WHERE a.vet_id = ? AND a.status <> 'cancelled' AND a.starts_at >= ? AND a.starts_at < ?`).get(v.id, ...range);
      return {
        name: v.name, visits: r.visits ?? 0, revenue: r.revenue,
        busyH: Math.round((r.busy / 60) * 10) / 10, workH: Math.round(workMin / 60),
        load: workMin ? Math.min(100, Math.round((r.busy / workMin) * 100)) : 0,
      };
    }).sort((a, b) => b.load - a.load);

    const services = db.prepare(`
      SELECT s.name, COUNT(*) AS n, COALESCE(SUM(CASE WHEN a.paid_at IS NOT NULL THEN ${INVOICE_TOTAL_SQL} END), 0) AS revenue
      FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.status <> 'cancelled' AND a.starts_at >= ? AND a.starts_at < ?
      GROUP BY s.id ORDER BY n DESC`).all(...range);

    page(res, ctx, 'Отчёты', view.reports({ from, to, totals, daily, vets, services }));
  });

  route('GET', '/admin/export.csv', (ctx, res) => {
    admin(ctx);
    const { from, to, end } = period(ctx.url.searchParams);
    const rows = db.prepare(`
      SELECT a.id, a.starts_at, p.name AS pet, p.species, o.name AS owner, o.phone, v.name AS vet, s.name AS service,
             a.status, ${INVOICE_TOTAL_SQL} AS total, a.payment_method, a.paid_at, r.diagnosis
      FROM appointments a JOIN pets p ON p.id = a.pet_id JOIN users o ON o.id = p.owner_id
      JOIN users v ON v.id = a.vet_id JOIN services s ON s.id = a.service_id
      LEFT JOIN records r ON r.appointment_id = a.id
      WHERE a.starts_at >= ? AND a.starts_at < ? ORDER BY a.starts_at`).all(from, end);
    const csv = toCsv([
      ['№', 'Дата', 'Время', 'Пациент', 'Вид', 'Владелец', 'Телефон', 'Врач', 'Услуга', 'Статус', 'Сумма, ₸', 'Оплата', 'Оплачено', 'Диагноз'],
      ...rows.map((r) => [r.id, r.starts_at.slice(0, 10), r.starts_at.slice(11, 16), r.pet, r.species, r.owner, r.phone, r.vet, r.service,
        STATUS[r.status], r.total, PAYMENT[r.payment_method] ?? '', r.paid_at ?? '', r.diagnosis ?? '']),
    ]);
    log(db, ctx.user.id, 'Выгрузка CSV', `${from} — ${to}, строк: ${rows.length}`);
    send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="khvost-${from}_${to}.csv"`,
    });
  });

  // ---------- сотрудники ----------
  function staffListPage(ctx, res, error, values, status = 200) {
    const staff = db.prepare(`SELECT u.*, d.specialty FROM users u LEFT JOIN doctors d ON d.user_id = u.id
      WHERE u.role <> 'client' ORDER BY u.blocked, u.role, u.name`).all()
      .map((u) => ({ ...u, hours: u.role === 'vet' ? formatHours(db.prepare('SELECT * FROM vet_schedule WHERE vet_id = ?').all(u.id)) || 'нет приёма' : '' }));
    page(res, ctx, 'Сотрудники', view.staffList({ staff, csrf: ctx.user.csrf, error, values }), { status });
  }

  route('GET', '/admin/staff', (ctx, res) => { admin(ctx); staffListPage(ctx, res); });

  route('POST', '/admin/staff', async (ctx, res, req) => {
    const f = await adminForm(ctx, req);
    let error = '';
    if (!f.name) error = 'Укажите имя.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email ?? '')) error = 'Проверьте почту.';
    else if (!['vet', 'reception', 'admin'].includes(f.role)) error = 'Выберите роль.';
    else if (f.role === 'vet' && !f.specialty) error = 'Укажите специализацию врача.';
    else if ((f.password ?? '').length < 8) error = 'Пароль — не короче 8 символов.';
    else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(f.email)) error = 'Такая почта уже занята.';
    if (error) return staffListPage(ctx, res, error, f, 400);

    db.exec('BEGIN');
    try {
      const id = Number(db.prepare('INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)')
        .run(f.email, hashPassword(f.password), f.name.slice(0, 80), f.phone || null, f.role).lastInsertRowid);
      if (f.role === 'vet') {
        db.prepare('INSERT INTO doctors (user_id, specialty) VALUES (?, ?)').run(id, f.specialty.slice(0, 60));
        const add = db.prepare("INSERT INTO vet_schedule (vet_id, weekday, start_time, end_time) VALUES (?, ?, '09:00', '18:00')");
        for (const d of [1, 2, 3, 4, 5]) add.run(id, d);
      }
      log(db, ctx.user.id, 'Новый сотрудник', `${f.name}, ${ROLE[f.role]}`);
      db.exec('COMMIT');
      redirect(res, `/admin/staff/${id}?ok=staff`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  });

  const staffById = (id) => {
    const u = db.prepare(`SELECT u.*, d.specialty, d.bio FROM users u LEFT JOIN doctors d ON d.user_id = u.id
      WHERE u.id = ? AND u.role <> 'client'`).get(Number(id));
    if (!u) throw new HttpError(404);
    return u;
  };

  route('GET', '/admin/staff/:id', (ctx, res, req, { id }) => {
    admin(ctx);
    const u = staffById(id);
    const today = localDate();
    page(res, ctx, u.name, view.staffEdit({
      u, me: ctx.user.id, csrf: ctx.user.csrf, today,
      schedule: db.prepare('SELECT * FROM vet_schedule WHERE vet_id = ?').all(u.id),
      timeOff: db.prepare('SELECT * FROM vet_time_off WHERE vet_id = ? AND date_to >= ? ORDER BY date_from').all(u.id, today),
      futureCount: db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE vet_id = ? AND status = 'booked' AND starts_at > ?").get(u.id, localDateTime()).n,
    }));
  });

  route('POST', '/admin/staff/:id', async (ctx, res, req, { id }) => {
    const f = await adminForm(ctx, req);
    const u = staffById(id);
    if (!f.name) throw new HttpError(400, 'Укажите имя.');
    if (f.phone && digits(f.phone).length < 10) throw new HttpError(400, 'Проверьте телефон.');
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(f.name.slice(0, 80), f.phone || null, u.id);
    if (u.role === 'vet') {
      if (!f.specialty) throw new HttpError(400, 'Укажите специализацию.');
      db.prepare('UPDATE doctors SET specialty = ?, bio = ? WHERE user_id = ?').run(f.specialty.slice(0, 60), (f.bio ?? '').slice(0, 300), u.id);
    }
    log(db, ctx.user.id, 'Изменён сотрудник', f.name);
    redirect(res, `/admin/staff/${u.id}?ok=staff`);
  });

  route('POST', '/admin/staff/:id/password', async (ctx, res, req, { id }) => {
    const f = await adminForm(ctx, req);
    const u = staffById(id);
    if ((f.password ?? '').length < 8) throw new HttpError(400, 'Пароль — не короче 8 символов.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(f.password), u.id);
    if (u.id !== ctx.user.id) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    log(db, ctx.user.id, 'Смена пароля', u.name);
    redirect(res, `/admin/staff/${u.id}?ok=staff`);
  });

  route('POST', '/admin/staff/:id/block', async (ctx, res, req, { id }) => {
    await adminForm(ctx, req);
    const u = staffById(id);
    if (u.id === ctx.user.id) throw new HttpError(400, 'Себя заблокировать нельзя.');
    const blocked = u.blocked ? 0 : 1;
    db.prepare('UPDATE users SET blocked = ? WHERE id = ?').run(blocked, u.id);
    if (blocked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    log(db, ctx.user.id, blocked ? 'Блокировка сотрудника' : 'Разблокировка сотрудника', u.name);
    redirect(res, `/admin/staff/${u.id}?ok=staff`);
  });

  route('POST', '/admin/staff/:id/schedule', async (ctx, res, req, { id }) => {
    const f = await adminForm(ctx, req);
    const u = staffById(id);
    if (u.role !== 'vet') throw new HttpError(400, 'График есть только у врачей.');
    const rows = [];
    for (let d = 0; d < 7; d++) {
      if (f[`on_${d}`] !== '1') continue;
      const s = f[`start_${d}`]; const e = f[`end_${d}`];
      if (!isTime(s) || !isTime(e) || s >= e) throw new HttpError(400, 'Время начала должно быть раньше окончания.');
      if (toMin(s) % 30 || toMin(e) % 30) throw new HttpError(400, 'Время указывается с шагом 30 минут (например, 09:00 или 09:30).');
      rows.push([d, s, e]);
    }
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM vet_schedule WHERE vet_id = ?').run(u.id);
      const add = db.prepare('INSERT INTO vet_schedule (vet_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
      for (const r of rows) add.run(u.id, ...r);
      log(db, ctx.user.id, 'График врача', `${u.name}: ${formatHours(rows.map(([weekday, start_time, end_time]) => ({ weekday, start_time, end_time }))) || 'нет приёма'}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    redirect(res, `/admin/staff/${u.id}?ok=schedule`);
  });

  route('POST', '/admin/staff/:id/timeoff', async (ctx, res, req, { id }) => {
    const f = await adminForm(ctx, req);
    const u = staffById(id);
    if (!isDate(f.date_from ?? '') || !isDate(f.date_to ?? '') || f.date_to < f.date_from) throw new HttpError(400, 'Проверьте даты отпуска.');
    db.prepare('INSERT INTO vet_time_off (vet_id, date_from, date_to, reason) VALUES (?, ?, ?, ?)').run(u.id, f.date_from, f.date_to, (f.reason ?? '').slice(0, 60));
    log(db, ctx.user.id, 'Отпуск врача', `${u.name}: ${f.date_from} — ${f.date_to}`);
    redirect(res, `/admin/staff/${u.id}?ok=schedule`);
  });

  route('POST', '/admin/staff/:id/timeoff/:tid/delete', async (ctx, res, req, { id, tid }) => {
    await adminForm(ctx, req);
    const u = staffById(id);
    db.prepare('DELETE FROM vet_time_off WHERE id = ? AND vet_id = ?').run(Number(tid), u.id);
    redirect(res, `/admin/staff/${u.id}?ok=schedule`);
  });

  // ---------- прайс ----------
  route('GET', '/admin/prices', (ctx, res) => {
    admin(ctx);
    page(res, ctx, 'Прайс', view.prices({
      services: db.prepare('SELECT * FROM services ORDER BY active DESC, name').all(),
      items: db.prepare('SELECT * FROM items ORDER BY active DESC, kind, name').all(),
      csrf: ctx.user.csrf,
    }));
  });

  function priceFields(f) {
    const price = Number(f.price);
    if (!f.name || !Number.isInteger(price) || price < 0) throw new HttpError(400, 'Проверьте название и цену.');
    return { name: f.name.slice(0, 80), price, active: f.active === '1' ? 1 : 0 };
  }
  const uniqueGuard = (fn) => {
    try { fn(); } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Позиция с таким названием уже есть.');
      throw e;
    }
  };

  async function saveService(ctx, res, req, id) {
    const f = await adminForm(ctx, req);
    const { name, price, active } = priceFields(f);
    const duration = Number(f.duration_min);
    if (!Number.isInteger(duration) || duration < 30 || duration % 30) throw new HttpError(400, 'Длительность — 30, 60, 90… минут.');
    const vacc = f.is_vaccination === '1' ? 1 : 0;
    uniqueGuard(() => {
      if (id) db.prepare('UPDATE services SET name = ?, price = ?, duration_min = ?, active = ?, is_vaccination = ? WHERE id = ?').run(name, price, duration, active, vacc, id);
      else db.prepare('INSERT INTO services (name, price, duration_min, active, is_vaccination) VALUES (?, ?, ?, ?, ?)').run(name, price, duration, active, vacc);
    });
    log(db, ctx.user.id, id ? 'Изменена услуга' : 'Новая услуга', `${name}: ${price} ₸`);
    redirect(res, '/admin/prices?ok=service');
  }
  route('POST', '/admin/services', (ctx, res, req) => saveService(ctx, res, req, null));
  route('POST', '/admin/services/:id', (ctx, res, req, { id }) => saveService(ctx, res, req, Number(id)));

  async function saveItem(ctx, res, req, id) {
    const f = await adminForm(ctx, req);
    const { name, price, active } = priceFields(f);
    if (!ITEM_KIND[f.kind]) throw new HttpError(400, 'Выберите тип.');
    uniqueGuard(() => {
      if (id) db.prepare('UPDATE items SET name = ?, kind = ?, price = ?, active = ? WHERE id = ?').run(name, f.kind, price, active, id);
      else db.prepare('INSERT INTO items (name, kind, price, active) VALUES (?, ?, ?, ?)').run(name, f.kind, price, active);
    });
    log(db, ctx.user.id, id ? 'Изменён препарат' : 'Новый препарат', `${name}: ${price} ₸`);
    redirect(res, '/admin/prices?ok=service');
  }
  route('POST', '/admin/items', (ctx, res, req) => saveItem(ctx, res, req, null));
  route('POST', '/admin/items/:id', (ctx, res, req, { id }) => saveItem(ctx, res, req, Number(id)));

  // ---------- резервные копии ----------
  const listBackups = () => {
    try {
      return readdirSync(app.backupDir).filter((n) => /^clinic-[\d_-]+\.db$/.test(n))
        .map((name) => { const s = statSync(join(app.backupDir, name)); return { name, size: s.size, created: s.mtime.toLocaleString('ru-RU') }; })
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch { return []; }
  };

  route('GET', '/admin/backups', (ctx, res) => {
    admin(ctx);
    page(res, ctx, 'Резервные копии', view.backups({ files: listBackups(), dir: app.backupDir, csrf: ctx.user.csrf }));
  });

  route('POST', '/admin/backups', async (ctx, res, req) => {
    await adminForm(ctx, req);
    mkdirSync(app.backupDir, { recursive: true });
    const stamp = localDateTime().replace('T', '_').replace(':', '-');
    let name = `clinic-${stamp}.db`;
    for (let i = 1; listBackups().some((b) => b.name === name); i++) name = `clinic-${stamp}-${i}.db`;
    // VACUUM INTO делает целостную копию даже во время работы сайта
    db.prepare('VACUUM INTO ?').run(join(app.backupDir, name));
    for (const old of listBackups().slice(MAX_BACKUPS)) rmSync(join(app.backupDir, old.name));
    log(db, ctx.user.id, 'Резервная копия', name);
    redirect(res, '/admin/backups?ok=backup');
  });

  route('GET', '/admin/backups/*name', (ctx, res, req, { name }) => {
    admin(ctx);
    if (!listBackups().some((b) => b.name === name)) throw new HttpError(404);
    send(res, 200, readFileSync(join(app.backupDir, name)), {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Disposition': `attachment; filename="${name}"`,
    });
  });
}
