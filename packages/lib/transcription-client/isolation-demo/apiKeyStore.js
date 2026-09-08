/**
 * Isolation Demo Groq key persistence.
 *
 * Demo namespace is written on type/paste. PWA key is read-only fallback.
 * Missing keys must not throw.
 */

export const DEMO_API_KEY_STORAGE = 'ww-iso-transcription-client:groqApiKey';
export const PWA_API_KEY_STORAGE = 'groq_api_key';

/**
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @returns {{ key: string, source: 'demo' | 'pwa' | null }}
 */
export function loadStoredApiKey(storage) {
  try {
    const demo = storage?.getItem?.(DEMO_API_KEY_STORAGE);
    if (typeof demo === 'string' && demo.trim()) {
      return { key: demo.trim(), source: 'demo' };
    }
  } catch {
    // private mode / missing storage
  }

  try {
    const pwa = storage?.getItem?.(PWA_API_KEY_STORAGE);
    if (typeof pwa === 'string' && pwa.trim()) {
      return { key: pwa.trim(), source: 'pwa' };
    }
  } catch {
    // missing PWA key is fine
  }

  return { key: '', source: null };
}

/**
 * Write the demo-namespace key only. Never writes `groq_api_key`.
 * @param {string} value
 * @param {Pick<Storage, 'setItem' | 'removeItem'> | null | undefined} storage
 */
export function persistDemoApiKey(value, storage) {
  try {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      storage?.removeItem?.(DEMO_API_KEY_STORAGE);
      return;
    }
    storage?.setItem?.(DEMO_API_KEY_STORAGE, trimmed);
  } catch {
    // private mode / quota
  }
}

/**
 * Insert clipboard text at the current selection (native paste equivalent).
 * @param {string} currentValue
 * @param {number | null | undefined} selectionStart
 * @param {number | null | undefined} selectionEnd
 * @param {string} pasted
 * @returns {string}
 */
export function applyPastedKey(currentValue, selectionStart, selectionEnd, pasted) {
  const value = String(currentValue || '');
  const insert = String(pasted || '');
  const start = Number.isFinite(selectionStart) ? selectionStart : value.length;
  const end = Number.isFinite(selectionEnd) ? selectionEnd : value.length;
  const from = Math.max(0, Math.min(start, end, value.length));
  const to = Math.max(0, Math.min(Math.max(start, end), value.length));
  return value.slice(0, from) + insert + value.slice(to);
}

export function describeKeySource(source) {
  if (source === 'demo') {
    return `Restored from ${DEMO_API_KEY_STORAGE}`;
  }
  if (source === 'pwa') {
    return `Restored from PWA settings (${PWA_API_KEY_STORAGE})`;
  }
  return '';
}
