// Мобильное меню, подтверждения и выбор свободного времени при записи.
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

const book = document.querySelector('[data-book]');
if (book) {
  const box = book.querySelector('[data-slots]');
  const vet = book.querySelector('[data-vet]');
  const date = book.querySelector('[data-date]');
  let selected = box.dataset.selected;

  async function loadSlots() {
    box.innerHTML = '<p class="slots-msg">Загружаем свободное время…</p>';
    try {
      const r = await fetch(`/api/slots?vet=${encodeURIComponent(vet.value)}&date=${encodeURIComponent(date.value)}`);
      if (!r.ok) throw new Error();
      const { slots } = await r.json();
      const free = slots.filter((s) => s.free);
      if (!free.length) {
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
  vet.addEventListener('change', loadSlots);
  date.addEventListener('change', loadSlots);
  loadSlots();
}
