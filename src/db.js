// База данных клиники: SQLite через встроенный модуль node:sqlite (Node.js 22.13+).
// Схема меняется миграциями: номер версии хранится в PRAGMA user_version,
// поэтому уже созданный файл data/clinic.db обновляется без потери данных.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { seed } from './seed.js';

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

  // v3 — филиалы в Астане, фото сотрудников, категории и иконки услуг
  `
  CREATE TABLE branches (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    district     TEXT NOT NULL,
    address      TEXT NOT NULL,
    phone        TEXT NOT NULL,
    lat          REAL NOT NULL,
    lng          REAL NOT NULL,
    hours        TEXT NOT NULL,
    is_24h       INTEGER NOT NULL DEFAULT 0,
    has_surgery  INTEGER NOT NULL DEFAULT 0,
    has_lab      INTEGER NOT NULL DEFAULT 0,
    has_hospital INTEGER NOT NULL DEFAULT 0,
    description  TEXT NOT NULL DEFAULT ''
  );
  INSERT INTO branches (id, name, district, address, phone, lat, lng, hours, is_24h, has_surgery, has_lab, has_hospital, description) VALUES
    (1,  'Есиль',        'Есильский район',    'пр. Мангилик Ел, 20',            '+7 7172 20 00 01', 51.0920, 71.4180, 'Круглосуточно', 1, 1, 1, 1, 'Главная клиника: операционная, стационар и лаборатория.'),
    (2,  'Хан Шатыр',    'Есильский район',    'пр. Туран, 37',                  '+7 7172 20 00 02', 51.1310, 71.4040, '09:00–21:00',   0, 0, 1, 0, 'Рядом с ТРЦ «Хан Шатыр», удобная парковка.'),
    (3,  'Сыганак',      'Есильский район',    'ул. Сыганак, 10',                '+7 7172 20 00 03', 51.1110, 71.4290, '09:00–21:00',   0, 1, 1, 0, 'Хирургия и УЗИ-диагностика.'),
    (4,  'Улы Дала',     'Есильский район',    'пр. Улы Дала, 7',                '+7 7172 20 00 04', 51.1215, 71.3850, '09:00–20:00',   0, 0, 0, 0, 'Терапия и стоматология для собак и кошек.'),
    (5,  'Республики',   'Алматинский район',  'пр. Республики, 34',             '+7 7172 20 00 05', 51.1625, 71.4390, '09:00–21:00',   0, 0, 1, 0, 'В центре правого берега.'),
    (6,  'Абай',         'Сарыаркинский район','пр. Абая, 49',                   '+7 7172 20 00 06', 51.1665, 71.4255, '09:00–20:00',   0, 0, 0, 0, 'Приём экзотических животных: птицы, грызуны, рептилии.'),
    (7,  'Сарыарка',     'Сарыаркинский район','пр. Сарыарка, 15',               '+7 7172 20 00 07', 51.1775, 71.4120, '09:00–20:00',   0, 1, 0, 0, 'Хирургия и дерматология.'),
    (8,  'Тауелсиздик',  'Алматинский район',  'пр. Тауелсиздик, 21',            '+7 7172 20 00 08', 51.1500, 71.4680, 'Круглосуточно', 1, 0, 1, 1, 'Круглосуточный приём и стационар на правом берегу.'),
    (9,  'Кенесары',     'Байконурский район', 'ул. Кенесары, 70',               '+7 7172 20 00 09', 51.1730, 71.4560, '09:00–21:00',   0, 0, 1, 0, 'Стоматология и терапия.'),
    (10, 'Шакарим',      'Алматинский район',  'пр. Шакарима Кудайбердиулы, 25', '+7 7172 20 00 10', 51.1690, 71.4880, '09:00–20:00',   0, 1, 0, 0, 'Новый филиал на северо-востоке города.');

  ALTER TABLE doctors ADD COLUMN branch_id INTEGER REFERENCES branches(id);
  ALTER TABLE doctors ADD COLUMN gender TEXT NOT NULL DEFAULT 'm' CHECK (gender IN ('m','f'));
  ALTER TABLE doctors ADD COLUMN experience_years INTEGER;
  UPDATE doctors SET branch_id = 1;

  ALTER TABLE appointments ADD COLUMN branch_id INTEGER REFERENCES branches(id);
  UPDATE appointments SET branch_id = (SELECT branch_id FROM doctors d WHERE d.user_id = vet_id);
  CREATE INDEX appt_branch ON appointments(branch_id, starts_at);

  ALTER TABLE services ADD COLUMN icon TEXT NOT NULL DEFAULT 'stethoscope';
  ALTER TABLE services ADD COLUMN category TEXT NOT NULL DEFAULT 'Терапия';
  UPDATE services SET icon = 'syringe',    category = 'Профилактика' WHERE name LIKE '%акцин%';
  UPDATE services SET icon = 'chip',       category = 'Профилактика' WHERE name LIKE '%ипирован%';
  UPDATE services SET icon = 'ultrasound', category = 'Диагностика'  WHERE name LIKE '%УЗИ%';
  UPDATE services SET icon = 'scalpel',    category = 'Хирургия'     WHERE name LIKE '%терилизац%' OR name LIKE '%астрац%';
  UPDATE services SET icon = 'skin',       category = 'Специалисты'  WHERE name LIKE '%ермато%';

  CREATE TABLE staff_photos (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    data       BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  `,
  // v4 — ЛЗ 12 (ИИ-подсказка специалиста) и ЛЗ 13 (ИИ-ассистент менеджера проекта)
  `
  -- ЛЗ 12: каждая подсказка. Текст жалобы НЕ хранится — только длина (минимизация персональных данных).
  CREATE TABLE ai_suggestions (
    id             INTEGER PRIMARY KEY,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source         TEXT NOT NULL CHECK (source IN ('ai','rules')),
    model          TEXT,
    prompt_version TEXT,
    label          TEXT,                       -- NULL = отказ («не уверен»)
    latency_ms     INTEGER,
    text_length    INTEGER NOT NULL,
    accepted       INTEGER,                    -- 1 — записались к подсказанной специальности, 0 — выбрали другое
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL
  );
  CREATE INDEX ai_sugg_date ON ai_suggestions(created_at);

  -- ЛЗ 13: черновики статус-отчётов, журнал проверки и замеры времени
  CREATE TABLE pm_reports (
    id             INTEGER PRIMARY KEY,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    repo           TEXT NOT NULL,
    period_from    TEXT NOT NULL,
    period_to      TEXT NOT NULL,
    facts_json     TEXT NOT NULL,
    facts_source   TEXT NOT NULL,              -- github / git / нет данных
    prompt_version TEXT NOT NULL,
    source         TEXT NOT NULL CHECK (source IN ('ai','template')),
    model          TEXT,
    draft          TEXT NOT NULL,
    raw_output     TEXT,
    gen_seconds    REAL,
    auto_flags     TEXT NOT NULL DEFAULT '[]', -- числа из черновика, которых нет в фактах
    final_text     TEXT,
    verified_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at    TEXT
  );
  CREATE TABLE pm_checks (
    id         INTEGER PRIMARY KEY,
    report_id  INTEGER NOT NULL REFERENCES pm_reports(id) ON DELETE CASCADE,
    claim      TEXT NOT NULL,                  -- что написала модель
    actual     TEXT NOT NULL DEFAULT '',       -- как на самом деле
    verdict    TEXT NOT NULL CHECK (verdict IN ('ok','semantic','style')),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE pm_time_log (
    id         INTEGER PRIMARY KEY,
    report_id  INTEGER REFERENCES pm_reports(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('manual','generation','verification','editing','development')),
    minutes    REAL NOT NULL CHECK (minutes > 0),
    note       TEXT NOT NULL DEFAULT '',
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
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

