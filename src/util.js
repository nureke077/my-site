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
  return `${Number(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₸`;
}

// Рабочие слоты: 09:00–18:00 каждые 30 минут.
export const SLOTS = (() => {
  const out = [];
  for (let h = 9; h < 18; h++) for (const m of ['00', '30']) out.push(`${String(h).padStart(2, '0')}:${m}`);
  return out;
})();

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
