// Свободное время врача: рабочий график, отпуска, длительность услуги и уже занятые записи.
import { weekday, toMin, fromMin, localDateTime, SLOT_STEP } from './util.js';

// Рабочие часы врача в этот день или null (выходной / отпуск / сотрудник заблокирован).
export function workHours(db, vetId, date) {
  const off = db.prepare('SELECT reason FROM vet_time_off WHERE vet_id = ? AND ? BETWEEN date_from AND date_to')
    .get(vetId, date);
  if (off) return { off: off.reason || 'отпуск' };
  const h = db.prepare(`SELECT s.start_time, s.end_time FROM vet_schedule s JOIN users u ON u.id = s.vet_id
    WHERE s.vet_id = ? AND s.weekday = ? AND u.blocked = 0`).get(vetId, weekday(date));
  return h ? { start: toMin(h.start_time), end: toMin(h.end_time) } : null;
}

// Занятые интервалы [начало, конец) в минутах от полуночи.
function busy(db, vetId, date, excludeId) {
  return db.prepare(`SELECT id, starts_at, duration_min FROM appointments
    WHERE vet_id = ? AND starts_at LIKE ? AND status <> 'cancelled'`).all(vetId, `${date}T%`)
    .filter((a) => a.id !== excludeId)
    .map((a) => { const s = toMin(a.starts_at.slice(11, 16)); return [s, s + a.duration_min]; });
}

// Все слоты дня с отметкой, свободен ли каждый.
export function daySlots(db, vetId, date, duration, { excludeId = null, now = localDateTime() } = {}) {
  const h = workHours(db, vetId, date);
  if (!h || h.off) return { slots: [], off: h?.off ?? 'выходной' };
  const taken = busy(db, vetId, date, excludeId);
  const slots = [];
  for (let t = h.start; t + duration <= h.end; t += SLOT_STEP) {
    const time = fromMin(t);
    const overlaps = taken.some(([s, e]) => t < e && t + duration > s);
    slots.push({ time, free: !overlaps && `${date}T${time}` > now });
  }
  return { slots, off: null };
}

// Причина, по которой время нельзя занять, или null, если можно.
export function slotProblem(db, vetId, date, time, duration, opts = {}) {
  const { slots, off } = daySlots(db, vetId, date, duration, opts);
  if (off) return `У врача в этот день ${off === 'выходной' ? 'выходной' : `нет приёма (${off})`}.`;
  const slot = slots.find((s) => s.time === time);
  if (!slot) return 'Это время вне графика врача.';
  if (!slot.free) return 'Это время уже занято или прошло. Выберите другое.';
  return null;
}
