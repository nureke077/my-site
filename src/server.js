// HTTP-сервер ветклиники «Доктор Хвост». Только встроенные модули Node.js.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { getSession, LoginLimiter } from './auth.js';
import { HttpError, parseCookies, send, redirect } from './http.js';
import { layout, message } from './views/layout.js';
import registerPublic from './routes/public.js';
import registerClient from './routes/client.js';
import registerStaff from './routes/staff.js';
import registerAdmin from './routes/admin.js';
import registerAi from './routes/ai.js';
import registerPm from './routes/pm.js';
import registerLabReports from './routes/labreport.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const FLASH = {
  registered: ['ok', 'Кабинет создан. Добавьте питомца и запишитесь на приём.'],
  booked: ['ok', 'Запись создана.'],
  pet: ['ok', 'Питомец добавлен.'],
  photo: ['ok', 'Фото обновлено.'],
  cancelled: ['ok', 'Запись отменена.'],
  moved: ['ok', 'Запись перенесена.'],
  review: ['ok', 'Спасибо за отзыв!'],
  status: ['ok', 'Статус обновлён.'],
  record: ['ok', 'Протокол сохранён, приём завершён.'],
  line: ['ok', 'Счёт обновлён.'],
  paid: ['ok', 'Оплата принята.'],
  service: ['ok', 'Прайс сохранён.'],
  staff: ['ok', 'Данные сотрудника сохранены.'],
  schedule: ['ok', 'График сохранён.'],
  backup: ['ok', 'Резервная копия создана.'],
  denied: ['error', 'Это действие недоступно.'],
};

export function createApp(db, { backupDir = process.env.CLINIC_BACKUPS || 'backups', limiter = new LoginLimiter() } = {}) {
  const routes = [];
  const app = {
    db,
    limiter,
    backupDir: resolve(backupDir),

    // ':id' — число, '*name' — имя файла
    route(method, pattern, handler) {
      const keys = [];
      const re = new RegExp(`^${pattern
        .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; })
        .replace(/\*(\w+)/g, (_, k) => { keys.push(k); return '([\\w.-]+)'; })}$`);
      routes.push({ method, re, keys, handler });
    },

    // full — страница сама раскладывает секции на всю ширину (главная, филиалы); иначе — колонка
    page(res, ctx, title, body, { status = 200, full = false, map = false } = {}) {
      const branches = db.prepare('SELECT id, name, address FROM branches ORDER BY id').all();
      send(res, status, layout({
        title, body: full ? body : `<div class="container page">${body}</div>`, map, branches,
        user: ctx.user, csrf: ctx.user?.csrf, flash: ctx.flash, path: ctx.url.pathname,
      }));
    },

    requireRole(ctx, roles) {
      if (!ctx.user) throw new HttpError(401);
      if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'Недостаточно прав');
    },

    checkCsrf(ctx, form) {
      if (!ctx.user || form._csrf !== ctx.user.csrf) throw new HttpError(403, 'Сессия устарела. Обновите страницу и попробуйте ещё раз.');
    },

    // Запись со всеми связанными данными
    apptSql: `
      SELECT a.*, p.name AS pet_name, p.species, p.breed, p.birth_date, p.notes, p.owner_id,
             s.name AS service_name, s.icon AS service_icon, v.name AS vet_name,
             o.name AS owner_name, o.phone AS owner_phone,
             b.name AS branch_name, b.address AS branch_address,
             (SELECT 1 FROM pet_photos ph WHERE ph.pet_id = p.id) AS has_photo
      FROM appointments a
      JOIN pets p ON p.id = a.pet_id
      JOIN services s ON s.id = a.service_id
      JOIN users v ON v.id = a.vet_id
      JOIN users o ON o.id = p.owner_id
      LEFT JOIN branches b ON b.id = a.branch_id`,
  };
  app.apptById = (id) => db.prepare(`${app.apptSql} WHERE a.id = ?`).get(Number(id));
  app.doctors = () => db.prepare(`SELECT u.id, u.name, d.specialty, d.bio, d.gender, d.experience_years, d.branch_id, b.name AS branch_name
    FROM doctors d JOIN users u ON u.id = d.user_id LEFT JOIN branches b ON b.id = d.branch_id
    WHERE u.blocked = 0 ORDER BY b.id, u.name`).all();
  app.branches = () => db.prepare('SELECT * FROM branches ORDER BY id').all();
  app.services = () => db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY category, price').all();

  registerPublic(app);
  registerClient(app);
  registerStaff(app);
  registerAdmin(app);
  registerAi(app);
  registerPm(app);
  registerLabReports(app);

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
    const ctx = { url, user: null, flash: null, ip: req.socket.remoteAddress };
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
      if (url.pathname.startsWith('/api/')) {
        return send(res, status, JSON.stringify({ error: e.message || 'error' }), { 'Content-Type': 'application/json; charset=utf-8' });
      }
      const titles = { 400: 'Проверьте данные', 403: 'Нет доступа', 404: 'Страница не найдена', 409: 'Конфликт', 413: 'Слишком большой запрос', 429: 'Слишком много попыток', 500: 'Ошибка сервера' };
      const text = status === 500 ? 'Что-то пошло не так. Попробуйте ещё раз.' : e.message || 'Такой страницы нет.';
      app.page(res, ctx, titles[status] ?? 'Ошибка', message(titles[status] ?? 'Ошибка', text), { status });
    }
  };
}

// Запуск: node src/server.js
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(resolve(process.argv[1]))) {
  const db = openDb();
  const port = Number(process.env.PORT) || 8000;
  const host = process.env.HOST || '127.0.0.1';
  const server = http.createServer(createApp(db));
  server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`\nПорт ${port} уже занят — скорее всего, сайт уже запущен в другом окне.
Закройте то окно (или нажмите в нём Ctrl + C) и запустите снова.
Остановить все копии Node.js:  taskkill /IM node.exe /F
Или запустить на другом порту:  $env:PORT=${port + 1}; node src/server.js\n`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`Доктор Хвост работает: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  });
}
