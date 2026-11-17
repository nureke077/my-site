// Небольшие помощники: экранирование, даты, деньги.

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// Дата в местном часовом поясе в формате YYYY-MM-DD.
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function localDateTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${localDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

export function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00`).getTime());
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function humanDate(ymd) {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return `${d} ${MONTHS[m - 1]}, ${WEEKDAYS[wd]}`;
}

export function money(n) {
  return `${Number(n).toLocaleString('ru-RU').replace(/\s/g, ' ')} ₸`;
}

// Шаг сетки записи — 30 минут.
export const SLOT_STEP = 30;

export const STATUS = {
  booked: 'Записан',
  arrived: 'В клинике',
  done: 'Приём завершён',
  cancelled: 'Отменён',
};

export const ROLE = {
  admin: 'Администратор',
  reception: 'Регистратура',
  vet: 'Врач',
  client: 'Владелец',
};

export const SPECIES = ['Кошка', 'Собака', 'Кролик', 'Хорёк', 'Птица', 'Грызун', 'Другое'];

// 0 = воскресенье … 6 = суббота
export function weekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s ?? '');

// Порядок дней недели для отображения: с понедельника
export const WEEK = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];

export const PAYMENT = { cash: 'Наличные', card: 'Карта' };
export const ITEM_KIND = { drug: 'Препарат', material: 'Материал' };

// Только цифры телефона: «+7 (700) 123-45-67» → «77001234567»
export const digits = (s) => String(s ?? '').replace(/\D/g, '');

export function stars(rating) {
  const r = Math.round(rating);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// «+7 777 000 11 22» и «8 777 000 11 22» — один и тот же номер: сравниваем последние 10 цифр
export const samePhone = (a, b) => digits(a).length >= 10 && digits(a).slice(-10) === digits(b).slice(-10);

// plural(3, 'запись', 'записи', 'записей') → 'записи'
export function plural(n, one, few, many) {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
