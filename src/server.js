// HTTP-сервер ветклиники «Доктор Хвост». Только встроенные модули Node.js.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, log } from './db.js';
import { verifyPassword, hashPassword, createSession, getSession, destroySession } from './auth.js';
import { localDate, localDateTime, addDays, isDate, SLOTS, STATUS } from './util.js';
import * as view from './views.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const BOOK_DAYS_AHEAD = 60;
const STAFF = ['reception', 'vet', 'admin'];

const FLASH = {
  registered: ['ok', 'Кабинет создан. Добавьте питомца и запишитесь на приём.'],
  booked: ['ok', 'Вы записаны! Ждём вас в клинике.'],
  pet: ['ok', 'Питомец добавлен.'],
  cancelled: ['ok', 'Запись отменена.'],
  status: ['ok', 'Статус обновлён.'],
  record: ['ok', 'Протокол сохранён, приём завершён.'],
  service: ['ok', 'Услуга сохранена.'],
  denied: ['error', 'Это действие недоступно.'],
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- помощники запроса/ответа ----------
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('='))
    .filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]));
}

async function readForm(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk);
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  return Object.fromEntries([...params].map(([k, v]) => [k, v.trim()]));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    ...headers,
  });
  res.end(body);
}

const redirect = (res, to, headers = {}) => send(res, 303, '', { Location: to, ...headers });
const json = (res, data) => send(res, 200, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });

function sessionCookie(token, maxAge) {
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function createApp(db) {
  // ---------- запросы к базе ----------
  const q = {
    services: db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY price'),
    allServices: db.prepare('SELECT * FROM services ORDER BY active DESC, name'),
    doctors: db.prepare(`SELECT u.id, u.name, d.specialty, d.bio FROM doctors d JOIN users u ON u.id = d.user_id ORDER BY u.name`),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    pets: db.prepare('SELECT * FROM pets WHERE owner_id = ? ORDER BY name'),
    apptBase: `
      SELECT a.*, p.name AS pet_name, p.species, p.breed, p.birth_date, p.notes, p.owner_id,
             s.name AS service_name, s.price, v.name AS vet_name,
             o.name AS owner_name, o.phone AS owner_phone
      FROM appointments a
      JOIN pets p ON p.id = a.pet_id
      JOIN services s ON s.id = a.service_id
      JOIN users v ON v.id = a.vet_id
      JOIN users o ON o.id = p.owner_id`,
  };
  const apptById = db.prepare(`${q.apptBase} WHERE a.id = ?`);

  function page(res, ctx, title, body, extra = {}) {
    send(res, extra.status ?? 200, view.layout({ title, body, user: ctx.user, csrf: ctx.user?.csrf, flash: ctx.flash }));
  }

  function requireRole(ctx, roles) {
    if (!ctx.user) throw new HttpError(401);
    if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'Недостаточно прав');
  }

  function checkCsrf(ctx, form) {
    if (!ctx.user || form._csrf !== ctx.user.csrf) throw new HttpError(403, 'Сессия устарела. Обновите страницу и попробуйте ещё раз.');
  }

  // ---------- маршруты ----------
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; })}$`);
    routes.push({ method, re, keys, handler });
  };

  route('GET', '/', (ctx, res) => {
    page(res, ctx, 'Ветеринарная клиника', view.home({ services: q.services.all(), doctors: q.doctors.all(), user: ctx.user }));
  });

  route('GET', '/health', (ctx, res) => json(res, { ok: true, db: db.prepare('SELECT 1 AS x').get().x === 1 }));

  // --- вход/регистрация ---
  route('GET', '/login', (ctx, res) => {
    if (ctx.user) return redirect(res, homeFor(ctx.user));
    page(res, ctx, 'Вход', view.login({}));
  });

  route('POST', '/login', async (ctx, res, req) => {
    const form = await readForm(req);
    const user = q.userByEmail.get(form.email ?? '');
    if (!user || !verifyPassword(form.password ?? '', user.password_hash)) {
      return page(res, ctx, 'Вход', view.login({ error: 'Неверная почта или пароль', email: form.email }), { status: 401 });
    }
    const s = createSession(db, user.id);
    log(db, user.id, 'Вход', user.email);
    redirect(res, homeFor(user), { 'Set-Cookie': sessionCookie(s.token, s.maxAge) });
  });

  route('GET', '/register', (ctx, res) => {
    if (ctx.user) return redirect(res, homeFor(ctx.user));
    page(res, ctx, 'Регистрация', view.register({}));
  });

  route('POST', '/register', async (ctx, res, req) => {
    const f = await readForm(req);
    let error = '';
    if (!f.name || f.name.length > 80) error = 'Укажите имя.';
    else if (!/^\+?[\d\s()-]{10,20}$/.test(f.phone ?? '')) error = 'Проверьте номер телефона.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email ?? '')) error = 'Проверьте почту.';
    else if ((f.password ?? '').length < 8) error = 'Пароль должен быть не короче 8 символов.';
    else if (q.userByEmail.get(f.email)) error = 'Кабинет с такой почтой уже есть — войдите.';
    if (error) return page(res, ctx, 'Регистрация', view.register({ error, values: f }), { status: 400 });

    const id = Number(db.prepare('INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)')
      .run(f.email, hashPassword(f.password), f.name, f.phone, 'client').lastInsertRowid);
    log(db, id, 'Регистрация', f.email);
    const s = createSession(db, id);
    redirect(res, '/cabinet?ok=registered', { 'Set-Cookie': sessionCookie(s.token, s.maxAge) });
  });

  route('POST', '/logout', async (ctx, res, req) => {
    const form = await readForm(req);
    if (ctx.user && form._csrf === ctx.user.csrf) destroySession(db, ctx.user.token);
    redirect(res, '/', { 'Set-Cookie': sessionCookie('', 0) });
  });

  // --- кабинет владельца ---
  route('GET', '/cabinet', (ctx, res) => {
    requireRole(ctx, ['client']);
    const now = localDateTime();
    const upcoming = db.prepare(`${q.apptBase}
      WHERE p.owner_id = ? AND a.starts_at >= ? AND a.status IN ('booked','arrived') ORDER BY a.starts_at`)
      .all(ctx.user.id, now.slice(0, 10));
    const history = db.prepare(`
      SELECT a.id, a.starts_at, a.status, p.name AS pet_name, s.name AS service_name, v.name AS vet_name,
             r.diagnosis, r.treatment, r.recommendations, r.weight_kg
      FROM appointments a JOIN records r ON r.appointment_id = a.id
      JOIN pets p ON p.id = a.pet_id JOIN services s ON s.id = a.service_id JOIN users v ON v.id = a.vet_id
      WHERE p.owner_id = ? ORDER BY a.starts_at DESC`).all(ctx.user.id);
    page(res, ctx, 'Кабинет', view.cabinet({ user: ctx.user, pets: q.pets.all(ctx.user.id), upcoming, history, csrf: ctx.user.csrf, now }));
  });

  route('POST', '/pets', async (ctx, res, req) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    if (!f.name) throw new HttpError(400, 'Укажите кличку питомца.');
    if (f.birth_date && (!isDate(f.birth_date) || f.birth_date > localDate())) throw new HttpError(400, 'Неверная дата рождения.');
    db.prepare('INSERT INTO pets (owner_id, name, species, breed, birth_date, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ctx.user.id, f.name.slice(0, 40), (f.species || 'Другое').slice(0, 20), (f.breed ?? '').slice(0, 60), f.birth_date || null, (f.notes ?? '').slice(0, 200));
    log(db, ctx.user.id, 'Добавлен питомец', f.name);
    redirect(res, '/cabinet?ok=pet');
  });

  // --- запись ---
  function bookPage(ctx, res, values, error, status = 200) {
    const today = localDate();
    page(res, ctx, 'Запись на приём', view.book({
      pets: q.pets.all(ctx.user.id), services: q.services.all(), doctors: q.doctors.all(),
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
    const today = localDate();
    const pet = db.prepare('SELECT id, name FROM pets WHERE id = ? AND owner_id = ?').get(Number(f.pet_id), ctx.user.id);
    const vet = db.prepare('SELECT user_id FROM doctors WHERE user_id = ?').get(Number(f.vet_id));
    const svc = db.prepare('SELECT id, name FROM services WHERE id = ? AND active = 1').get(Number(f.service_id));
    const startsAt = `${f.date}T${f.time}`;
    let error = '';
    if (!pet || !vet || !svc) error = 'Выберите питомца, услугу и врача.';
    else if (!isDate(f.date ?? '') || f.date < today || f.date > addDays(today, BOOK_DAYS_AHEAD)) error = `Можно записаться на ближайшие ${BOOK_DAYS_AHEAD} дней.`;
    else if (!SLOTS.includes(f.time)) error = 'Выберите время приёма.';
    else if (startsAt <= localDateTime()) error = 'Это время уже прошло.';
    if (error) return bookPage(ctx, res, f, error, 400);
    try {
      db.prepare('INSERT INTO appointments (pet_id, vet_id, service_id, starts_at, complaint) VALUES (?, ?, ?, ?, ?)')
        .run(pet.id, vet.user_id, svc.id, startsAt, (f.complaint ?? '').slice(0, 500));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return bookPage(ctx, res, { ...f, time: '' }, 'Это время только что заняли. Выберите другое.', 409);
      throw e;
    }
    log(db, ctx.user.id, 'Запись', `${pet.name}: ${svc.name}, ${startsAt.replace('T', ' ')}`);
    redirect(res, '/cabinet?ok=booked');
  });

  route('GET', '/api/slots', (ctx, res) => {
    if (!ctx.user) throw new HttpError(401);
    const date = ctx.url.searchParams.get('date') ?? '';
    const vet = Number(ctx.url.searchParams.get('vet'));
    if (!isDate(date) || !vet) throw new HttpError(400, 'Нужны date и vet');
    const taken = new Set(db.prepare(`SELECT substr(starts_at, 12, 5) AS t FROM appointments
      WHERE vet_id = ? AND starts_at LIKE ? AND status <> 'cancelled'`).all(vet, `${date}T%`).map((r) => r.t));
    const now = localDateTime();
    json(res, { date, slots: SLOTS.map((t) => ({ time: t, free: !taken.has(t) && `${date}T${t}` > now })) });
  });

  route('POST', '/appointments/:id/cancel', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['client']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = apptById.get(Number(id));
    if (!a || a.owner_id !== ctx.user.id || a.status !== 'booked' || a.starts_at <= localDateTime()) return redirect(res, '/cabinet?ok=denied');
    db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(a.id);
    log(db, ctx.user.id, 'Отмена записи', `#${a.id} ${a.pet_name}, ${a.starts_at.replace('T', ' ')}`);
    redirect(res, '/cabinet?ok=cancelled');
  });

  // --- персонал ---
  route('GET', '/queue', (ctx, res) => {
    requireRole(ctx, STAFF);
    const p = ctx.url.searchParams;
    const date = isDate(p.get('date') ?? '') ? p.get('date') : localDate();
    const vetFilter = ctx.user.role === 'vet' ? ctx.user.id : Number(p.get('vet')) || '';
    const rows = db.prepare(`${q.apptBase} WHERE a.starts_at LIKE ? ${vetFilter ? 'AND a.vet_id = ?' : ''} ORDER BY a.starts_at, v.name`)
      .all(`${date}T%`, ...(vetFilter ? [vetFilter] : []));
    page(res, ctx, 'Очередь', view.queue({
      user: ctx.user, date, prev: addDays(date, -1), next: addDays(date, 1), rows,
      doctors: q.doctors.all(), vetFilter: ctx.user.role === 'vet' ? '' : vetFilter, csrf: ctx.user.csrf,
    }));
  });

  route('POST', '/appointments/:id/status', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['reception', 'admin']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = apptById.get(Number(id));
    const allowed = { booked: ['arrived', 'cancelled'], arrived: ['cancelled'] };
    if (!a || !allowed[a.status]?.includes(f.status)) throw new HttpError(400, 'Нельзя перевести запись в этот статус.');
    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(f.status, a.id);
    log(db, ctx.user.id, 'Статус записи', `#${a.id} ${a.pet_name}: ${STATUS[f.status]}`);
    redirect(res, `/queue?date=${a.starts_at.slice(0, 10)}&ok=status`);
  });

  route('GET', '/appointments/:id', (ctx, res, req, { id }) => {
    requireRole(ctx, STAFF);
    const a = apptById.get(Number(id));
    if (!a) throw new HttpError(404);
    const record = db.prepare('SELECT * FROM records WHERE appointment_id = ?').get(a.id);
    const history = db.prepare(`SELECT a.starts_at, s.name AS service_name, v.name AS vet_name, r.diagnosis, r.treatment
      FROM appointments a JOIN records r ON r.appointment_id = a.id JOIN services s ON s.id = a.service_id JOIN users v ON v.id = a.vet_id
      WHERE a.pet_id = ? AND a.id <> ? ORDER BY a.starts_at DESC`).all(a.pet_id, a.id);
    page(res, ctx, a.pet_name, view.appointment({ user: ctx.user, a, record, history, csrf: ctx.user.csrf }));
  });

  route('POST', '/appointments/:id/record', async (ctx, res, req, { id }) => {
    requireRole(ctx, ['vet']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const a = apptById.get(Number(id));
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

  // --- администратор ---
  route('GET', '/admin', (ctx, res) => {
    requireRole(ctx, ['admin']);
    const today = localDate();
    const stats = {
      today: db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE starts_at LIKE ? AND status <> 'cancelled'").get(`${today}T%`).n,
      week: db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE starts_at >= ? AND starts_at < ? AND status <> 'cancelled'").get(today, addDays(today, 8)).n,
      revenue: db.prepare(`SELECT COALESCE(SUM(s.price), 0) AS n FROM appointments a JOIN services s ON s.id = a.service_id
        WHERE a.status = 'done' AND a.starts_at >= ?`).get(`${today.slice(0, 7)}-01`).n,
      clients: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'client'").get().n,
    };
    const byService = db.prepare(`SELECT s.name, COUNT(*) AS n FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.status <> 'cancelled' AND a.starts_at >= ? GROUP BY s.id ORDER BY n DESC`).all(addDays(today, -30));
    const log = db.prepare(`SELECT l.*, u.name AS user_name FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.id DESC LIMIT 50`).all();
    const users = db.prepare('SELECT name, email, role FROM users ORDER BY role, name').all();
    page(res, ctx, 'Сводка', view.admin({ stats, byService, services: q.allServices.all(), log, users, csrf: ctx.user.csrf }));
  });

  async function saveService(ctx, res, req, id) {
    requireRole(ctx, ['admin']);
    const f = await readForm(req);
    checkCsrf(ctx, f);
    const price = Number(f.price);
    const duration = Number(f.duration_min);
    if (!f.name || !Number.isInteger(price) || price < 0 || !Number.isInteger(duration) || duration < 10) throw new HttpError(400, 'Проверьте название, цену и длительность.');
    const active = f.active === '1' ? 1 : 0;
    try {
      if (id) db.prepare('UPDATE services SET name = ?, price = ?, duration_min = ?, active = ? WHERE id = ?').run(f.name, price, duration, active, id);
      else db.prepare('INSERT INTO services (name, price, duration_min, active) VALUES (?, ?, ?, ?)').run(f.name, price, duration, active);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Услуга с таким названием уже есть.');
      throw e;
    }
    log(db, ctx.user.id, id ? 'Изменена услуга' : 'Новая услуга', `${f.name}: ${price} ₸`);
    redirect(res, '/admin?ok=service');
  }
  route('POST', '/admin/services', (ctx, res, req) => saveService(ctx, res, req, null));
  route('POST', '/admin/services/:id', (ctx, res, req, { id }) => saveService(ctx, res, req, Number(id)));

  // ---------- обработчик ----------
  async function serveStatic(res, pathname) {
    const file = normalize(join(PUBLIC, pathname.slice('/static/'.length)));
    if (!file.startsWith(PUBLIC)) throw new HttpError(404);
    try {
      const data = await readFile(file);
      send(res, 200, data, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
    } catch {
      throw new HttpError(404);
    }
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const ctx = { url, user: null, flash: null };
    try {
      if (req.method === 'GET' && url.pathname.startsWith('/static/')) return await serveStatic(res, url.pathname);
      ctx.user = getSession(db, parseCookies(req.headers.cookie).sid);
      const f = FLASH[url.searchParams.get('ok')];
      if (f) ctx.flash = { type: f[0], text: f[1] };

      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re);
        if (m) {
          const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
          return await r.handler(ctx, res, req, params);
        }
      }
      throw new HttpError(404);
    } catch (e) {
      if (res.headersSent) return res.end();
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 401) return redirect(res, '/login');
      if (status === 500) console.error(e);
      if (url.pathname.startsWith('/api/')) return send(res, status, JSON.stringify({ error: e.message || 'error' }), { 'Content-Type': 'application/json; charset=utf-8' });
      const titles = { 400: 'Проверьте данные', 403: 'Нет доступа', 404: 'Страница не найдена', 409: 'Конфликт', 413: 'Слишком большой запрос', 500: 'Ошибка сервера' };
      const text = status === 500 ? 'Что-то пошло не так. Попробуйте ещё раз.' : e.message || 'Такой страницы нет.';
      page(res, ctx, titles[status] ?? 'Ошибка', view.message(titles[status] ?? 'Ошибка', text), { status });
    }
  };
}

function homeFor(user) {
  return { client: '/cabinet', admin: '/admin' }[user.role] ?? '/queue';
}

// Запуск: node src/server.js
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const db = openDb();
  const port = Number(process.env.PORT) || 8000;
  const host = process.env.HOST || '127.0.0.1';
  http.createServer(createApp(db)).listen(port, host, () => {
    console.log(`Доктор Хвост работает: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  });
}
