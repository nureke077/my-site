// Главная, вход, регистрация, выход.
import { log } from '../db.js';
import { verifyPassword, hashPassword, createSession, destroySession } from '../auth.js';
import { readForm, redirect, json, sessionCookie } from '../http.js';
import { digits, samePhone, WEEK } from '../util.js';
import * as view from '../views/public.js';

export function homeFor(user) {
  return { client: '/cabinet', admin: '/admin' }[user.role] ?? '/queue';
}

// «Пн–Пт 09:00–15:00, Сб 10:00–14:00»
export function formatHours(rows) {
  const byDay = new Map(rows.map((r) => [r.weekday, `${r.start_time}–${r.end_time}`]));
  if (byDay.size === 7 && new Set(byDay.values()).size === 1) return `ежедневно ${[...byDay.values()][0]}`;
  const groups = [];
  for (const [d, label] of WEEK) {
    const h = byDay.get(d);
    const last = groups.at(-1);
    if (h && last && last.h === h && last.end === WEEK.findIndex(([x]) => x === d) - 1) {
      last.to = label; last.end += 1;
    } else if (h) {
      groups.push({ from: label, to: label, h, end: WEEK.findIndex(([x]) => x === d) });
    }
  }
  return groups.map((g) => `${g.from}${g.to !== g.from ? `–${g.to}` : ''} ${g.h}`).join(', ');
}

export default function register(app) {
  const { db, route, page } = app;

  route('GET', '/', (ctx, res) => {
    const doctors = db.prepare(`
      SELECT u.id, u.name, d.specialty, d.bio,
             (SELECT AVG(r.rating) FROM reviews r JOIN appointments a ON a.id = r.appointment_id WHERE a.vet_id = u.id) AS rating,
             (SELECT COUNT(*) FROM reviews r JOIN appointments a ON a.id = r.appointment_id WHERE a.vet_id = u.id) AS reviews
      FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.blocked = 0 ORDER BY u.name`).all()
      .map((d) => ({ ...d, hours: formatHours(db.prepare('SELECT * FROM vet_schedule WHERE vet_id = ?').all(d.id)) }));
    const reviews = db.prepare(`
      SELECT r.rating, r.comment, r.created_at, o.name AS owner_name, v.name AS vet_name
      FROM reviews r JOIN appointments a ON a.id = r.appointment_id
      JOIN pets p ON p.id = a.pet_id JOIN users o ON o.id = p.owner_id JOIN users v ON v.id = a.vet_id
      WHERE r.comment <> '' ORDER BY r.id DESC LIMIT 6`).all();
    const clinic = db.prepare(`SELECT (SELECT AVG(rating) FROM reviews) AS rating, (SELECT COUNT(*) FROM reviews) AS reviews,
      (SELECT COUNT(*) FROM pets) AS patients`).get();
    page(res, ctx, 'Ветеринарная клиника', view.home({ services: app.services(), doctors, reviews, clinic, user: ctx.user }));
  });

  route('GET', '/health', (ctx, res) => json(res, { ok: true, db: db.prepare('SELECT 1 AS x').get().x === 1 }));

  route('GET', '/login', (ctx, res) => {
    if (ctx.user) return redirect(res, homeFor(ctx.user));
    page(res, ctx, 'Вход', view.login({}));
  });

  route('POST', '/login', async (ctx, res, req) => {
    const form = await readForm(req);
    const key = String(form.email ?? '').toLowerCase();
    const show = (error, status) => page(res, ctx, 'Вход', view.login({ error, email: form.email }), { status });

    const locked = app.limiter.lockedFor(key);
    if (locked) return show(`Слишком много неверных попыток. Попробуйте через ${Math.ceil(locked / 60)} мин.`, 429);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(key);
    if (!user || user.phone_only || !verifyPassword(form.password ?? '', user.password_hash)) {
      app.limiter.fail(key);
      const nowLocked = app.limiter.lockedFor(key);
      if (nowLocked) {
        log(db, user?.id, 'Блокировка входа', `${key}: 5 неверных паролей`);
        return show(`Слишком много неверных попыток. Вход закрыт на ${Math.ceil(nowLocked / 60)} мин.`, 429);
      }
      return show('Неверная почта или пароль', 401);
    }
    if (user.blocked) return show('Учётная запись заблокирована. Обратитесь к администратору.', 403);

    app.limiter.reset(key);
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
    else if (digits(f.phone).length < 10 || digits(f.phone).length > 15) error = 'Проверьте номер телефона.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email ?? '')) error = 'Проверьте почту.';
    else if ((f.password ?? '').length < 8) error = 'Пароль должен быть не короче 8 символов.';
    else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(f.email)) error = 'Кабинет с такой почтой уже есть — войдите.';
    if (error) return page(res, ctx, 'Регистрация', view.register({ error, values: f }), { status: 400 });

    // Если регистратура уже записывала этого владельца по телефону — отдаём ему его карту.
    const phoneOnly = db.prepare("SELECT id, phone FROM users WHERE role = 'client' AND phone_only = 1").all()
      .find((u) => samePhone(u.phone, f.phone));
    let id;
    if (phoneOnly) {
      id = phoneOnly.id;
      db.prepare('UPDATE users SET email = ?, password_hash = ?, name = ?, phone_only = 0 WHERE id = ?')
        .run(f.email, hashPassword(f.password), f.name, id);
      log(db, id, 'Регистрация', `${f.email} (карта, созданная регистратурой)`);
    } else {
      id = Number(db.prepare('INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)')
        .run(f.email, hashPassword(f.password), f.name, f.phone, 'client').lastInsertRowid);
      log(db, id, 'Регистрация', f.email);
    }
    const s = createSession(db, id);
    redirect(res, '/cabinet?ok=registered', { 'Set-Cookie': sessionCookie(s.token, s.maxAge) });
  });

  route('POST', '/logout', async (ctx, res, req) => {
    const form = await readForm(req);
    if (ctx.user && form._csrf === ctx.user.csrf) destroySession(db, ctx.user.token);
    redirect(res, '/', { 'Set-Cookie': sessionCookie('', 0) });
  });
}
