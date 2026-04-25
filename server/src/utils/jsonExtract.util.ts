/**
 * Достаёт первый полный JSON-объект `{...}` из ответа модели.
 * Важно: `lastIndexOf('}')` ломает разбор, если внутри строк есть `}` (LaTeX, примеры кода).
 */
export function extractFirstJsonObject(raw: string): string | null {
  let s = raw.trim();
  const openFence = /^```(?:json)?\s*/i;
  if (openFence.test(s)) {
    s = s.replace(openFence, '');
    s = s.replace(/\s*```\s*$/i, '');
    s = s.trim();
  }
  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') {
        inStr = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
