export type CaptureErrorAction = 'alert' | 'stop' | 'toast' | 'log';

export const STORAGE_WRITE_FAILED_BANNER =
  'Storage write failed. Recording may be incomplete.';
export const SAVING_BEHIND_NOTICE = 'Saving is behind';

/**
 * PWA policy for capture-engine `captureError` reasons.
 *
 * Dave: keep recording on no-audio. Mid-stream stall never lands here
 * (`audioStalled` is a different event). `no_audio_received` is alert-only
 * in the PWA — do not call finishCapture / navigate Home.
 *
 * `store_write_failed` is a transient diagnostic. It goes to logs only —
 * never the "Storage write failed" banner. Real loss is `chunk_lost`.
 */
export function actionForCaptureError(reason?: string): CaptureErrorAction {
  if (reason === 'no_audio_received') return 'alert';
  if (reason === 'encoding_failed') return 'stop';
  if (reason === 'store_write_failed') return 'log';
  return 'toast';
}

export type PersistUiEvent =
  | { type: 'chunk_lost'; reason?: string }
  | { type: 'persist_backpressure'; reason?: string }
  | { type: 'captureError'; reason?: string };

export type PersistBanner = typeof STORAGE_WRITE_FAILED_BANNER | typeof SAVING_BEHIND_NOTICE | null;

/**
 * User-visible persist copy. Banner only on real loss (`chunk_lost`).
 * Transient `store_write_failed` → no banner. `persist_backpressure` →
 * the softer "Saving is behind" notice.
 */
export function bannerForPersistEvent(event: PersistUiEvent): PersistBanner {
  if (event.type === 'chunk_lost') return STORAGE_WRITE_FAILED_BANNER;
  if (event.type === 'persist_backpressure') return SAVING_BEHIND_NOTICE;
  if (event.type === 'captureError' && event.reason === 'store_write_failed') return null;
  return null;
}
