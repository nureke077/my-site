// Разбор запросов и отправка ответов — без сторонних пакетов.

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('='))
    .filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]));
}

async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос. Фото — не больше 2 МБ.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// multipart/form-data: поля формы и файлы.
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new HttpError(400, 'Неверная форма');
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const fields = {};
  const files = {};
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(boundary, start);
    if (next === -1) break;
    const part = buf.slice(start + 2, next - 2); // без \r\n в начале и конце
    const headEnd = part.indexOf('\r\n\r\n');
    if (headEnd !== -1) {
      const head = part.slice(0, headEnd).toString('utf8');
      const body = part.slice(headEnd + 4);
      const name = /name="([^"]*)"/i.exec(head)?.[1];
      const filename = /filename="([^"]*)"/i.exec(head)?.[1];
      if (name !== undefined) {
        if (filename !== undefined) {
          if (body.length) files[name] = { filename, mime: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? '', data: body };
        } else {
          fields[name] = body.toString('utf8').trim();
        }
      }
    }
    pos = next;
  }
  return { ...fields, _files: files };
}

export async function readForm(req, { limit = 64 * 1024 } = {}) {
  const type = req.headers['content-type'] ?? '';
  const buf = await readBody(req, limit);
  if (type.startsWith('multipart/form-data')) return parseMultipart(buf, type);
  const params = new URLSearchParams(buf.toString('utf8'));
  return Object.fromEntries([...params].map(([k, v]) => [k, v.trim()]));
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

export function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

export const redirect = (res, to, headers = {}) => send(res, 303, '', { Location: to, ...headers });
export const json = (res, data, status = 200) =>
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });

export function sessionCookie(token, maxAge) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

// CSV для Excel: BOM, разделитель «;», кавычки по правилам RFC 4180.
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

// Проверяем, что файл действительно картинка, по первым байтам.
export function imageMime(data) {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
