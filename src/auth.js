// Пароли (scrypt), сессии в базе и защита от подбора пароля.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_DAYS = 7;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [kind, saltHex, hashHex] = String(stored).split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function randomPassword() {
  return randomBytes(9).toString('base64url');
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(16).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, csrf, expires);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function getSession(db, token) {
  if (!token) return null;
  return db.prepare(`
    SELECT s.token, s.csrf, u.id, u.email, u.name, u.phone, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.blocked = 0`).get(token, Date.now()) ?? null;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// После MAX_FAILS неверных паролей подряд вход по этой почте закрыт на LOCK_MIN минут.
export class LoginLimiter {
  constructor({ maxFails = 5, lockMinutes = 5 } = {}) {
    this.maxFails = maxFails;
    this.lockMs = lockMinutes * 60_000;
    this.state = new Map();
  }

  // Сколько секунд осталось до разблокировки (0 — можно входить).
  lockedFor(key) {
    const s = this.state.get(key);
    if (!s?.until) return 0;
    const left = s.until - Date.now();
    if (left <= 0) { this.state.delete(key); return 0; }
    return Math.ceil(left / 1000);
  }

  fail(key) {
    const s = this.state.get(key) ?? { fails: 0, until: 0 };
    s.fails += 1;
    if (s.fails >= this.maxFails) { s.until = Date.now() + this.lockMs; s.fails = 0; }
    this.state.set(key, s);
    return this.maxFails - s.fails;
  }

  reset(key) { this.state.delete(key); }
}
