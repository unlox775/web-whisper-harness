/** Relative path from the published PWA (`docs/index.html`) to the Isolation Demos index. */
export const ISOLATION_DEMOS_RELATIVE_PATH = 'isolation-demos/';

/** Canonical GitHub Pages URL for Isolation Demos. */
export const ISOLATION_DEMOS_PAGES_URL =
  'https://unlox775.github.io/web-whisper-harness/isolation-demos/';

/**
 * Href for the Isolation Demos index.
 *
 * On GitHub Pages (and a local `docs/` preview) the demos sit beside the PWA, so
 * a relative URL works. Falls back to the published Pages URL if `baseHref` is
 * missing or invalid.
 */
export function isolationDemosHref(baseHref?: string): string {
  const base =
    baseHref ??
    (typeof window !== 'undefined' ? window.location.href : ISOLATION_DEMOS_PAGES_URL);
  try {
    return new URL(ISOLATION_DEMOS_RELATIVE_PATH, base).href;
  } catch {
    return ISOLATION_DEMOS_PAGES_URL;
  }
}
