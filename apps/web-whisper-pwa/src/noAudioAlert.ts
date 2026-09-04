export const NO_AUDIO_BEEP_DELAY_MS = 5000;
export const NO_AUDIO_BEEP_INTERVAL_MS = 5000;

export const BEEP_COUNT = 3;
export const BEEP_DURATION_MS = 110;
export const BEEP_GAP_MS = 90;
export const BEEP_GAIN = 0.42;
export const BEEP_FREQUENCY_HZ = 880;

type AudioContextCtor = new () => AudioContext;

let alertContext: AudioContext | null = null;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return typeof ctor === 'function' ? ctor : null;
}

export function prepareAlertAudioFromUserGesture(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!alertContext) {
    try {
      alertContext = new Ctor();
    } catch {
      return null;
    }
  }
  void alertContext.resume();
  return alertContext;
}

export function getAlertAudioContext(): AudioContext | null {
  return alertContext;
}

export function closeAlertAudio(): void {
  const ctx = alertContext;
  alertContext = null;
  if (!ctx) return;
  void ctx.close().catch(() => undefined);
}

export function playThreeBeepPattern(context?: AudioContext | null): boolean {
  const ctx = context ?? alertContext;
  if (!ctx) return false;
  void ctx.resume();
  const now = ctx.currentTime;
  const step = (BEEP_DURATION_MS + BEEP_GAP_MS) / 1000;
  const duration = BEEP_DURATION_MS / 1000;
  for (let i = 0; i < BEEP_COUNT; i += 1) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    gainNode.gain.value = BEEP_GAIN;
    oscillator.type = 'sine';
    oscillator.frequency.value = BEEP_FREQUENCY_HZ;
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    const startAt = now + step * i;
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  }
  return true;
}

export function shouldShowNoAudioAlert(input: {
  recording: boolean;
  chunksEncoded: number;
  stalled?: boolean;
  noAudioReceived?: boolean;
}): boolean {
  if (!input.recording) return false;
  if (input.noAudioReceived) return true;
  if (input.stalled) return true;
  return input.chunksEncoded === 0;
}

export function firstBeepDelayMs(alertStartedAt: number, now = Date.now()): number {
  return Math.max(0, NO_AUDIO_BEEP_DELAY_MS - (now - alertStartedAt));
}

export function scheduleNoAudioBeeps(opts: {
  alertActive: boolean;
  startedAt: number | null;
  play: () => void;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  setIntervalFn?: typeof setInterval;
  clearTimeoutFn?: typeof clearTimeout;
  clearIntervalFn?: typeof clearInterval;
}): () => void {
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
  const clearIntervalFn = opts.clearIntervalFn ?? clearInterval;
  if (!opts.alertActive || opts.startedAt == null) {
    return () => undefined;
  }
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const setIntervalFn = opts.setIntervalFn ?? setInterval;
  const now = opts.now ?? Date.now;
  const delay = firstBeepDelayMs(opts.startedAt, now());
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const timeoutId = setTimeoutFn(() => {
    opts.play();
    intervalId = setIntervalFn(() => {
      opts.play();
    }, NO_AUDIO_BEEP_INTERVAL_MS);
  }, delay);
  return () => {
    clearTimeoutFn(timeoutId);
    if (intervalId != null) clearIntervalFn(intervalId);
  };
}
