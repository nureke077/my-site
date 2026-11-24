// Клиент локальной модели Ollama (http://localhost:11434). Встроенный fetch, без пакетов.
// Если Ollama не запущена — функции возвращают null, а сайт работает дальше без ИИ.

export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

let lastCheck = { at: 0, ok: false };

// Доступность проверяем не чаще раза в 30 секунд, чтобы недоступная модель не тормозила сайт
export async function available() {
  if (process.env.AI_MODE === 'rules') return false;
  if (Date.now() - lastCheck.at < 30_000) return lastCheck.ok;
  let ok = false;
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    ok = r.ok && (await r.json()).models?.some((m) => m.name === OLLAMA_MODEL || m.model === OLLAMA_MODEL);
  } catch { ok = false; }
  lastCheck = { at: Date.now(), ok };
  return ok;
}

export function resetAvailability() { lastCheck = { at: 0, ok: false }; }

// Один запрос к модели. Возвращает { text, promptTokens, outputTokens, ms } или null при сбое.
export async function generate(prompt, { options = {}, timeoutMs = 20_000 } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return { text: d.response ?? '', promptTokens: d.prompt_eval_count, outputTokens: d.eval_count, ms: Date.now() - t0 };
  } catch {
    lastCheck = { at: Date.now(), ok: false };
    return null;
  }
}
