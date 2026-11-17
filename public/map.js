// Карта филиалов на Leaflet + OpenStreetMap
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  document.querySelectorAll('[data-map]').forEach((el) => {
    const branches = JSON.parse(el.dataset.map);
    if (!window.L) {
      el.innerHTML = '<p class="map-fallback">Карта не загрузилась — проверьте подключение к интернету. Адреса филиалов перечислены рядом.</p>';
      return;
    }
    const map = L.map(el, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const markers = {};
    branches.forEach((b) => {
      const icon = L.divIcon({
        className: `map-pin${b.h24 ? ' map-pin-24' : ''}`,
        html: `<span>${b.id}</span>`,
        iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -42],
      });
      markers[b.id] = L.marker([b.lat, b.lng], { icon, title: b.name, alt: `Филиал ${b.name}` }).addTo(map).bindPopup(
        `<div class="map-popup"><b>${esc(b.name)}</b>${b.h24 ? ' <span class="chip chip-accent">24/7</span>' : ''}
         <p>${esc(b.address)}<br>${esc(b.hours)} · <a href="tel:${esc(b.phone.replace(/\s/g, ''))}">${esc(b.phone)}</a></p>
         <a class="btn btn-accent btn-sm" href="/book?branch_id=${b.id}">Записаться</a></div>`);
    });
    map.fitBounds(L.latLngBounds(branches.map((b) => [b.lat, b.lng])), { padding: [36, 36] });
    // Включаем колёсико мыши только после клика по карте — чтобы не мешать прокрутке страницы
    map.on('click', () => map.scrollWheelZoom.enable());

    document.querySelectorAll('[data-branch-link]').forEach((a) => {
      a.addEventListener('mouseenter', () => markers[a.dataset.branchLink]?.openPopup());
      a.addEventListener('focus', () => markers[a.dataset.branchLink]?.openPopup());
    });
  });
})();
