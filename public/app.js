// Мобильное меню, подтверждения, автоотправка, выбор свободного времени.
document.querySelector('[data-menu]')?.addEventListener('click', (e) => {
  const nav = document.querySelector('[data-nav]');
  const open = nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!confirm(form.dataset.confirm)) e.preventDefault();
  });
});

// Фото отправляется сразу после выбора файла
document.querySelectorAll('form[data-autosubmit] input[type=file]').forEach((input) => {
  input.addEventListener('change', () => input.files.length && input.form.submit());
});
// Фильтры очереди: дата и врач
document.querySelectorAll('[data-autosubmit-field]').forEach((el) => {
  el.addEventListener('change', () => el.form.submit());
});

// Запись по телефону: поля нового питомца — только если выбран «Новый питомец»
const petSelect = document.querySelector('[data-pet-select]');
if (petSelect) {
  const box = document.querySelector('[data-new-pet]');
  const sync = () => {
    const isNew = petSelect.value === 'new';
    box.hidden = !isNew;
    box.querySelector('[name=pet_name]').required = isNew;
  };
  petSelect.addEventListener('change', sync);
  sync();
}

// Новый сотрудник: специализация, филиал и пол — только для врача
const roleSelect = document.querySelector('[data-role]');
if (roleSelect) {
  const fields = document.querySelectorAll('[data-vet-only]');
  const sync = () => {
    const vet = roleSelect.value === 'vet';
    fields.forEach((f) => {
      f.hidden = !vet;
      const input = f.querySelector('input');
      if (input) input.required = vet;
    });
  };
  roleSelect.addEventListener('change', sync);
  sync();
}

// Запись: список врачей — только из выбранного филиала
const branchSel = document.querySelector('[data-branch]');
const vetSel = document.querySelector('select[data-vet]');
if (branchSel && vetSel) {
  const filterVets = () => {
    const branch = branchSel.value;
    let firstVisible = null;
    for (const opt of vetSel.options) {
      const hide = Boolean(branch) && opt.dataset.branch !== branch;
      opt.hidden = hide;
      opt.disabled = hide;
      if (!hide && !firstVisible) firstVisible = opt;
    }
    if (vetSel.selectedOptions[0]?.disabled && firstVisible) {
      vetSel.value = firstVisible.value;
      vetSel.dispatchEvent(new Event('change'));
    }
  };
  branchSel.addEventListener('change', filterVets);
  filterVets();
}

// Свободное время с учётом графика врача и длительности услуги
const book = document.querySelector('[data-book]');
if (book) {
  const box = book.querySelector('[data-slots]');
  const vet = book.querySelector('[data-vet]');
  const service = book.querySelector('[data-service]');
  const date = book.querySelector('[data-date]');
  let selected = box.dataset.selected;
  let request = 0;

  async function loadSlots() {
    const my = ++request;
    box.innerHTML = '<p class="slots-msg">Загружаем свободное время…</p>';
    const params = new URLSearchParams({ vet: vet.value, date: date.value, service: service?.value ?? '' });
    if (box.dataset.exclude) params.set('exclude', box.dataset.exclude);
    try {
      const r = await fetch(`/api/slots?${params}`);
      if (!r.ok) throw new Error();
      const { slots, off } = await r.json();
      if (my !== request) return;
      if (off) {
        box.innerHTML = `<p class="slots-msg">У врача в этот день ${off === 'выходной' ? 'выходной' : `нет приёма: ${off}`}. Выберите другой день или врача.</p>`;
        return;
      }
      if (!slots.some((s) => s.free)) {
        box.innerHTML = '<p class="slots-msg">На этот день свободного времени нет — выберите другой день или врача.</p>';
        return;
      }
      box.innerHTML = slots.map((s) => `
        <label class="slot"><input type="radio" name="time" value="${s.time}" required
          ${s.free ? '' : 'disabled'} ${s.free && s.time === selected ? 'checked' : ''}><span>${s.time}</span></label>`).join('');
    } catch {
      box.innerHTML = '<p class="slots-msg">Не удалось загрузить расписание. Обновите страницу.</p>';
    }
  }
  box.addEventListener('change', (e) => { selected = e.target.value; });
  [vet, service, date].forEach((el) => el?.addEventListener('change', loadSlots));
  if (date.value) loadSlots();
}

// ЛЗ 12: подсказка специалиста по тексту жалобы
const complaint = document.querySelector('[data-complaint]');
const hint = document.querySelector('[data-ai-hint]');
if (complaint && hint) {
  const form = complaint.form;
  const idField = form.querySelector('[data-ai-id]');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let timer = null;
  let lastText = '';
  let current = null;

  const disclosure = (r) => (r.source === 'ai'
    ? `Подсказку сформировала языковая модель ${esc(r.model)} на сервере клиники. Она может ошибаться — выбор врача за вами. Текст жалобы не сохраняется.`
    : 'Подсказка по ключевым словам (языковая модель сейчас недоступна). Выбор врача за вами.');

  function render(r) {
    current = r;
    idField.value = r?.id ?? '';
    if (!r || !r.label) { hint.hidden = true; hint.innerHTML = ''; return; }
    const badge = r.source === 'ai' ? '<span class="ai-badge">ИИ</span>' : '<span class="ai-badge ai-badge-rules">Подсказка</span>';
    if (r.emergency) {
      hint.className = 'ai-hint ai-hint-urgent span-2';
      hint.innerHTML = `${badge}<div><b>Похоже на неотложный случай.</b> Не ждите записи: позвоните <a href="tel:+77172200001">+7 7172 20 00 01</a>
        или приезжайте в круглосуточный филиал — ${r.branches24.map((b) => `${esc(b.name)} (${esc(b.address)})`).join(', ')}.
        <div class="ai-actions"><button type="button" class="btn btn-sm btn-accent" data-ai-apply>Выбрать круглосуточный филиал</button></div>
        <small>${disclosure(r)}</small></div>`;
    } else {
      hint.className = 'ai-hint span-2';
      hint.innerHTML = `${badge}<div>Похоже, вам нужен <b>${esc(r.text)}</b>.
        <div class="ai-actions"><button type="button" class="btn btn-sm btn-soft" data-ai-apply>Показать: ${esc(r.specialty)}</button></div>
        <small>${disclosure(r)}</small></div>`;
    }
    hint.hidden = false;
  }

  async function ask() {
    const text = complaint.value.trim();
    if (text === lastText) return;
    lastText = text;
    if (text.length < 3) return render(null);
    try {
      const body = new URLSearchParams({ _csrf: form.querySelector('[name=_csrf]').value, text });
      const r = await fetch('/api/triage', { method: 'POST', body });
      if (r.ok && complaint.value.trim() === text) render(await r.json());
    } catch { render(null); }
  }

  complaint.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(ask, 700); });
  complaint.addEventListener('blur', ask);

  hint.addEventListener('click', (e) => {
    if (!e.target.closest('[data-ai-apply]') || !current) return;
    const branch = form.querySelector('[data-branch]');
    const vet = form.querySelector('select[data-vet]');
    if (current.emergency) {
      if (branch && current.branches24[0]) {
        branch.value = String(current.branches24[0].id);
        branch.dispatchEvent(new Event('change'));
      }
      return;
    }
    const pick = (opts) => opts.find((o) => o.dataset.specialty === current.specialty);
    let opt = pick([...vet.options].filter((o) => !o.disabled));
    if (!opt && branch) { // в выбранном филиале нет такого врача — показываем все филиалы
      branch.value = '';
      branch.dispatchEvent(new Event('change'));
      opt = pick([...vet.options]);
    }
    if (opt) {
      vet.value = opt.value;
      vet.dispatchEvent(new Event('change'));
      vet.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}
