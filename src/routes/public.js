// Главная, вход, регистрация, выход.
import { log } from '../db.js';
import { verifyPassword, hashPassword, createSession, destroySession } from '../auth.js';
import { HttpError, readForm, redirect, json, send, sessionCookie } from '../http.js';
import { petSvg, heroSvg, doctorSvg, SPECIES_ART } from '../art.js';
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

  const doctorsWithRating = (where = '', ...params) => db.prepare(`
      SELECT u.id, u.name, d.specialty, d.bio, d.gender, d.experience_years, d.branch_id, b.name AS branch_name,
             (SELECT AVG(r.rating) FROM reviews r JOIN appointments a ON a.id = r.appointment_id WHERE a.vet_id = u.id) AS rating,
             (SELECT COUNT(*) FROM reviews r JOIN appointments a ON a.id = r.appointment_id WHERE a.vet_id = u.id) AS reviews
      FROM doctors d JOIN users u ON u.id = d.user_id LEFT JOIN branches b ON b.id = d.branch_id
      WHERE u.blocked = 0 ${where}`).all(...params);

  route('GET', '/', (ctx, res) => {
    const doctors = doctorsWithRating()
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews).slice(0, 8);
    const reviews = db.prepare(`
      SELECT r.rating, r.comment, r.created_at, o.name AS owner_name, p.name AS pet_name, p.species, v.name AS vet_name
      FROM reviews r JOIN appointments a ON a.id = r.appointment_id
      JOIN pets p ON p.id = a.pet_id JOIN users o ON o.id = p.owner_id JOIN users v ON v.id = a.vet_id
      WHERE r.id IN (SELECT MAX(id) FROM reviews WHERE length(comment) > 12 AND rating >= 4 GROUP BY comment)
      ORDER BY r.created_at DESC LIMIT 6`).all()
      .map((r) => ({ ...r, art: SPECIES_ART[r.species] ?? 'paw' }));
    const clinic = db.prepare(`SELECT (SELECT AVG(rating) FROM reviews) AS rating, (SELECT COUNT(*) FROM reviews) AS reviews,
      (SELECT COUNT(*) FROM appointments WHERE status = 'done') AS visits,
      (SELECT COUNT(*) FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.blocked = 0) AS doctors`).get();
    page(res, ctx, 'Ветеринарная клиника в Астане', view.home({ services: app.services(), doctors, reviews, clinic, branches: app.branches(), user: ctx.user }), { full: true, map: true });
  });

  route('GET', '/branches', (ctx, res) => {
    const doctorsByBranch = Map.groupBy(app.doctors(), (d) => d.branch_id);
    page(res, ctx, 'Филиалы', view.branchesPage({ branches: app.branches(), doctorsByBranch }), { full: true, map: true });
  });

  route('GET', '/doctors', (ctx, res) => {
    const p = ctx.url.searchParams;
    const filter = { specialty: p.get('specialty') ?? '', branch: Number(p.get('branch')) || '' };
    let doctors = doctorsWithRating().sort((a, b) => a.branch_id - b.branch_id || a.name.localeCompare(b.name));
    const specialties = [...new Set(doctors.map((d) => d.specialty))].sort();
    if (filter.specialty) doctors = doctors.filter((d) => d.specialty === filter.specialty);
    if (filter.branch) doctors = doctors.filter((d) => d.branch_id === filter.branch);
    page(res, ctx, 'Врачи', view.doctorsPage({ doctors, specialties, branches: app.branches(), filter }), { full: true });
  });

  // Иллюстрации и фото
  const svg = (res, body) => send(res, 200, body, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  route('GET', '/art/hero.svg', (ctx, res) => svg(res, heroSvg()));
  route('GET', '/art/pet/*name', (ctx, res, req, { name }) => svg(res, petSvg(name.replace(/\.svg$/, ''))));
  route('GET', '/doctors/:id/photo', (ctx, res, req, { id }) => {
    const photo = db.prepare('SELECT mime, data FROM staff_photos WHERE user_id = ?').get(Number(id));
    if (photo) return send(res, 200, Buffer.from(photo.data), { 'Content-Type': photo.mime, 'Cache-Control': 'public, max-age=60' });
    const d = db.prepare('SELECT gender FROM doctors WHERE user_id = ?').get(Number(id));
    if (!d) throw new HttpError(404);
    svg(res, doctorSvg(id, d.gender));
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
