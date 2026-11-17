// Графики без библиотек: SVG и HTML, рисуются на сервере.
// Одна серия на график — один цвет (--brand); подписи — цветом текста.
// Подсказка при наведении: <title> у каждого столбца, область наведения шире самого столбца.
import { esc } from '../util.js';

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

// Столбчатая диаграмма по дням. data: [{ label, value, tip }]
export function columnChart({ data, format = String, short = format, height = 240, ariaLabel }) {
  const W = 760; const H = height;
  const left = 64; const right = 8; const top = 12; const bottom = 28;
  const plotW = W - left - right; const plotH = H - top - bottom;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const step = niceStep(maxVal / 4);
  const max = Math.ceil(maxVal / step) * step;
  const y = (v) => top + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(data.length, 1);
  const gap = 2;
  const bw = Math.max(slot - gap, 1);
  const labelEvery = Math.ceil(data.length / 10);

  const grid = [];
  for (let v = 0; v <= max; v += step) {
    grid.push(`<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="gridline${v === 0 ? ' base' : ''}"/>
      <text x="${left - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${esc(short(v))}</text>`);
  }
  const bars = data.map((d, i) => {
    const x = left + i * slot + gap / 2;
    const h = (d.value / max) * plotH;
    const r = Math.min(4, bw / 2, h);
    const yt = top + plotH - h;
    const shape = h > 0
      ? `<path class="bar-mark" d="M${x},${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${top + plotH} H${x} Z"/>`
      : '';
    const label = i % labelEvery === 0
      ? `<text x="${x + bw / 2}" y="${H - 8}" class="tick" text-anchor="middle">${esc(d.label)}</text>` : '';
    return `<g class="bar-g"><title>${esc(d.tip ?? `${d.label}: ${format(d.value)}`)}</title>
      <rect x="${left + i * slot}" y="${top}" width="${slot}" height="${plotH}" class="hit"/>${shape}</g>${label}`;
  }).join('');

  return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}" preserveAspectRatio="xMidYMid meet">
    ${grid.join('')}${bars}</svg></div>`;
}

// Горизонтальные полосы. data: [{ label, value, display, sub }]
export function barList({ data, max = Math.max(...data.map((d) => d.value), 1) }) {
  if (!data.length) return '<p class="empty">Нет данных за период.</p>';
  return `<ul class="bars">${data.map((d) => `
    <li title="${esc(`${d.label}: ${d.display ?? d.value}${d.sub ? `, ${d.sub}` : ''}`)}">
      <span>${esc(d.label)}${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</span>
      <div class="bar"><i style="width:${Math.max(0, Math.min(100, (d.value / max) * 100))}%"></i></div>
      <b>${esc(d.display ?? d.value)}</b>
    </li>`).join('')}</ul>`;
}

// Табличное представление данных графика
export function dataTable(headers, rows) {
  return `<details class="data-table"><summary>Показать таблицей</summary>
    <div class="table-wrap"><table class="table table-compact">
      <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></details>`;
}
