// База данных клиники: SQLite через встроенный модуль node:sqlite (Node.js 22.5+).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashPassword } from './auth.js';
import { localDate, addDays } from './util.js';

const SCHEMA = `
PRAGMA foreign_keys = ON;

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
  starts_at  TEXT NOT NULL,              -- 'YYYY-MM-DDTHH:MM', местное время
  status     TEXT NOT NULL DEFAULT 'booked'
             CHECK (status IN ('booked','arrived','done','cancelled')),
  complaint  TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- Один врач не может принять двух пациентов в одно время (отменённые не считаются).
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
`;

export function openDb(path = process.env.CLINIC_DB || 'data/clinic.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

export function log(db, userId, action, details = '') {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId ?? null, action, details);
}

// Демонстрационные данные — только в пустую базу.
function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;

  const addUser = db.prepare(
    'INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)');
  const user = (email, pass, name, phone, role) =>
    Number(addUser.run(email, hashPassword(pass), name, phone, role).lastInsertRowid);

  db.exec('BEGIN');
  try {
    user('admin@khvost.local', 'Admin12345', 'Ирина Смирнова', '+7 700 000 00 01', 'admin');
    user('reception@khvost.local', 'Reception12345', 'Алия Нурланова', '+7 700 000 00 02', 'reception');

    const addDoc = db.prepare('INSERT INTO doctors (user_id, specialty, bio) VALUES (?, ?, ?)');
    const v1 = user('vet@khvost.local', 'Vet12345', 'Дмитрий Ковалёв', '+7 700 000 00 03', 'vet');
    addDoc.run(v1, 'Терапевт', 'Первичный приём, вакцинация, профилактика. Стаж 9 лет.');
    const v2 = user('surgeon@khvost.local', 'Vet12345', 'Мария Ахметова', '+7 700 000 00 04', 'vet');
    addDoc.run(v2, 'Хирург', 'Плановые операции, стерилизация, травмы. Стаж 12 лет.');
    const v3 = user('derm@khvost.local', 'Vet12345', 'Олег Ли', '+7 700 000 00 05', 'vet');
    addDoc.run(v3, 'Дерматолог', 'Кожа, шерсть, аллергии. Работает с экзотическими животными.');

    const addSvc = db.prepare(
      'INSERT INTO services (name, description, price, duration_min) VALUES (?, ?, ?, ?)');
    const s = [
      ['Первичный осмотр', 'Осмотр, сбор анамнеза, план лечения', 6000, 30],
      ['Вакцинация', 'Комплексная прививка с отметкой в паспорте', 8000, 30],
      ['Чипирование', 'Чип международного стандарта и регистрация', 7000, 30],
      ['УЗИ брюшной полости', 'Диагностика с заключением врача', 12000, 30],
      ['Стерилизация кошки', 'Операция под наркозом, послеоперационный осмотр', 35000, 60],
      ['Консультация дерматолога', 'Осмотр кожи, соскоб, рекомендации', 7500, 30],
    ].map((r) => Number(addSvc.run(...r).lastInsertRowid));

    const c = user('client@khvost.local', 'Client12345', 'Анна Петрова', '+7 700 123 45 67', 'client');
    const addPet = db.prepare(
      'INSERT INTO pets (owner_id, name, species, breed, birth_date, notes) VALUES (?, ?, ?, ?, ?, ?)');
    const barsik = Number(addPet.run(c, 'Барсик', 'Кошка', 'Британская', '2021-03-14', '').lastInsertRowid);
    const rex = Number(addPet.run(c, 'Рекс', 'Собака', 'Лабрадор', '2019-07-02', 'Аллергия на курицу').lastInsertRowid);

    const today = localDate();
    const addAppt = db.prepare(
      'INSERT INTO appointments (pet_id, vet_id, service_id, starts_at, status, complaint) VALUES (?, ?, ?, ?, ?, ?)');
    const past = Number(addAppt.run(rex, v1, s[1], `${addDays(today, -14)}T10:00`, 'done', 'Плановая прививка').lastInsertRowid);
    db.prepare('INSERT INTO records (appointment_id, diagnosis, treatment, recommendations, weight_kg) VALUES (?, ?, ?, ?, ?)')
      .run(past, 'Здоров', 'Вакцина Нобивак DHPPi+L', 'Следующая прививка через год', 31.5);
    addAppt.run(barsik, v1, s[0], `${today}T11:00`, 'booked', 'Плохо ест второй день');
    addAppt.run(rex, v3, s[5], `${today}T15:30`, 'booked', 'Чешется, выпадает шерсть');
    addAppt.run(barsik, v2, s[4], `${addDays(today, 3)}T10:00`, 'booked', '');

    log(db, null, 'Начальные данные', 'Созданы демонстрационные записи');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
