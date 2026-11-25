// Helper di sicurezza condivisi tra frontend e script Node.

/** Rimuove i caratteri di controllo ASCII (inclusi CR/LF se singleLine=true). */
export function stripControlChars(value = '', { singleLine = true } = {}) {
  const s = String(value ?? '');
  return singleLine
    ? s.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
    : s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/** Accetta solo URL http:// o https:// validi; restituisce null altrimenti. */
export function safeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch {
    return null;
  }
  return null;
}

/** Accetta solo URL https:// validi (per endpoint autenticati/esterni). */
export function safeHttpsUrl(raw) {
  const href = safeHttpUrl(raw);
  return href && href.startsWith('https://') ? href : null;
}
