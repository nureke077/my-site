// Демонстрационные данные: 10 филиалов (создаются миграцией), 20 врачей, 12 услуг,
// ~40 владельцев с питомцами и два месяца истории приёмов. Заполняется только пустая база.
import { hashPassword } from './auth.js';
import { localDate, localDateTime, addDays, weekday, toMin, fromMin } from './util.js';

// Детерминированный генератор — данные одинаковы при каждом сбросе базы
function prng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];

// [почта, имя, пол, специализация, филиал, стаж, о враче, дни, с, до]
const DOCTORS = [
  ['vet@khvost.local', 'Дмитрий Ковалёв', 'm', 'Терапевт', 1, 9, 'Первичный приём, вакцинация, профилактика. Спокойно находит подход к пугливым кошкам.', ALL, '09:00', '18:00'],
  ['surgeon@khvost.local', 'Мария Ахметова', 'f', 'Хирург', 1, 12, 'Плановые операции, стерилизация, травмы. Более 3000 операций.', WEEKDAYS, '09:00', '15:00'],
  ['derm@khvost.local', 'Олег Ли', 'm', 'Дерматолог', 2, 7, 'Кожа, шерсть, аллергии. Подбирает лечебное питание.', ALL, '11:00', '18:00'],
  ['aigerim@khvost.local', 'Айгерим Сапарова', 'f', 'Терапевт', 2, 6, 'Терапия собак и кошек, ведение хронических пациентов.', MON_SAT, '09:00', '18:00'],
  ['erlan@khvost.local', 'Ерлан Тулегенов', 'm', 'Хирург', 3, 15, 'Ортопедия и травматология, остеосинтез.', [2, 3, 4, 5, 6], '10:00', '18:00'],
  ['zhanna@khvost.local', 'Жанна Ким', 'f', 'Диагност', 3, 8, 'УЗИ, рентген и лабораторная диагностика.', WEEKDAYS, '09:00', '17:00'],
  ['aliya@khvost.local', 'Алия Бекова', 'f', 'Терапевт', 4, 4, 'Котята и щенки: первые прививки, чипирование, паспорт.', WEEKDAYS, '09:00', '18:00'],
  ['ruslan@khvost.local', 'Руслан Абенов', 'm', 'Стоматолог', 4, 10, 'Чистка зубов, удаление, лечение дёсен.', [1, 3, 5], '10:00', '18:00'],
  ['dinara@khvost.local', 'Динара Муканова', 'f', 'Офтальмолог', 5, 11, 'Глазные болезни, катаракта, травмы глаз.', [2, 4, 6], '09:00', '15:00'],
  ['timur@khvost.local', 'Тимур Есенов', 'm', 'Терапевт', 5, 5, 'Терапия и профилактика, консультации по питанию.', ALL, '09:00', '18:00'],
  ['saule@khvost.local', 'Сауле Жумабекова', 'f', 'Экзотолог', 6, 9, 'Птицы, кролики, грызуны, хорьки и рептилии.', WEEKDAYS, '10:00', '18:00'],
  ['artem@khvost.local', 'Артём Волков', 'm', 'Терапевт', 6, 3, 'Первичный приём, вакцинация.', MON_SAT, '09:00', '18:00'],
  ['asel@khvost.local', 'Асель Нурпеисова', 'f', 'Дерматолог', 7, 6, 'Аллергии, грибковые болезни кожи, отиты.', WEEKDAYS, '09:00', '17:00'],
  ['bakhyt@khvost.local', 'Бахыт Омаров', 'm', 'Хирург', 7, 14, 'Абдоминальная хирургия, онкология.', WEEKDAYS, '09:00', '16:00'],
  ['olga@khvost.local', 'Ольга Смирнова', 'f', 'Терапевт', 8, 20, 'Неотложная помощь и стационар.', ALL, '08:00', '20:00'],
  ['nurlan@khvost.local', 'Нурлан Касенов', 'm', 'Диагност', 8, 7, 'УЗИ сердца и брюшной полости, рентген.', MON_SAT, '09:00', '18:00'],
  ['madina@khvost.local', 'Мадина Абдрахманова', 'f', 'Терапевт', 9, 5, 'Терапия, гериатрия — забота о пожилых питомцах.', WEEKDAYS, '09:00', '18:00'],
  ['ilyas@khvost.local', 'Ильяс Жаксылыков', 'm', 'Стоматолог', 9, 8, 'Стоматология собак и кошек.', [2, 3, 4, 5, 6], '10:00', '18:00'],
  ['kamila@khvost.local', 'Камила Ержанова', 'f', 'Терапевт', 10, 2, 'Первичный приём и вакцинация.', MON_SAT, '09:00', '18:00'],
  ['viktor@khvost.local', 'Виктор Пак', 'm', 'Хирург', 10, 18, 'Плановая и экстренная хирургия.', [1, 2, 3, 4], '09:00', '17:00'],
];

// [название, описание, цена, минут, вакцинация, иконка, категория]
const SERVICES = [
  ['Первичный осмотр', 'Осмотр, сбор анамнеза, план лечения', 6000, 30, 0, 'stethoscope', 'Терапия'],
  ['Вакцинация', 'Комплексная прививка с отметкой в паспорте', 8000, 30, 1, 'syringe', 'Профилактика'],
  ['Чипирование', 'Чип международного стандарта и регистрация', 7000, 30, 0, 'chip', 'Профилактика'],
  ['УЗИ брюшной полости', 'Диагностика с заключением врача', 12000, 30, 0, 'ultrasound', 'Диагностика'],
  ['Анализ крови', 'Общий и биохимический анализ, результат за 2 часа', 9000, 30, 0, 'blood', 'Диагностика'],
  ['Рентген', 'Цифровой снимок в двух проекциях', 10000, 30, 0, 'xray', 'Диагностика'],
  ['Стерилизация кошки', 'Операция под наркозом, послеоперационный осмотр', 35000, 60, 0, 'scalpel', 'Хирургия'],
  ['Кастрация кота', 'Операция под наркозом, повторный осмотр', 20000, 60, 0, 'scalpel', 'Хирургия'],
  ['Консультация дерматолога', 'Осмотр кожи, соскоб, рекомендации', 7500, 30, 0, 'skin', 'Специалисты'],
  ['Чистка зубов', 'Ультразвуковая чистка и полировка', 18000, 60, 0, 'tooth', 'Стоматология'],
  ['Консультация офтальмолога', 'Осмотр глаз, тонометрия, лечение', 7500, 30, 0, 'eye', 'Специалисты'],
  ['Приём экзотических животных', 'Птицы, грызуны, кролики, рептилии', 8000, 30, 0, 'feather', 'Специалисты'],
];

// Какие услуги чаще оказывает каждая специализация (индексы в SERVICES)
const BY_SPECIALTY = {
  Терапевт: [0, 0, 1, 1, 2, 4], Хирург: [6, 7, 5, 0], Дерматолог: [8, 8, 4], Диагност: [3, 5, 4],
  Стоматолог: [9, 9, 0], Офтальмолог: [10, 10, 0], Экзотолог: [11, 11, 1],
};

const DIAGNOSES = {
  0: [['Здоров', 'Плановый осмотр', 'Повторный осмотр через год'], ['Гастрит', 'Диета, омепразол 5 дней', 'Кормить малыми порциями'],
    ['Отит', 'Капли в уши 7 дней', 'Контроль через неделю'], ['Цистит', 'Антибиотик 10 дней, обильное питьё', 'Повторный анализ мочи через 2 недели']],
  1: [['Здоров, вакцинирован', 'Комплексная вакцина', 'Следующая прививка через год']],
  2: [['Здоров, чипирован', 'Установлен чип, данные внесены в базу', '—']],
  3: [['Без патологий', 'УЗИ брюшной полости', '—'], ['Камни в мочевом пузыре', 'Лечебный корм', 'Контроль УЗИ через месяц']],
  4: [['Показатели в норме', 'Анализ крови', '—'], ['Повышены печёночные ферменты', 'Гепатопротектор 30 дней', 'Повторный анализ через месяц']],
  5: [['Без переломов', 'Рентген', 'Покой 7 дней'], ['Дисплазия тазобедренных суставов', 'Хондропротекторы', 'Контроль веса']],
  6: [['Послеоперационный период без осложнений', 'Снятие швов на 10-й день', 'Попона, ограничить активность']],
  7: [['Послеоперационный период без осложнений', 'Обработка шва 5 дней', 'Ограничить активность']],
  8: [['Аллергический дерматит', 'Антигистаминные, лечебный шампунь', 'Исключить курицу из рациона'], ['Дерматофитоз', 'Противогрибковая терапия', 'Обработать лежанку']],
  9: [['Зубной камень', 'Ультразвуковая чистка', 'Чистить зубы 2 раза в неделю']],
  10: [['Конъюнктивит', 'Глазные капли 7 дней', 'Контроль через неделю']],
  11: [['Здоров', 'Осмотр, коррекция рациона', 'Больше сена и свежей зелени']],
};

const MALE = ['Ержан', 'Арман', 'Данияр', 'Нурсултан', 'Алексей', 'Максим', 'Азамат', 'Санжар', 'Игорь', 'Бауыржан', 'Марат', 'Сергей', 'Ансар', 'Тимур', 'Олжас'];
const FEMALE = ['Светлана', 'Ольга', 'Аружан', 'Гульнара', 'Екатерина', 'Айдана', 'Наталья', 'Дана', 'Мария', 'Жанар', 'Ирина', 'Томирис', 'Алина', 'Асем', 'Юлия'];
const SURNAMES = [['Касымов', 'Касымова'], ['Ким', 'Ким'], ['Жумабаев', 'Жумабаева'], ['Иванов', 'Иванова'], ['Сериков', 'Серикова'],
  ['Петров', 'Петрова'], ['Ахметов', 'Ахметова'], ['Нургалиев', 'Нургалиева'], ['Попов', 'Попова'], ['Байжанов', 'Байжанова'],
  ['Тен', 'Тен'], ['Мусин', 'Мусина'], ['Орлов', 'Орлова'], ['Есимов', 'Есимова'], ['Хван', 'Хван']];

// [вид, вес вида, породы, клички]
const SPECIES = [
  ['Собака', 40, ['Лабрадор', 'Корги', 'Немецкая овчарка', 'Шпиц', 'Хаски', 'Йоркширский терьер', 'Метис', 'Казахская тобет', 'Джек-рассел'],
    ['Тайсон', 'Лаки', 'Граф', 'Бублик', 'Ричи', 'Арчи', 'Джесси', 'Зефир', 'Бой', 'Лайма', 'Чарли', 'Тоби']],
  ['Кошка', 40, ['Британская', 'Мейн-кун', 'Сиамская', 'Шотландская вислоухая', 'Сфинкс', 'Беспородная', 'Бенгальская'],
    ['Мия', 'Соня', 'Мурка', 'Персик', 'Симба', 'Луна', 'Феликс', 'Тиша', 'Кузя', 'Маркиза', 'Боня', 'Ася']],
  ['Кролик', 7, ['Карликовый', 'Вислоухий'], ['Пушок', 'Снежок', 'Ушастик']],
  ['Птица', 6, ['Волнистый попугай', 'Корелла', 'Жако'], ['Кеша', 'Гоша', 'Рио']],
  ['Грызун', 5, ['Сирийский хомяк', 'Морская свинка', 'Шиншилла'], ['Хома', 'Пончик', 'Бусинка']],
  ['Хорёк', 2, ['Домашний хорёк'], ['Фунтик', 'Шустрик']],
];

const COMMENTS = ['Очень внимательный врач!', 'Всё объяснили, спасибо', 'Быстро и без очереди', 'Хорошо, но пришлось подождать',
  'Лучшая клиника в городе', 'Котик даже не испугался', 'Спасибо за терпение к нашему трусишке', 'Чисто, уютно, вежливый персонал',
  'Записались онлайн за минуту — удобно', 'Доктор перезвонил на следующий день узнать, как дела', ''];

export function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  const rnd = prng(42);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const weighted = (items) => {
    const total = items.reduce((s, i) => s + i[1], 0);
    let r = rnd() * total;
    for (const i of items) { r -= i[1]; if (r <= 0) return i; }
    return items[0];
  };

  const addUser = db.prepare('INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)');
  const user = (email, hash, name, phone, role) => Number(addUser.run(email, hash, name, phone, role).lastInsertRowid);
  const vetHash = hashPassword('Vet12345');
  const NO_LOGIN = '!'; // такие владельцы войти не могут, пока не зарегистрируются

  db.exec('BEGIN');
  try {
    user('admin@khvost.local', hashPassword('Admin12345'), 'Ирина Смирнова', '+7 700 000 00 01', 'admin');
    user('reception@khvost.local', hashPassword('Reception12345'), 'Алия Нурланова', '+7 700 000 00 02', 'reception');

    const addDoc = db.prepare('INSERT INTO doctors (user_id, specialty, bio, branch_id, gender, experience_years) VALUES (?, ?, ?, ?, ?, ?)');
    const addHours = db.prepare('INSERT INTO vet_schedule (vet_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
    const vets = [];
    const addDoctor = ([email, name, gender, spec, branch, exp, bio, days, from, to], i) => {
      const id = user(email, vetHash, name, `+7 700 000 01 ${String(i + 1).padStart(2, '0')}`, 'vet');
      addDoc.run(id, spec, bio, branch, gender, exp);
      for (const d of days) addHours.run(id, d, from, to);
      vets.push({ id, spec, branch, days: new Set(days), from: toMin(from), to: toMin(to) });
      return id;
    };
    // Первые три врача и демо-владелец получают id 3–6 — как в прошлых версиях
    DOCTORS.slice(0, 3).forEach(addDoctor);
    const c = user('client@khvost.local', hashPassword('Client12345'), 'Анна Петрова', '+7 700 123 45 67', 'client');
    DOCTORS.slice(3).forEach((d, i) => addDoctor(d, i + 3));

    const addSvc = db.prepare('INSERT INTO services (name, description, price, duration_min, is_vaccination, icon, category) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const svc = SERVICES.map((r, i) => ({ i, id: Number(addSvc.run(...r).lastInsertRowid), price: r[2], duration: r[3] }));

    const addPet = db.prepare('INSERT INTO pets (owner_id, name, species, breed, birth_date, notes) VALUES (?, ?, ?, ?, ?, ?)');
    const pet = (...a) => Number(addPet.run(...a).lastInsertRowid);
    const barsik = pet(c, 'Барсик', 'Кошка', 'Британская', '2021-03-14', '');
    const rex = pet(c, 'Рекс', 'Собака', 'Лабрадор', '2019-07-02', 'Аллергия на курицу');

    // Владельцы и питомцы
    const pets = [];
    const usedPhones = new Set();
    for (let i = 0; i < 40; i++) {
      const female = rnd() < 0.55;
      const [m, f] = pick(SURNAMES);
      const name = `${pick(female ? FEMALE : MALE)} ${female ? f : m}`;
      let phone;
      do phone = `+7 7${pick(['01', '02', '05', '07', '47', '75', '77'])} ${between(100, 999)} ${between(10, 99)} ${between(10, 99)}`; while (usedPhones.has(phone));
      usedPhones.add(phone);
      const owner = user(`owner${i + 1}@example.kz`, NO_LOGIN, name, phone, 'client');
      const count = rnd() < 0.3 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const [species, , breeds, names] = weighted(SPECIES);
        const born = `${between(2012, 2025)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`;
        const notes = rnd() < 0.12 ? pick(['Аллергия на курицу', 'Боится шума, может укусить', 'Хроническая болезнь почек', 'Сахарный диабет']) : '';
        pets.push({ id: pet(owner, pick(names), species, pick(breeds), born, notes), species });
      }
    }
    const exoticPets = pets.filter((p) => !['Собака', 'Кошка'].includes(p.species));
    const regularPets = pets.filter((p) => ['Собака', 'Кошка'].includes(p.species));

    const addAppt = db.prepare(`INSERT INTO appointments
      (pet_id, vet_id, branch_id, service_id, starts_at, status, complaint, duration_min, price, paid_at, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const appt = (petId, vet, s, at, status, complaint = '', paid = null) => Number(addAppt.run(
      petId, vet.id, vet.branch, s.id, at, status, complaint, s.duration, s.price,
      paid ? `${at.replace('T', ' ')}:00` : null, paid).lastInsertRowid);
    const addRecord = db.prepare('INSERT INTO records (appointment_id, diagnosis, treatment, recommendations, weight_kg) VALUES (?, ?, ?, ?, ?)');
    const addReview = db.prepare('INSERT INTO reviews (appointment_id, rating, comment, created_at) VALUES (?, ?, ?, ?)');
    const addLine = db.prepare('INSERT INTO invoice_lines (appointment_id, item_id, name, price, qty) SELECT ?, id, name, price, ? FROM items WHERE id = ?');
    const busy = db.prepare("SELECT starts_at, duration_min FROM appointments WHERE vet_id = ? AND starts_at LIKE ? AND status <> 'cancelled'");
    const isFree = (vet, date, t, dur) => busy.all(vet.id, `${date}T%`)
      .every((a) => { const s = toMin(a.starts_at.slice(11, 16)); return t + dur <= s || t >= s + a.duration_min; });
    const freeTime = (vet, date, dur, notBefore = 0) => {
      for (let tries = 0; tries < 8; tries++) {
        const slots = (vet.to - vet.from - dur) / 30 + 1;
        const t = vet.from + Math.floor(rnd() * slots) * 30;
        if (t >= notBefore && isFree(vet, date, t, dur)) return fromMin(t);
      }
      return null;
    };
    const petFor = (vet) => (vet.spec === 'Экзотолог' ? pick(exoticPets) : pick(regularPets));
    const weightFor = (species) => ({ Собака: 5 + rnd() * 35, Кошка: 2.5 + rnd() * 5, Кролик: 1 + rnd() * 2, Птица: 0.05 + rnd() * 0.4, Грызун: 0.1 + rnd() * 0.8, Хорёк: 0.8 + rnd() })[species] ?? 3;

    const today = localDate();
    const v1 = vets[0]; const v2 = vets[1]; const v3 = vets[2];

    // История Рекса: прививка 2 недели назад. У Барсика прививок нет — кабинет напомнит.
    const rexVacc = appt(rex, v1, svc[1], `${addDays(today, -14)}T10:00`, 'done', 'Плановая прививка', 'card');
    addRecord.run(rexVacc, 'Здоров', 'Вакцина Нобивак DHPPi+L', 'Следующая прививка через год', 31.5);
    addReview.run(rexVacc, 5, 'Рекс даже не испугался. Спасибо доктору!', `${addDays(today, -14)} 12:00:00`);

    // Прошедшие 60 дней
    for (let d = -60; d <= -1; d++) {
      const date = addDays(today, d);
      for (const vet of vets) {
        if (!vet.days.has(weekday(date))) continue;
        const n = between(1, 5);
        for (let k = 0; k < n; k++) {
          const s = svc[pick(BY_SPECIALTY[vet.spec])];
          const time = freeTime(vet, date, s.duration);
          if (!time) continue;
          const p = petFor(vet);
          const cancelled = rnd() < 0.07;
          const id = appt(p.id, vet, s, `${date}T${time}`, cancelled ? 'cancelled' : 'done', '', cancelled ? null : (rnd() < 0.65 ? 'card' : 'cash'));
          if (cancelled) continue;
          addRecord.run(id, ...pick(DIAGNOSES[s.i]), Math.round(weightFor(p.species) * 10) / 10);
          if (rnd() < 0.3) addLine.run(id, between(1, 3), between(1, 6));
          if (rnd() < 0.35) addReview.run(id, rnd() < 0.78 ? 5 : rnd() < 0.8 ? 4 : 3, pick(COMMENTS), `${date} ${fromMin(between(18, 22) * 60)}:00`);
        }
      }
    }

    // Ближайшие записи демо-владельца — в рабочие дни врачей
    const nextWorkday = (vet, from) => {
      for (let i = 0; i < 14; i++) { const d = addDays(from, i); if (vet.days.has(weekday(d))) return d; }
      return from;
    };
    appt(barsik, v1, svc[0], `${nextWorkday(v1, today)}T11:00`, 'booked', 'Плохо ест второй день');
    appt(rex, v3, svc[8], `${nextWorkday(v3, today)}T15:30`, 'booked', 'Чешется, выпадает шерсть');
    appt(barsik, v2, svc[6], `${nextWorkday(v2, addDays(today, 3))}T10:00`, 'booked', '');

    // Неделя вперёд: записи других владельцев
    const nowMin = toMin(localDateTime().slice(11, 16));
    const complaints = ['', '', 'Плохо ест', 'Хромает на лапу', 'Чешется', 'Плановый осмотр', 'Рвота со вчерашнего дня', 'Слезятся глаза'];
    for (let d = 0; d <= 7; d++) {
      const date = addDays(today, d);
      for (const vet of vets) {
        if (!vet.days.has(weekday(date))) continue;
        const n = between(d === 0 ? 2 : 0, d < 3 ? 4 : 2);
        for (let k = 0; k < n; k++) {
          const s = svc[pick(BY_SPECIALTY[vet.spec])];
          const time = freeTime(vet, date, s.duration, d === 0 ? Math.min(nowMin, vet.to - 60) : 0);
          if (time) appt(petFor(vet).id, vet, s, `${date}T${time}`, 'booked', pick(complaints));
        }
      }
    }

    db.prepare("INSERT INTO audit_log (action, details) VALUES ('Начальные данные', ?)")
      .run(`10 филиалов, ${vets.length} врачей, ${pets.length + 2} питомцев`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
