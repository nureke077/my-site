// Собственные иллюстрации сайта (SVG): питомцы, портреты врачей, картинка на главной, иконки.
// Нарисованы для этого проекта — никаких чужих фото и лицензий.

const INK = '#2b2b33';
const W = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${body}</svg>`;

// ---------- питомцы (портрет «голова», 120×120) ----------
const PETS = {
  cat: (c = { fur: '#f4a65b', dark: '#d9853b', light: '#fff3e6' }) => `
    <path d="M24 56 L28 14 L56 38 Z" fill="${c.fur}"/><path d="M96 56 L92 14 L64 38 Z" fill="${c.fur}"/>
    <path d="M31 46 L33 24 L48 38 Z" fill="#f7b8c2"/><path d="M89 46 L87 24 L72 38 Z" fill="#f7b8c2"/>
    <ellipse cx="60" cy="68" rx="42" ry="37" fill="${c.fur}"/>
    <path d="M50 34 q4 8 0 14 M60 32 v14 M70 34 q-4 8 0 14" stroke="${c.dark}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <ellipse cx="60" cy="84" rx="20" ry="13" fill="${c.light}"/>
    <ellipse cx="43" cy="64" rx="6" ry="8" fill="${INK}"/><ellipse cx="77" cy="64" rx="6" ry="8" fill="${INK}"/>
    <circle cx="45" cy="61" r="2.2" fill="#fff"/><circle cx="79" cy="61" r="2.2" fill="#fff"/>
    <path d="M54 77 h12 l-6 6 z" fill="#e86a7a"/>
    <path d="M60 83 q-5 7 -11 3 M60 83 q5 7 11 3" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M30 78 h14 M30 86 l14 -3 M90 78 h-14 M90 86 l-14 -3" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <circle cx="35" cy="76" r="5" fill="#f58a9b" opacity=".35"/><circle cx="85" cy="76" r="5" fill="#f58a9b" opacity=".35"/>`,

  dog: (c = { fur: '#e3b47a', ear: '#a86d38', light: '#f8e3c0' }) => `
    <path d="M30 36 q-22 8 -16 50 q6 12 18 4 q6 -24 8 -46 z" fill="${c.ear}"/>
    <path d="M90 36 q22 8 16 50 q-6 12 -18 4 q-6 -24 -8 -46 z" fill="${c.ear}"/>
    <ellipse cx="60" cy="62" rx="34" ry="38" fill="${c.fur}"/>
    <ellipse cx="60" cy="84" rx="22" ry="17" fill="${c.light}"/>
    <circle cx="46" cy="56" r="5.5" fill="${INK}"/><circle cx="74" cy="56" r="5.5" fill="${INK}"/>
    <circle cx="48" cy="54" r="1.8" fill="#fff"/><circle cx="76" cy="54" r="1.8" fill="#fff"/>
    <path d="M40 46 q6 -4 12 0 M68 46 q6 -4 12 0" stroke="${c.ear}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="74" rx="9" ry="6.5" fill="${INK}"/><ellipse cx="57" cy="72" rx="3" ry="1.6" fill="#fff" opacity=".5"/>
    <path d="M60 80 v5 M60 85 q-7 6 -12 1 M60 85 q7 6 12 1" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M54 90 q6 14 12 0 z" fill="#f07a8a"/>`,

  rabbit: (c = { fur: '#d8d2cc', inner: '#f5b5c0' }) => `
    <ellipse cx="44" cy="30" rx="10" ry="28" fill="${c.fur}" transform="rotate(-10 44 30)"/>
    <ellipse cx="76" cy="30" rx="10" ry="28" fill="${c.fur}" transform="rotate(10 76 30)"/>
    <ellipse cx="44" cy="30" rx="5" ry="20" fill="${c.inner}" transform="rotate(-10 44 30)"/>
    <ellipse cx="76" cy="30" rx="5" ry="20" fill="${c.inner}" transform="rotate(10 76 30)"/>
    <ellipse cx="60" cy="74" rx="36" ry="34" fill="${c.fur}"/>
    <ellipse cx="60" cy="88" rx="18" ry="12" fill="#fff"/>
    <circle cx="46" cy="70" r="5" fill="${INK}"/><circle cx="74" cy="70" r="5" fill="${INK}"/>
    <circle cx="47.5" cy="68.5" r="1.6" fill="#fff"/><circle cx="75.5" cy="68.5" r="1.6" fill="#fff"/>
    <path d="M56 82 h8 l-4 4 z" fill="#e86a7a"/>
    <rect x="56.5" y="89" width="7" height="7" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="1.2"/>
    <path d="M60 86 v3" stroke="${INK}" stroke-width="1.6"/>
    <circle cx="38" cy="84" r="5" fill="#f58a9b" opacity=".35"/><circle cx="82" cy="84" r="5" fill="#f58a9b" opacity=".35"/>`,

  bird: () => `
    <path d="M60 14 q6 -8 10 2 q-4 2 -6 8 z" fill="#5fb653"/>
    <ellipse cx="60" cy="70" rx="38" ry="40" fill="#7bc86c"/>
    <ellipse cx="60" cy="54" rx="30" ry="26" fill="#ffe27a"/>
    <path d="M34 66 q26 18 52 0 q-6 30 -26 34 q-20 -4 -26 -34 z" fill="#7bc86c"/>
    <path d="M40 62 q4 4 8 0 M72 62 q4 4 8 0" stroke="${INK}" stroke-width="1.2" fill="none" opacity=".35"/>
    <circle cx="46" cy="50" r="5" fill="${INK}"/><circle cx="74" cy="50" r="5" fill="${INK}"/>
    <circle cx="47.5" cy="48.5" r="1.6" fill="#fff"/><circle cx="75.5" cy="48.5" r="1.6" fill="#fff"/>
    <path d="M52 58 q8 -6 16 0 q-2 12 -8 14 q-6 -2 -8 -14 z" fill="#f59e42"/>
    <circle cx="40" cy="62" r="4" fill="#5b8def" opacity=".8"/><circle cx="80" cy="62" r="4" fill="#5b8def" opacity=".8"/>`,

  rodent: (c = { fur: '#e8b07a', light: '#fff4e8' }) => `
    <circle cx="32" cy="36" r="13" fill="${c.fur}"/><circle cx="88" cy="36" r="13" fill="${c.fur}"/>
    <circle cx="32" cy="36" r="7" fill="#f5b5c0"/><circle cx="88" cy="36" r="7" fill="#f5b5c0"/>
    <ellipse cx="60" cy="68" rx="44" ry="40" fill="${c.fur}"/>
    <ellipse cx="34" cy="80" rx="16" ry="14" fill="${c.light}"/><ellipse cx="86" cy="80" rx="16" ry="14" fill="${c.light}"/>
    <ellipse cx="60" cy="84" rx="14" ry="12" fill="${c.light}"/>
    <circle cx="46" cy="62" r="5" fill="${INK}"/><circle cx="74" cy="62" r="5" fill="${INK}"/>
    <circle cx="47.5" cy="60.5" r="1.6" fill="#fff"/><circle cx="75.5" cy="60.5" r="1.6" fill="#fff"/>
    <ellipse cx="60" cy="74" rx="4" ry="3" fill="#e86a7a"/>
    <path d="M60 77 q-4 5 -8 2 M60 77 q4 5 8 2" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`,

  ferret: () => `
    <circle cx="34" cy="38" r="11" fill="#c9b08f"/><circle cx="86" cy="38" r="11" fill="#c9b08f"/>
    <circle cx="34" cy="38" r="6" fill="#f2c9b8"/><circle cx="86" cy="38" r="6" fill="#f2c9b8"/>
    <ellipse cx="60" cy="66" rx="34" ry="36" fill="#efe2cf"/>
    <path d="M28 58 q14 -10 26 4 q-10 10 -24 6 z M92 58 q-14 -10 -26 4 q10 10 24 6 z" fill="#7d5d44"/>
    <circle cx="44" cy="62" r="4.5" fill="${INK}"/><circle cx="76" cy="62" r="4.5" fill="${INK}"/>
    <circle cx="45.4" cy="60.6" r="1.5" fill="#fff"/><circle cx="77.4" cy="60.6" r="1.5" fill="#fff"/>
    <ellipse cx="60" cy="84" rx="16" ry="12" fill="#fff"/>
    <ellipse cx="60" cy="79" rx="5" ry="3.6" fill="#e88a95"/>
    <path d="M60 82 q-4 5 -9 2 M60 82 q4 5 9 2" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
};

export const SPECIES_ART = { Кошка: 'cat', Собака: 'dog', Кролик: 'rabbit', Птица: 'bird', Грызун: 'rodent', Хорёк: 'ferret' };
const PET_BG = { cat: '#ffe9d6', dog: '#fff1cc', rabbit: '#ece7f7', bird: '#e2f5dc', rodent: '#fde4e4', ferret: '#e6f0f7', paw: '#dff5f0' };

const PAW = `<g fill="#14a394"><ellipse cx="60" cy="74" rx="20" ry="17"/><circle cx="36" cy="50" r="9"/><circle cx="52" cy="38" r="9"/><circle cx="68" cy="38" r="9"/><circle cx="84" cy="50" r="9"/></g>`;

export function petSvg(key, { background = true } = {}) {
  const draw = PETS[key];
  const bg = background ? `<rect width="120" height="120" fill="${PET_BG[key] ?? PET_BG.paw}"/>` : '';
  return W(bg + (draw ? `<g transform="translate(0 4)">${draw()}</g>` : PAW));
}

// ---------- портрет врача: внешность зависит от id, чтобы все были разными ----------
const SKIN = ['#f6d3b3', '#eec19a', '#e0a97f', '#c98d63', '#f3cfae', '#d9a37a'];
const HAIR = ['#2b2321', '#4a3226', '#6b4a2f', '#1f1f24', '#8c5a34', '#3b2a22', '#a0a0a8'];
const SCRUBS = ['#14a394', '#4f8ef7', '#7a6ff0', '#f07a5a', '#2bb3c7', '#58b368'];
const BACK = ['#dff5f0', '#e5efff', '#efeaff', '#ffe9e1', '#e0f6fa', '#e8f6e3'];

export function doctorSvg(id, gender = 'm') {
  const n = Number(id) * 7 + 3;
  const skin = SKIN[n % SKIN.length];
  const hair = HAIR[(n >> 1) % HAIR.length];
  const scrubs = SCRUBS[n % SCRUBS.length];
  const bg = BACK[n % BACK.length];
  const longHair = gender === 'f' && n % 3 !== 0;
  const bun = gender === 'f' && !longHair;
  const glasses = n % 4 === 1;
  const beard = gender === 'm' && n % 5 === 2;

  const backHair = longHair ? `<path d="M33 58 q-3 -38 27 -38 q30 0 27 38 l3 34 q-10 6 -18 0 l-2 -30 h-20 l-2 30 q-8 6 -18 0 z" fill="${hair}"/>` : '';
  const bunHair = bun ? `<circle cx="60" cy="22" r="11" fill="${hair}"/>` : '';
  const front = gender === 'f'
    ? `<path d="M38 52 q2 -26 22 -26 q22 0 23 26 q-8 -14 -26 -13 q-10 1 -19 13 z" fill="${hair}"/>`
    : `<path d="M37 52 q-1 -28 23 -28 q25 0 23 28 q-3 -10 -10 -13 q-12 4 -27 0 q-7 4 -9 13 z" fill="${hair}"/>`;
  return W(`
    <rect width="120" height="120" fill="${bg}"/>
    ${backHair}${bunHair}
    <path d="M12 122 q2 -34 48 -38 q46 4 48 38 z" fill="#fff"/>
    <path d="M44 86 l16 22 l16 -22 q-16 -6 -32 0 z" fill="${scrubs}"/>
    <path d="M44 86 l-8 30 M76 86 l8 30" stroke="#e3ebea" stroke-width="2"/>
    <rect x="52" y="68" width="16" height="20" rx="7" fill="${skin}"/>
    <ellipse cx="39" cy="56" rx="4" ry="6" fill="${skin}"/><ellipse cx="81" cy="56" rx="4" ry="6" fill="${skin}"/>
    <ellipse cx="60" cy="54" rx="21" ry="25" fill="${skin}"/>
    ${beard ? `<path d="M40 58 q2 24 20 24 q18 0 20 -24 q-4 10 -20 10 q-16 0 -20 -10 z" fill="${hair}"/>` : ''}
    ${front}
    <path d="M47 50 q4 -3 8 0 M65 50 q4 -3 8 0" stroke="${hair}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="51" cy="57" r="2.6" fill="${INK}"/><circle cx="69" cy="57" r="2.6" fill="${INK}"/>
    ${glasses ? `<g fill="none" stroke="${INK}" stroke-width="1.8"><circle cx="51" cy="57" r="6.5"/><circle cx="69" cy="57" r="6.5"/><path d="M57.5 57 h5"/></g>` : ''}
    <path d="M53 68 q7 6 14 0" stroke="#9a5a4a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="46" cy="65" r="3.5" fill="#f58a9b" opacity=".25"/><circle cx="74" cy="65" r="3.5" fill="#f58a9b" opacity=".25"/>
    <path d="M40 90 q-4 18 10 24 M80 90 q4 18 -10 24" stroke="#3a4a55" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="60" cy="114" r="5" fill="#cfd8dc" stroke="#3a4a55" stroke-width="2"/>`);
}

// ---------- картинка для главной ----------
export function heroSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f6ef"/><stop offset="1" stop-color="#bfeee3"/></linearGradient></defs>
  <path d="M90 90 C170 10 400 20 470 110 C540 200 520 360 420 420 C320 480 150 460 90 380 C30 300 20 160 90 90 Z" fill="url(#g)"/>
  <circle cx="470" cy="92" r="40" fill="#ffd166"/>
  <g fill="#14a394" opacity=".18">
    <g transform="translate(60 330) scale(.45)">${PAW}</g><g transform="translate(470 330) scale(.35)">${PAW}</g><g transform="translate(110 60) scale(.3)">${PAW}</g>
  </g>
  <ellipse cx="200" cy="420" rx="120" ry="14" fill="#0b7d70" opacity=".08"/>
  <ellipse cx="400" cy="424" rx="90" ry="12" fill="#0b7d70" opacity=".08"/>
  <g transform="translate(40 60) scale(2.9)">${PETS.dog()}</g>
  <g transform="translate(290 168) scale(2.15)">${PETS.cat()}</g>
  <g transform="translate(330 70) rotate(12)">
    <path d="M30 52 s-26 -16 -28 -32 a14 14 0 0 1 28 -6 a14 14 0 0 1 28 6 c-2 16 -28 32 -28 32z" fill="#ff7a59"/>
  </g>
  <g transform="translate(470 230)">
    <rect width="64" height="64" rx="18" fill="#fff" stroke="#d5ebe6" stroke-width="2"/>
    <path d="M26 16 h12 v10 h10 v12 h-10 v10 h-12 v-10 h-10 v-12 h10 z" fill="#14a394"/>
  </g>
</svg>`;
}

// ---------- иконки (линейные, 24×24, цвет — currentColor) ----------
const ICONS = {
  stethoscope: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
  syringe: '<path d="M18 2l4 4M20 4l-9.5 9.5M14 6l4 4M3 21l3.5-3.5"/><path d="M10.5 9.5l-6 6 4 4 6-6"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  ultrasound: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M6 10h2l2-3 2 6 2-3h4M8 20h8M12 16v4"/>',
  blood: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  xray: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8.5 15.5l7-7"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="8" r="1.5"/>',
  scalpel: '<path d="M3 21l8-8"/><path d="M11 13l8.5-8.5a2.1 2.1 0 0 1 3 3L14 16z"/>',
  skin: '<circle cx="6.5" cy="9.5" r="1.8"/><circle cx="10" cy="5.5" r="1.8"/><circle cx="14" cy="5.5" r="1.8"/><circle cx="17.5" cy="9.5" r="1.8"/><path d="M12 11c-3 0-6 3.5-6 6.2 0 1.8 1.6 2.3 2.8 2.3 1 0 2-.6 3.2-.6s2.2.6 3.2.6c1.2 0 2.8-.5 2.8-2.3C18 14.5 15 11 12 11z"/>',
  tooth: '<path d="M8 3C5.5 3 4 5 4 7.5c0 3 1.5 4.5 2 7 .5 3 1 6.5 2.5 6.5S10.5 17 12 17s2 4 3.5 4 2-3.5 2.5-6.5c.5-2.5 2-4 2-7C20 5 18.5 3 16 3c-1.5 0-2.5 1-4 1S9.5 3 8 3z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  feather: '<path d="M20 4C12 4 6 10 6 18v2"/><path d="M20 4c0 8-6 12-12 12M10 14l4-4"/>',
  pin: '<path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  heart: '<path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  hospital: '<path d="M4 21V8l8-5 8 5v13z"/><path d="M12 10v6M9 13h6"/>',
  flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7 15h10"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  bed: '<path d="M3 18v-8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
};

export function icon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.stethoscope}</svg>`;
}
