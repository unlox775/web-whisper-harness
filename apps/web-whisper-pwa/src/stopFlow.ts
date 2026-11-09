/**
 * Stop-flow UI wait. Persist and transcription keep running even if this
 * times out — the cap only decides when to leave the recording screen.
 */

export const STOP_FINISH_WAIT_MS = 5_000;
export const STOP_FINISHING_HUD_LABEL = 'Finishing recording…';
export const STOP_FINISHING_BUTTON_LABEL = 'Saving recording…';

export type StopUiPhase = 'recording' | 'finishing';

export type StopBusyUi = {
  phase: 'finishing';
  hudLabel: typeof STOP_FINISHING_HUD_LABEL;
  buttonLabel: typeof STOP_FINISHING_BUTTON_LABEL;
  buttonDisabled: true;
};

export type StopWaitOutcome = 'settled' | 'timed_out';

/** Same-frame busy UI for a Stop tap. Second taps stay in this state. */
export function busyUiOnStopTap(_phase: StopUiPhase = 'recording'): StopBusyUi {
  return {
    phase: 'finishing',
    hudLabel: STOP_FINISHING_HUD_LABEL,
    buttonLabel: STOP_FINISHING_BUTTON_LABEL,
    buttonDisabled: true,
  };
}

export function isStopTapIgnored(phase: StopUiPhase): boolean {
  return phase === 'finishing';
}

/**
 * Wait until `work` settles or `timeoutMs` elapses, whichever first.
 * Never cancels `work`. Callers must keep flushPending / transcription alive.
 */
export async function waitForStopReady(
  work: Promise<unknown>,
  options: { timeoutMs?: number } = {}
): Promise<StopWaitOutcome> {
  const timeoutMs = options.timeoutMs ?? STOP_FINISH_WAIT_MS;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([Promise.resolve(work).then(() => undefined, () => undefined), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return timedOut ? 'timed_out' : 'settled';
}
