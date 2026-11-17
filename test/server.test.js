import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, MIGRATIONS } from '../src/db.js';
import { createApp } from '../src/server.js';
import { localDate, addDays, weekday } from '../src/util.js';

let server, base, db, backupDir;

before(async () => {
  db = openDb(':memory:');
  backupDir = mkdtempSync(join(tmpdir(), 'khvost-backup-'));
  server = http.createServer(createApp(db, { backupDir }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(backupDir, { recursive: true, force: true }); });

const csrfOf = (html) => html.match(/name="_csrf" value="([^"]+)"/)[1];

async function login(email, password) {
  const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email, password }) });
  assert.equal(r.status, 303, `вход ${email}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const page = await (await fetch(`${base}${r.headers.get('location')}`, { headers: { cookie } })).text();
  return { cookie, csrf: csrfOf(page) };
}

const get = (path, s) => fetch(`${base}${path}`, { redirect: 'manual', headers: s ? { cookie: s.cookie } : {} });
const html = async (path, s) => (await get(path, s)).text();
const post = (path, s, data) => fetch(`${base}${path}`, {
  method: 'POST', redirect: 'manual', headers: { cookie: s.cookie }, body: new URLSearchParams({ _csrf: s.csrf, ...data }),
});
const postMultipart = (path, s, fields, file) => {
  const fd = new FormData();
  fd.set('_csrf', s.csrf);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set(file.name, new Blob([file.data], { type: file.type }), file.filename);
  return fetch(`${base}${path}`, { method: 'POST', redirect: 'manual', headers: { cookie: s.cookie }, body: fd });
};

// Ближайший день, когда работает врач
// По умолчанию — через 20 дней: демо-записи создаются только на неделю вперёд
function workday(vetId, from = addDays(localDate(), 20)) {
  for (let i = 0; i < 14; i++) {
    const d = addDays(from, i);
    if (db.prepare('SELECT 1 FROM vet_schedule WHERE vet_id = ? AND weekday = ?').get(vetId, weekday(d))) return d;
  }
  throw new Error('нет рабочих дней');
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5b1c9b50000000049454e44ae426082', 'hex');

describe('сайт и вход', () => {
  test('главная показывает услуги, врачей, рейтинг и отзывы из базы', async () => {
    const page = await html('/');
    assert.match(page, /Первичный осмотр/);
    assert.match(page, /Врачи с лучшими отзывами/);
    assert.match(page, /отзыв/);
    assert.match(page, /пр\. Мангилик Ел, 20/, 'филиалы на главной');
    assert.match(page, /data-map=/, 'карта');
    assert.match(page, /\/doctors\/\d+\/photo/, 'портреты врачей');
  });

  test('неверный пароль не пускает, без входа — на страницу входа', async () => {
    const r = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ email: 'admin@khvost.local', password: 'nope' }) });
    assert.equal(r.status, 401);
    assert.equal((await get('/cabinet')).headers.get('location'), '/login');
  });

  test('после 5 неверных паролей вход закрывается даже с верным', async () => {
    const tryLogin = (password) => fetch(`${base}/login`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email: 'derm@khvost.local', password }) });
    for (let i = 0; i < 4; i++) assert.equal((await tryLogin('wrong')).status, 401);
    assert.equal((await tryLogin('wrong')).status, 429);
    const r = await tryLogin('Vet12345');
    assert.equal(r.status, 429);
    assert.match(await r.text(), /Слишком много неверных попыток/);
  });

  test('запрос без CSRF-токена отклоняется', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    assert.equal((await post('/pets', { ...s, csrf: 'wrong' }, { name: 'Хакер' })).status, 403);
  });

  test('владелец не видит страницы персонала и админки', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    for (const p of ['/queue', '/patients', '/admin', '/admin/reports', '/reception/book']) {
      assert.equal((await get(p, s)).status, 403, p);
    }
  });

  test('HTML в данных экранируется', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    await post('/pets', s, { name: '<script>alert(1)</script>', species: 'Кошка' });
    const page = await html('/cabinet', s);
    assert.ok(!page.includes('<script>alert(1)</script>'));
    assert.match(page, /&lt;script&gt;/);
  });
});

describe('владелец', () => {
  test('регистрация, питомец с фото и запись на свободное время', async () => {
    const r = await fetch(`${base}/register`, {
      method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ name: 'Тест Тестов', phone: '+7 700 111 22 33', email: 'new@test.kz', password: 'password1' }),
    });
    assert.equal(r.status, 303);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const s = { cookie, csrf: csrfOf(await html('/cabinet', { cookie })) };

    const add = await postMultipart('/pets', s, { name: 'Мурка', species: 'Кошка' }, { name: 'photo', data: PNG, type: 'image/png', filename: 'murka.png' });
    assert.equal(add.status, 303);
    const pet = db.prepare("SELECT p.id FROM pets p JOIN users u ON u.id = p.owner_id WHERE u.email = 'new@test.kz'").get();
    const photo = await get(`/pets/${pet.id}/photo`, s);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');

    const date = workday(3);
    const booking = { pet_id: pet.id, service_id: 1, vet_id: 3, date, time: '12:00', complaint: 'Чихает' };
    assert.equal((await post('/book', s, booking)).headers.get('location'), '/cabinet?ok=booked');

    const slots = await (await get(`/api/slots?vet=3&date=${date}&service=1`, s)).json();
    assert.equal(slots.slots.find((x) => x.time === '12:00').free, false);
    const twice = await post('/book', s, booking);
    assert.equal(twice.status, 400, 'одно время нельзя занять дважды');
    assert.match(await twice.text(), /уже занято/);
  });

  test('фото чужого питомца не отдаётся, не-картинка отклоняется', async () => {
    const other = await login('client@khvost.local', 'Client12345');
    const pet = db.prepare("SELECT p.id FROM pets p JOIN users u ON u.id = p.owner_id WHERE u.email = 'new@test.kz'").get();
    assert.equal((await get(`/pets/${pet.id}/photo`, other)).status, 404);
    const own = db.prepare("SELECT id FROM pets WHERE name = 'Барсик'").get();
    const bad = await postMultipart(`/pets/${own.id}/photo`, other, {}, { name: 'photo', data: Buffer.from('not an image'), type: 'image/png', filename: 'x.png' });
    assert.equal(bad.status, 400);
  });

  test('напоминание о прививке: у Барсика нет прививок, у Рекса есть свежая', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    const page = await html('/cabinet', s);
    assert.match(page, /Барсик: пора на прививку/);
    assert.doesNotMatch(page, /Рекс: пора на прививку/);
  });

  test('перенос записи на свободное время и отказ на занятое', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    const a = db.prepare(`SELECT a.* FROM appointments a JOIN pets p ON p.id = a.pet_id
      WHERE p.name = 'Барсик' AND a.status = 'booked' AND a.vet_id = 4`).get();
    const date = workday(4, addDays(localDate(), 25));
    const ok = await post(`/appointments/${a.id}/reschedule`, s, { date, time: '11:00' });
    assert.equal(ok.headers.get('location'), '/cabinet?ok=moved');
    assert.equal(db.prepare('SELECT starts_at FROM appointments WHERE id = ?').get(a.id).starts_at, `${date}T11:00`);

    // Стерилизация длится 60 минут: запись на 11:30 пересекается с 11:00–12:00, а на 12:00 — нет
    const rex = db.prepare("SELECT id FROM pets WHERE name = 'Рекс'").get();
    const clash = await post('/book', s, { pet_id: rex.id, service_id: 1, vet_id: 4, date, time: '11:30' });
    assert.equal(clash.status, 400);
    assert.equal((await post('/book', s, { pet_id: rex.id, service_id: 1, vet_id: 4, date, time: '12:00' })).status, 303);
    // Сдвиг на 30 минут пересекается сам с собой — это разрешено, но 11:30–12:30 задевает запись на 12:00
    assert.equal((await post(`/appointments/${a.id}/reschedule`, s, { date, time: '11:30' })).status, 400);
    assert.equal((await post(`/appointments/${a.id}/reschedule`, s, { date, time: '10:00' })).status, 303);
  });

  test('отзыв только после завершённого приёма и только один раз', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    const booked = db.prepare(`SELECT a.id FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE p.owner_id = 6 AND a.status = 'booked'`).get();
    assert.equal((await post(`/appointments/${booked.id}/review`, s, { rating: '5' })).status, 400);
    const done = db.prepare(`SELECT a.id FROM appointments a JOIN pets p ON p.id = a.pet_id WHERE p.name = 'Рекс' AND a.status = 'done'`).get();
    assert.equal((await post(`/appointments/${done.id}/review`, s, { rating: '4' })).status, 409, 'отзыв уже есть');
  });
});

describe('график врачей', () => {
  test('в выходной и отпуск врача слотов нет, вне графика записаться нельзя', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    let sunday = localDate();
    while (weekday(sunday) !== 0) sunday = addDays(sunday, 1);
    const off = await (await get(`/api/slots?vet=4&date=${sunday}`, s)).json();
    assert.equal(off.off, 'выходной');

    const day = workday(4);
    db.prepare("INSERT INTO vet_time_off (vet_id, date_from, date_to, reason) VALUES (4, ?, ?, 'Конференция')").run(day, day);
    assert.equal((await (await get(`/api/slots?vet=4&date=${day}`, s)).json()).off, 'Конференция');
    db.prepare('DELETE FROM vet_time_off WHERE vet_id = 4').run();

    // Хирург работает до 15:00 — 60-минутная операция в 14:30 не помещается
    const sterilization = db.prepare("SELECT id FROM services WHERE name = 'Стерилизация кошки'").get().id;
    const slots = (await (await get(`/api/slots?vet=4&date=${day}&service=${sterilization}`, s)).json()).slots;
    assert.equal(slots.at(-1).time, '14:00');
  });
});

describe('персонал', () => {
  test('регистратура отмечает приход, врач пишет протокол, владелец видит диагноз и оставляет отзыв', async () => {
    const appt = db.prepare("SELECT id FROM appointments WHERE status = 'booked' AND vet_id = 3 AND starts_at >= ? ORDER BY starts_at").get(localDate());
    const rec = await login('reception@khvost.local', 'Reception12345');
    assert.equal((await post(`/appointments/${appt.id}/status`, rec, { status: 'arrived' })).status, 303);

    const vet = await login('vet@khvost.local', 'Vet12345');
    assert.equal((await post(`/appointments/${appt.id}/record`, vet, { diagnosis: 'Гастрит', treatment: 'Диета', weight_kg: '4.2' })).status, 303);
    assert.equal(db.prepare('SELECT status FROM appointments WHERE id = ?').get(appt.id).status, 'done');

    const owner = db.prepare('SELECT o.email FROM appointments a JOIN pets p ON p.id = a.pet_id JOIN users o ON o.id = p.owner_id WHERE a.id = ?').get(appt.id);
    if (owner.email === 'client@khvost.local') {
      const cab = await login('client@khvost.local', 'Client12345');
      assert.match(await html('/cabinet', cab), /Гастрит/);
      assert.equal((await post(`/appointments/${appt.id}/review`, cab, { rating: '5', comment: 'Супер' })).status, 303);
    }
  });

  test('счёт: препараты, оплата, чек; после оплаты счёт закрыт', async () => {
    const appt = db.prepare("SELECT id, price FROM appointments WHERE status = 'done' AND paid_at IS NULL").get();
    const vet = await login('vet@khvost.local', 'Vet12345');
    const rec = await login('reception@khvost.local', 'Reception12345');
    const a = db.prepare('SELECT vet_id FROM appointments WHERE id = ?').get(appt.id);
    const who = a.vet_id === 3 ? vet : rec;
    assert.equal((await post(`/appointments/${appt.id}/lines`, who, { item_id: '1', qty: '2' })).status, 303);
    assert.equal((await post(`/appointments/${appt.id}/pay`, rec, { method: 'card' })).status, 303);
    const receipt = await html(`/appointments/${appt.id}/receipt`, rec);
    assert.match(receipt, /Кассовый чек/);
    assert.match(receipt, new RegExp(`${(appt.price + 5000).toLocaleString('ru-RU').replace(/\s/g, ' ')} ₸`));
    assert.equal((await post(`/appointments/${appt.id}/lines`, rec, { item_id: '1', qty: '1' })).status, 400);
  });

  test('поиск пациентов: кличка без учёта регистра, часть телефона', async () => {
    const s = await login('reception@khvost.local', 'Reception12345');
    assert.match(await html('/patients?q=барсик', s), /Барсик/);
    const byPhone = await html('/patients?q=123 45', s);
    assert.match(byPhone, /Анна Петрова/);
    const pet = db.prepare("SELECT id FROM pets WHERE name = 'Рекс'").get();
    const card = await html(`/patients/${pet.id}`, s);
    assert.match(card, /Аллергия на курицу/);
    assert.match(card, /Последняя прививка/);
  });

  test('запись по телефону нового владельца; потом он регистрируется и видит свою карту', async () => {
    const s = await login('reception@khvost.local', 'Reception12345');
    const date = workday(3);
    const r = await post('/reception/book', s, {
      phone: '+7 777 000 11 22', owner_name: 'Бауыржан Сеитов', pet_id: 'new', pet_name: 'Шарик', species: 'Собака',
      service_id: '1', vet_id: '3', date, time: '16:00',
    });
    assert.equal(r.status, 303);
    const u = db.prepare("SELECT * FROM users WHERE name = 'Бауыржан Сеитов'").get();
    assert.equal(u.phone_only, 1);

    const reg = await fetch(`${base}/register`, {
      method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ name: 'Бауыржан Сеитов', phone: '87770001122', email: 'baur@test.kz', password: 'password1' }),
    });
    const cookie = reg.headers.get('set-cookie').split(';')[0];
    assert.match(await html('/cabinet', { cookie }), /Шарик/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE name = 'Бауыржан Сеитов'").get().n, 1);
  });
});

describe('администратор', () => {
  test('отчёты с графиками и выгрузка CSV для Excel', async () => {
    const s = await login('admin@khvost.local', 'Admin12345');
    const page = await html('/admin/reports?days=30', s);
    assert.match(page, /<svg class="chart"/);
    assert.match(page, /Загрузка врачей/);
    const csv = await get(`/admin/export.csv?from=${addDays(localDate(), -30)}&to=${localDate()}`, s);
    assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
    const bytes = Buffer.from(await csv.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM — чтобы Excel понял UTF-8');
    const text = bytes.subarray(3).toString('utf8');
    assert.ok(text.startsWith('№;Дата;Время;Филиал;Пациент'));
    assert.ok(text.split('\r\n').length > 20);
  });

  test('новый врач, график, блокировка', async () => {
    const s = await login('admin@khvost.local', 'Admin12345');
    const r = await post('/admin/staff', s, { name: 'Ева Новикова', email: 'eva@khvost.local', role: 'vet', specialty: 'Офтальмолог', password: 'Eva12345' });
    assert.equal(r.status, 303);
    const id = Number(r.headers.get('location').match(/staff\/(\d+)/)[1]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vet_schedule WHERE vet_id = ?').get(id).n, 5);
    assert.match(await html('/doctors'), /Ева Новикова/);

    assert.equal((await post(`/admin/staff/${id}/schedule`, s, { on_6: '1', start_6: '10:00', end_6: '14:00' })).status, 303);
    assert.deepEqual(db.prepare('SELECT weekday, start_time, end_time FROM vet_schedule WHERE vet_id = ?').all(id).map((x) => ({ ...x })),
      [{ weekday: 6, start_time: '10:00', end_time: '14:00' }]);

    const eva = await login('eva@khvost.local', 'Eva12345');
    assert.equal((await post(`/admin/staff/${id}/block`, s, {})).status, 303);
    assert.equal((await get('/queue', eva)).headers.get('location'), '/login', 'сессия закрыта');
    const again = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ email: 'eva@khvost.local', password: 'Eva12345' }) });
    assert.equal(again.status, 403);
    assert.doesNotMatch(await html('/doctors'), /Ева Новикова/);
  });

  test('цены услуг и препаратов меняются, старые записи сохраняют свою цену', async () => {
    const s = await login('admin@khvost.local', 'Admin12345');
    const before = db.prepare('SELECT id, price FROM appointments WHERE service_id = 1 ORDER BY id LIMIT 1').get();
    assert.equal((await post('/admin/services/1', s, { name: 'Первичный осмотр', price: '6500', duration_min: '30', active: '1' })).status, 303);
    assert.equal(db.prepare('SELECT price FROM services WHERE id = 1').get().price, 6500);
    assert.equal(db.prepare('SELECT price FROM appointments WHERE id = ?').get(before.id).price, before.price);
    assert.equal((await post('/admin/items', s, { name: 'Витамины', kind: 'drug', price: '900', active: '1' })).status, 303);
    assert.match(await html('/admin', s), /Изменена услуга/);
  });

  test('резервная копия создаётся, открывается как база и скачивается', async () => {
    const s = await login('admin@khvost.local', 'Admin12345');
    assert.equal((await post('/admin/backups', s, {})).status, 303);
    const [name] = readdirSync(backupDir);
    assert.match(name, /^clinic-.*\.db$/);
    const copy = new DatabaseSync(join(backupDir, name));
    assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM appointments').get().n > 50);
    copy.close();
    const dl = await get(`/admin/backups/${name}`, s);
    assert.equal(dl.status, 200);
    assert.equal((await get('/admin/backups/..%2Fsecret.db', s)).status, 404);
  });
});

describe('филиалы и врачи', () => {
  test('10 филиалов на карте и в списке, у каждого свои врачи', async () => {
    const page = await html('/branches');
    assert.equal((page.match(/class="card branch-card"/g) ?? []).length, 10);
    const data = JSON.parse(page.match(/data-map="([^"]+)"/)[1].replaceAll('&quot;', '"'));
    assert.equal(data.length, 10);
    assert.ok(data.every((b) => b.lat > 51 && b.lat < 51.3 && b.lng > 71.2 && b.lng < 71.7), 'координаты в Астане');
    assert.match(page, /Тауелсиздик/);
  });

  test('фильтр врачей по специализации и филиалу', async () => {
    const surgeons = await html('/doctors?specialty=Хирург');
    assert.match(surgeons, /Мария Ахметова/);
    assert.doesNotMatch(surgeons, /Олег Ли/);
    const b2 = await html('/doctors?branch=2');
    assert.match(b2, /Олег Ли/);
    assert.doesNotMatch(b2, /Мария Ахметова/);
  });

  test('портрет врача рисуется, загруженное фото его заменяет', async () => {
    const svg = await get('/doctors/3/photo');
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    const s = await login('admin@khvost.local', 'Admin12345');
    assert.equal((await postMultipart('/admin/staff/3/photo', s, {}, { name: 'photo', data: PNG, type: 'image/png', filename: 'me.png' })).status, 303);
    assert.equal((await get('/doctors/3/photo')).headers.get('content-type'), 'image/png');
    assert.equal((await post('/admin/staff/3/photo/delete', s, {})).status, 303);
    assert.match((await get('/doctors/3/photo')).headers.get('content-type'), /svg/);
    assert.equal((await get('/art/pet/cat.svg')).status, 200);
  });

  test('запись сохраняет филиал врача; отчёт показывает выручку по филиалам', async () => {
    const s = await login('client@khvost.local', 'Client12345');
    const rex = db.prepare("SELECT id FROM pets WHERE name = 'Рекс'").get();
    const vet = db.prepare("SELECT user_id, branch_id FROM doctors WHERE branch_id = 9 LIMIT 1").get();
    const date = workday(vet.user_id, addDays(localDate(), 30));
    const { slots } = await (await get(`/api/slots?vet=${vet.user_id}&date=${date}&service=1`, s)).json();
    const time = slots.find((x) => x.free).time;
    assert.equal((await post('/book', s, { pet_id: rex.id, service_id: 1, vet_id: vet.user_id, branch_id: 9, date, time })).status, 303);
    assert.equal(db.prepare('SELECT branch_id FROM appointments WHERE starts_at = ? AND vet_id = ?').get(`${date}T${time}`, vet.user_id).branch_id, 9);
    const admin = await login('admin@khvost.local', 'Admin12345');
    assert.match(await html('/admin/reports?days=30', admin), /Кенесары/);
  });
});

describe('миграции', () => {
  test('база первой версии обновляется без потери данных', () => {
    const dir = mkdtempSync(join(tmpdir(), 'khvost-mig-'));
    const file = join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec(MIGRATIONS[0]);
    old.exec(`INSERT INTO users (id, email, password_hash, name, role) VALUES (1, 'v@x', 'x', 'Врач', 'vet');
      INSERT INTO doctors (user_id, specialty) VALUES (1, 'Терапевт');
      INSERT INTO services (id, name, price, duration_min) VALUES (1, 'Вакцинация', 8000, 30);
      INSERT INTO users (id, email, password_hash, name, role) VALUES (2, 'c@x', 'x', 'Клиент', 'client');
      INSERT INTO pets (id, owner_id, name, species) VALUES (1, 2, 'Бобик', 'Собака');
      INSERT INTO appointments (pet_id, vet_id, service_id, starts_at) VALUES (1, 1, 1, '2026-01-10T10:00');`);
    old.close();

    const db2 = openDb(file);
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
    assert.equal(db2.prepare('SELECT price FROM appointments').get().price, 8000, 'цена перенесена из услуги');
    assert.equal(db2.prepare('SELECT is_vaccination FROM services').get().is_vaccination, 1);
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM vet_schedule').get().n, 7, 'старому врачу выдан график');
    assert.equal(db2.prepare("SELECT name FROM pets").get().name, 'Бобик');
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM branches').get().n, 10, 'филиалы добавлены');
    assert.equal(db2.prepare('SELECT branch_id FROM appointments').get().branch_id, 1, 'старые записи — в главный филиал');
    db2.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
