export type CaptureErrorAction = 'alert' | 'stop' | 'toast';

/**
 * PWA policy for capture-engine `captureError` reasons.
 *
 * Dave: keep recording on no-audio. Mid-stream stall never lands here
 * (`audioStalled` is a different event). `no_audio_received` is alert-only
 * in the PWA — do not call finishCapture / navigate Home.
 */
export function actionForCaptureError(reason?: string): CaptureErrorAction {
  if (reason === 'no_audio_received') return 'alert';
  if (reason === 'encoding_failed') return 'stop';
  if (reason === 'store_write_failed') return 'toast';
  return 'toast';
}
