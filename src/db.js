// База данных клиники: SQLite через встроенный модуль node:sqlite (Node.js 22.13+).
// Схема меняется миграциями: номер версии хранится в PRAGMA user_version,
// поэтому уже созданный файл data/clinic.db обновляется без потери данных.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashPassword, randomPassword } from './auth.js';
import { localDate, addDays, weekday } from './util.js';

export const MIGRATIONS = [
  // v1 — первая версия сайта
  `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT,
    role          TEXT NOT NULL CHECK (role IN ('admin','reception','vet','client')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf       TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS doctors (
    user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialty TEXT NOT NULL,
    bio       TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS services (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL DEFAULT '',
    price        INTEGER NOT NULL CHECK (price >= 0),
    duration_min INTEGER NOT NULL DEFAULT 30,
    active       INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS pets (
    id         INTEGER PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    species    TEXT NOT NULL,
    breed      TEXT NOT NULL DEFAULT '',
    birth_date TEXT,
    notes      TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id         INTEGER PRIMARY KEY,
    pet_id     INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    vet_id     INTEGER NOT NULL REFERENCES users(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    starts_at  TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'booked'
               CHECK (status IN ('booked','arrived','done','cancelled')),
    complaint  TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS appt_vet_slot
    ON appointments(vet_id, starts_at) WHERE status <> 'cancelled';
  CREATE INDEX IF NOT EXISTS appt_day ON appointments(starts_at);
  CREATE TABLE IF NOT EXISTS records (
    id              INTEGER PRIMARY KEY,
    appointment_id  INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    diagnosis       TEXT NOT NULL,
    treatment       TEXT NOT NULL DEFAULT '',
    recommendations TEXT NOT NULL DEFAULT '',
    weight_kg       REAL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    details    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  `,

  // v2 — фото, отзывы, график врачей, счета, блокировка сотрудников
  `
  ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN phone_only INTEGER NOT NULL DEFAULT 0;   -- клиент записан по телефону, без входа на сайт
  CREATE INDEX users_phone ON users(phone);

  ALTER TABLE services ADD COLUMN is_vaccination INTEGER NOT NULL DEFAULT 0;
  UPDATE services SET is_vaccination = 1 WHERE name LIKE '%акцин%';

  ALTER TABLE appointments ADD COLUMN duration_min INTEGER NOT NULL DEFAULT 30;
  ALTER TABLE appointments ADD COLUMN price INTEGER NOT NULL DEFAULT 0;           -- цена услуги на момент записи
  ALTER TABLE appointments ADD COLUMN paid_at TEXT;
  ALTER TABLE appointments ADD COLUMN payment_method TEXT CHECK (payment_method IN ('cash','card'));
  ALTER TABLE appointments ADD COLUMN created_by INTEGER REFERENCES users(id);
  UPDATE appointments SET
    duration_min = (SELECT duration_min FROM services s WHERE s.id = service_id),
    price        = (SELECT price FROM services s WHERE s.id = service_id);
  CREATE INDEX appt_pet ON appointments(pet_id);
  CREATE INDEX pets_owner ON pets(owner_id);

  CREATE TABLE pet_photos (
    pet_id     INTEGER PRIMARY KEY REFERENCES pets(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    data       BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE reviews (
    id             INTEGER PRIMARY KEY,
    appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment        TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE vet_schedule (
    vet_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = воскресенье
    start_time TEXT NOT NULL,
    end_time   TEXT NOT NULL CHECK (end_time > start_time),
    PRIMARY KEY (vet_id, weekday)
  );
  INSERT INTO vet_schedule (vet_id, weekday, start_time, end_time)
    SELECT d.user_id, w.value, '09:00', '18:00' FROM doctors d, json_each('[0,1,2,3,4,5,6]') w;

  CREATE TABLE vet_time_off (
    id        INTEGER PRIMARY KEY,
    vet_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_from TEXT NOT NULL,
    date_to   TEXT NOT NULL CHECK (date_to >= date_from),
    reason    TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE items (
    id     INTEGER PRIMARY KEY,
    name   TEXT NOT NULL UNIQUE,
    kind   TEXT NOT NULL CHECK (kind IN ('drug','material')),
    price  INTEGER NOT NULL CHECK (price >= 0),
    active INTEGER NOT NULL DEFAULT 1
  );
  INSERT INTO items (name, kind, price) VALUES
    ('Антибиотик, инъекция', 'drug', 2500),
    ('Противовоспалительное, инъекция', 'drug', 1800),
    ('Капельница (система + раствор)', 'material', 4500),
    ('Обработка от паразитов', 'drug', 3000),
    ('Бинт и перевязка', 'material', 1200),
    ('Попона послеоперационная', 'material', 3500);

  CREATE TABLE invoice_lines (
    id             INTEGER PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    item_id        INTEGER REFERENCES items(id),
    name           TEXT NOT NULL,
    price          INTEGER NOT NULL CHECK (price >= 0),
    qty            INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    added_by       INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX invoice_appt ON invoice_lines(appointment_id);
  `,
];

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Миграция базы до версии ${v + 1} не удалась: ${e.message}`);
    }
  }
}

export function openDb(path = process.env.CLINIC_DB || 'data/clinic.db', { demo = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  if (demo) seed(db);
  return db;
}

export function log(db, userId, action, details = '') {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId ?? null, action, details);
}

// Итог счёта: цена услуги + добавленные лекарства и материалы.
export const INVOICE_TOTAL_SQL =
  '(a.price + COALESCE((SELECT SUM(l.price * l.qty) FROM invoice_lines l WHERE l.appointment_id = a.id), 0))';

// ---------- демонстрационные данные (только в пустую базу) ----------

// Детерминированный генератор случайных чисел — данные одинаковы при каждом сбросе.
function prng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  const rnd = prng(42);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const addUser = db.prepare(
    'INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)');
  const user = (email, pass, name, phone, role) =>
    Number(addUser.run(email, hashPassword(pass), name, phone, role).lastInsertRowid);

  db.exec('BEGIN');
  try {
    user('admin@khvost.local', 'Admin12345', 'Ирина Смирнова', '+7 700 000 00 01', 'admin');
    user('reception@khvost.local', 'Reception12345', 'Алия Нурланова', '+7 700 000 00 02', 'reception');

    const addDoc = db.prepare('INSERT INTO doctors (user_id, specialty, bio) VALUES (?, ?, ?)');
    const addHours = db.prepare('INSERT INTO vet_schedule (vet_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
    const hours = (vet, days, from, to) => days.forEach((d) => addHours.run(vet, d, from, to));

    const v1 = user('vet@khvost.local', 'Vet12345', 'Дмитрий Ковалёв', '+7 700 000 00 03', 'vet');
    addDoc.run(v1, 'Терапевт', 'Первичный приём, вакцинация, профилактика. Стаж 9 лет.');
    hours(v1, [0, 1, 2, 3, 4, 5, 6], '09:00', '18:00');
    const v2 = user('surgeon@khvost.local', 'Vet12345', 'Мария Ахметова', '+7 700 000 00 04', 'vet');
    addDoc.run(v2, 'Хирург', 'Плановые операции, стерилизация, травмы. Стаж 12 лет.');
    hours(v2, [1, 2, 3, 4, 5], '09:00', '15:00');
    const v3 = user('derm@khvost.local', 'Vet12345', 'Олег Ли', '+7 700 000 00 05', 'vet');
    addDoc.run(v3, 'Дерматолог', 'Кожа, шерсть, аллергии. Работает с экзотическими животными.');
    hours(v3, [0, 1, 2, 3, 4, 5, 6], '11:00', '18:00');
    const vets = [v1, v2, v3];

    const addSvc = db.prepare(
      'INSERT INTO services (name, description, price, duration_min, is_vaccination) VALUES (?, ?, ?, ?, ?)');
    const svc = [
      ['Первичный осмотр', 'Осмотр, сбор анамнеза, план лечения', 6000, 30, 0],
      ['Вакцинация', 'Комплексная прививка с отметкой в паспорте', 8000, 30, 1],
      ['Чипирование', 'Чип международного стандарта и регистрация', 7000, 30, 0],
      ['УЗИ брюшной полости', 'Диагностика с заключением врача', 12000, 30, 0],
      ['Стерилизация кошки', 'Операция под наркозом, послеоперационный осмотр', 35000, 60, 0],
      ['Консультация дерматолога', 'Осмотр кожи, соскоб, рекомендации', 7500, 30, 0],
    ].map((r) => ({ id: Number(addSvc.run(...r).lastInsertRowid), price: r[2], duration: r[3] }));
    // Кто какие услуги обычно оказывает
    const vetServices = { [v1]: [0, 1, 2, 3], [v2]: [4, 3, 0], [v3]: [5, 0] };

    const addPet = db.prepare(
      'INSERT INTO pets (owner_id, name, species, breed, birth_date, notes) VALUES (?, ?, ?, ?, ?, ?)');
    const pet = (...a) => Number(addPet.run(...a).lastInsertRowid);

    const c = user('client@khvost.local', 'Client12345', 'Анна Петрова', '+7 700 123 45 67', 'client');
    const barsik = pet(c, 'Барсик', 'Кошка', 'Британская', '2021-03-14', '');
    const rex = pet(c, 'Рекс', 'Собака', 'Лабрадор', '2019-07-02', 'Аллергия на курицу');

    // Ещё владельцы — чтобы в отчётах были данные
    const others = [
      ['Ержан Касымов', '+7 701 555 12 34', [['Тайсон', 'Собака', 'Немецкая овчарка'], ['Мия', 'Кошка', 'Сиамская']]],
      ['Светлана Ким', '+7 702 444 98 76', [['Пушок', 'Кролик', 'Карликовый']]],
      ['Арман Жумабаев', '+7 705 321 65 43', [['Лаки', 'Собака', 'Корги'], ['Соня', 'Кошка', 'Мейн-кун']]],
      ['Ольга Иванова', '+7 707 888 11 22', [['Граф', 'Собака', 'Доберман']]],
    ];
    const otherPets = [];
    others.forEach(([name, phone, pets], i) => {
      const id = user(`owner${i + 1}@example.kz`, randomPassword(), name, phone, 'client');
      for (const [n, sp, br] of pets) otherPets.push(pet(id, n, sp, br, `20${16 + i}-0${i + 2}-1${i}`, ''));
    });

    const addAppt = db.prepare(`INSERT INTO appointments
      (pet_id, vet_id, service_id, starts_at, status, complaint, duration_min, price, paid_at, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const appt = (petId, vet, s, at, status, complaint = '', paid = null) => Number(addAppt.run(
      petId, vet, s.id, at, status, complaint, s.duration, s.price,
      paid ? `${at.replace('T', ' ')}:00` : null, paid).lastInsertRowid);
    const addRecord = db.prepare('INSERT INTO records (appointment_id, diagnosis, treatment, recommendations, weight_kg) VALUES (?, ?, ?, ?, ?)');
    const addReview = db.prepare('INSERT INTO reviews (appointment_id, rating, comment) VALUES (?, ?, ?)');
    const addLine = db.prepare('INSERT INTO invoice_lines (appointment_id, item_id, name, price, qty) SELECT ?, id, name, price, ? FROM items WHERE id = ?');
    const schedule = db.prepare('SELECT start_time, end_time FROM vet_schedule WHERE vet_id = ? AND weekday = ?');

    const today = localDate();
    const diagnoses = [
      ['Здоров', 'Плановый осмотр', 'Повторный осмотр через год'],
      ['Гастрит', 'Диета, омепразол 5 дней', 'Кормить малыми порциями'],
      ['Аллергический дерматит', 'Антигистаминные, лечебный шампунь', 'Исключить курицу из рациона'],
      ['Отит', 'Капли в уши 7 дней', 'Контроль через неделю'],
      ['Послеоперационный период без осложнений', 'Снятие швов на 10-й день', 'Попона, ограничить активность'],
    ];
    const comments = ['Очень внимательный врач!', 'Всё объяснили, спасибо', 'Быстро и без очереди', 'Хорошо, но пришлось подождать', 'Лучшая клиника в городе', ''];

    // История Рекса: прививка 2 недели назад. У Барсика прививок нет — кабинет напомнит.
    const past = appt(rex, v1, svc[1], `${addDays(today, -14)}T10:00`, 'done', 'Плановая прививка', 'card');
    addRecord.run(past, 'Здоров', 'Вакцина Нобивак DHPPi+L', 'Следующая прививка через год', 31.5);
    addReview.run(past, 5, 'Рекс даже не испугался. Спасибо доктору!');

    // Прошедшие 45 дней: завершённые и оплаченные приёмы
    const hourTaken = db.prepare("SELECT 1 FROM appointments WHERE vet_id = ? AND substr(starts_at, 1, 13) = ?");
    for (let d = -45; d <= -1; d++) {
      const date = addDays(today, d);
      const used = new Set();
      const count = 6 + Math.floor(rnd() * 8);
      for (let k = 0; k < count; k++) {
        const vet = pick(vets);
        const h = schedule.get(vet, weekday(date));
        if (!h) continue;
        const s = svc[pick(vetServices[vet])];
        const startH = Number(h.start_time.slice(0, 2));
        const lastH = Number(h.end_time.slice(0, 2)) - Math.ceil(s.duration / 60);
        const time = `${String(startH + Math.floor(rnd() * (lastH - startH))).padStart(2, '0')}:${rnd() < 0.5 ? '00' : '30'}`;
        const key = `${vet}-${time.slice(0, 2)}`;
        if (used.has(key) || hourTaken.get(vet, `${date}T${time.slice(0, 2)}`)) continue;
        used.add(key);
        const cancelled = rnd() < 0.08;
        const id = appt(pick(otherPets), vet, s, `${date}T${time}`, cancelled ? 'cancelled' : 'done', '', cancelled ? null : (rnd() < 0.6 ? 'card' : 'cash'));
        if (cancelled) continue;
        const dx = s === svc[4] ? diagnoses[4] : s === svc[5] ? diagnoses[2] : pick(diagnoses.slice(0, 4));
        addRecord.run(id, ...dx, Math.round((3 + rnd() * 30) * 10) / 10);
        if (rnd() < 0.35) addLine.run(id, 1 + Math.floor(rnd() * 2), 1 + Math.floor(rnd() * 6));
        if (rnd() < 0.45) addReview.run(id, rnd() < 0.8 ? 5 : 4, pick(comments));
      }
    }

    // Ближайшие записи: в рабочие дни врачей
    const nextWorkday = (vet, from) => {
      for (let i = 0; i < 14; i++) { const d = addDays(from, i); if (schedule.get(vet, weekday(d))) return d; }
      return from;
    };
    appt(barsik, v1, svc[0], `${nextWorkday(v1, today)}T11:00`, 'booked', 'Плохо ест второй день');
    appt(rex, v3, svc[5], `${nextWorkday(v3, today)}T15:30`, 'booked', 'Чешется, выпадает шерсть');
    appt(barsik, v2, svc[4], `${nextWorkday(v2, addDays(today, 3))}T10:00`, 'booked', '');
    appt(otherPets[0], v1, svc[1], `${nextWorkday(v1, today)}T12:30`, 'booked', '');
    appt(otherPets[2], v3, svc[5], `${nextWorkday(v3, today)}T12:00`, 'booked', 'Шелушится кожа');

    log(db, null, 'Начальные данные', 'Созданы демонстрационные записи');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
