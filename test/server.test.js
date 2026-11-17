import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { localDate, addDays } from '../src/util.js';

let server, base, db;

before(async () => {
  db = openDb(':memory:');
  server = http.createServer(createApp(db));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function login(email, password) {
  const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email, password }) });
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const page = await (await fetch(`${base}${r.headers.get('location')}`, { headers: { cookie } })).text();
  const csrf = page.match(/name="_csrf" value="([^"]+)"/)[1];
  return { cookie, csrf };
}

const post = (path, s, data) => fetch(`${base}${path}`, {
  method: 'POST', redirect: 'manual', headers: { cookie: s.cookie }, body: new URLSearchParams({ _csrf: s.csrf, ...data }),
});

test('главная показывает услуги и врачей из базы', async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /Первичный осмотр/);
  assert.match(html, /Дмитрий Ковалёв/);
});

test('неверный пароль не пускает', async () => {
  const r = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ email: 'admin@khvost.local', password: 'nope' }) });
  assert.equal(r.status, 401);
});

test('без входа кабинет перенаправляет на вход', async () => {
  const r = await fetch(`${base}/cabinet`, { redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/login');
});

test('регистрация, питомец и запись на свободное время', async () => {
  const r = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ name: 'Тест Тестов', phone: '+7 700 111 22 33', email: 'new@test.kz', password: 'password1' }),
  });
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const cab = await (await fetch(`${base}/cabinet`, { headers: { cookie } })).text();
  const s = { cookie, csrf: cab.match(/name="_csrf" value="([^"]+)"/)[1] };

  assert.equal((await post('/pets', s, { name: 'Мурка', species: 'Кошка' })).status, 303);
  const pet = db.prepare("SELECT id FROM pets WHERE name = 'Мурка'").get();
  const date = addDays(localDate(), 2);
  const booking = { pet_id: pet.id, service_id: 1, vet_id: 3, date, time: '12:00', complaint: 'Чихает' };

  const ok = await post('/book', s, booking);
  assert.equal(ok.headers.get('location'), '/cabinet?ok=booked');

  const slots = await (await fetch(`${base}/api/slots?vet=3&date=${date}`, { headers: { cookie } })).json();
  assert.equal(slots.slots.find((x) => x.time === '12:00').free, false);

  const twice = await post('/book', s, booking);
  assert.equal(twice.status, 409, 'одно время нельзя занять дважды');
});

test('запрос без CSRF-токена отклоняется', async () => {
  const s = await login('client@khvost.local', 'Client12345');
  const r = await post('/pets', { ...s, csrf: 'wrong' }, { name: 'Хакер' });
  assert.equal(r.status, 403);
});

test('владелец не видит очередь и сводку', async () => {
  const s = await login('client@khvost.local', 'Client12345');
  assert.equal((await fetch(`${base}/queue`, { headers: { cookie: s.cookie } })).status, 403);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie: s.cookie } })).status, 403);
});

test('регистратура отмечает приход, врач пишет протокол', async () => {
  const appt = db.prepare("SELECT id FROM appointments WHERE status = 'booked' AND vet_id = 3 AND starts_at LIKE ?").get(`${localDate()}T%`);
  const rec = await login('reception@khvost.local', 'Reception12345');
  assert.equal((await post(`/appointments/${appt.id}/status`, rec, { status: 'arrived' })).status, 303);

  const vet = await login('vet@khvost.local', 'Vet12345');
  const r = await post(`/appointments/${appt.id}/record`, vet, { diagnosis: 'Гастрит', treatment: 'Диета', weight_kg: '4.2' });
  assert.equal(r.status, 303);
  assert.equal(db.prepare('SELECT status FROM appointments WHERE id = ?').get(appt.id).status, 'done');
  assert.equal(db.prepare('SELECT diagnosis FROM records WHERE appointment_id = ?').get(appt.id).diagnosis, 'Гастрит');

  const cab = await login('client@khvost.local', 'Client12345');
  const html = await (await fetch(`${base}/cabinet`, { headers: { cookie: cab.cookie } })).text();
  assert.match(html, /Гастрит/);
});

test('администратор меняет цену услуги', async () => {
  const s = await login('admin@khvost.local', 'Admin12345');
  const r = await post('/admin/services/1', s, { name: 'Первичный осмотр', price: '6500', duration_min: '30', active: '1' });
  assert.equal(r.status, 303);
  assert.equal(db.prepare('SELECT price FROM services WHERE id = 1').get().price, 6500);
  const html = await (await fetch(`${base}/admin`, { headers: { cookie: s.cookie } })).text();
  assert.match(html, /Изменена услуга/);
});

test('HTML в данных экранируется', async () => {
  const s = await login('client@khvost.local', 'Client12345');
  await post('/pets', s, { name: '<script>alert(1)</script>', species: 'Кошка' });
  const html = await (await fetch(`${base}/cabinet`, { headers: { cookie: s.cookie } })).text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});
