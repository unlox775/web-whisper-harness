import { KEEP_AWAKE_VIDEO_SRC } from './wakeLockVideo';

type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockRequestor = {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
};

type WakeLockNavigator = {
  wakeLock?: WakeLockRequestor;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
};

type WakeLockVideoStyle = {
  position?: string;
  left?: string;
  bottom?: string;
  width?: string;
  height?: string;
  opacity?: string;
  pointerEvents?: string;
};

export type WakeLockVideoLike = {
  muted: boolean;
  defaultMuted?: boolean;
  volume?: number;
  loop: boolean;
  playsInline?: boolean;
  paused?: boolean;
  src: string;
  preload?: string;
  disableRemotePlayback?: boolean;
  style?: WakeLockVideoStyle;
  setAttribute: (name: string, value: string) => void;
  play: () => Promise<void> | void;
  pause: () => void;
  remove?: () => void;
};

type WakeLockDocument = {
  visibilityState?: string;
  body?: { appendChild: (el: WakeLockVideoLike) => void };
  addEventListener: (type: string, listener: () => void) => void;
  createElement?: (tag: 'video') => WakeLockVideoLike;
};

type WakeLockWindow = {
  addEventListener: (type: string, listener: () => void) => void;
};

export type WakeLockEnv = {
  navigator?: WakeLockNavigator;
  document?: WakeLockDocument;
  window?: WakeLockWindow;
};

export type WakeLockLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type WakeLockLogger = (
  level: WakeLockLogLevel,
  payload: () => { message: string; details?: Record<string, unknown> }
) => void;

export type WakeLockMethod = 'wake-lock' | 'video' | 'wake-lock+video' | 'none';

export type WakeLockDebugState = {
  desiredActive: boolean;
  hasSentinel: boolean;
  videoPlaying: boolean;
  method: WakeLockMethod;
};

const wakeLockState = {
  desiredActive: false,
  sentinel: null as WakeLockSentinelLike | null,
  pending: false,
  supportLogged: false,
  listenersAttached: false,
  video: null as WakeLockVideoLike | null,
  videoPlaying: false,
  videoPending: false,
};

let envOverride: WakeLockEnv | null = null;
let logger: WakeLockLogger | null = null;

export function setWakeLockLogger(next: WakeLockLogger | null): void {
  logger = next;
}

export function setWakeLockEnvForTests(env: WakeLockEnv | null): void {
  stopVideoFallbackSync();
  envOverride = env;
  wakeLockState.desiredActive = false;
  wakeLockState.sentinel = null;
  wakeLockState.pending = false;
  wakeLockState.supportLogged = false;
  wakeLockState.listenersAttached = false;
  wakeLockState.videoPlaying = false;
  wakeLockState.videoPending = false;
}

function getNavigator(): WakeLockNavigator | undefined {
  if (envOverride) return envOverride.navigator;
  return typeof navigator === 'undefined' ? undefined : (navigator as WakeLockNavigator);
}

function getDocument(): WakeLockDocument | undefined {
  if (envOverride) return envOverride.document;
  return typeof document === 'undefined' ? undefined : (document as unknown as WakeLockDocument);
}

function getWindow(): WakeLockWindow | undefined {
  if (envOverride) return envOverride.window;
  return typeof window === 'undefined' ? undefined : (window as unknown as WakeLockWindow);
}

function getVisibilityState(): string {
  return getDocument()?.visibilityState ?? 'unknown';
}

function getWakeLockRequestor(): WakeLockRequestor | null {
  const nav = getNavigator();
  const wakeLock = nav?.wakeLock;
  if (!wakeLock || typeof wakeLock.request !== 'function') return null;
  return wakeLock;
}

export function isIosWakeLockUnreliable(nav: WakeLockNavigator | undefined = getNavigator()): boolean {
  if (!nav) return false;
  if (nav.standalone === true) return true;
  const ua = nav.userAgent ?? '';
  if (/iP(hone|ad|od)/i.test(ua)) return true;
  const platform = nav.platform ?? '';
  const maxTouch = nav.maxTouchPoints ?? 0;
  return platform === 'MacIntel' && maxTouch > 1;
}

function needsVideoFallback(): boolean {
  return isIosWakeLockUnreliable() || !getWakeLockRequestor();
}

function currentMethod(): WakeLockMethod {
  const lock = Boolean(wakeLockState.sentinel);
  const video = wakeLockState.videoPlaying;
  if (lock && video) return 'wake-lock+video';
  if (lock) return 'wake-lock';
  if (video) return 'video';
  return 'none';
}

function logWakeLock(
  level: WakeLockLogLevel,
  message: string,
  details?: Record<string, unknown>
): void {
  if (!logger) return;
  try {
    logger(level, () => (details ? { message, details } : { message }));
  } catch {
    // Durable log must never throw into capture / wake-lock control.
  }
}

function acquireDetails(reason: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    reason,
    method: currentMethod(),
    visibility: getVisibilityState(),
    hasSentinel: Boolean(wakeLockState.sentinel),
    videoPlaying: wakeLockState.videoPlaying,
    ...extra,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createVideoElement(): WakeLockVideoLike | null {
  const doc = getDocument();
  if (!doc || typeof doc.createElement !== 'function') return null;
  return doc.createElement('video');
}

function ensureVideo(): WakeLockVideoLike | null {
  if (wakeLockState.video) return wakeLockState.video;
  const video = createVideoElement();
  if (!video) return null;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.disableRemotePlayback = true;
  video.setAttribute('muted', 'true');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('loop', 'true');
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('tabindex', '-1');
  video.setAttribute('disablePictureInPicture', 'true');
  video.setAttribute('x-webkit-airplay', 'deny');
  video.src = KEEP_AWAKE_VIDEO_SRC;
  const style = video.style ?? (video.style = {});
  style.position = 'fixed';
  style.left = '0';
  style.bottom = '0';
  style.width = '2px';
  style.height = '2px';
  style.opacity = '0.01';
  style.pointerEvents = 'none';
  getDocument()?.body?.appendChild(video);
  wakeLockState.video = video;
  return video;
}

function isVideoPlaying(video: WakeLockVideoLike | null): boolean {
  return Boolean(video) && video?.paused === false;
}

async function startVideoFallback(reason: string): Promise<void> {
  if (!wakeLockState.desiredActive || wakeLockState.videoPending) return;
  if (isVideoPlaying(wakeLockState.video)) {
    wakeLockState.videoPlaying = true;
    return;
  }
  const video = ensureVideo();
  if (!video) {
    logWakeLock('warn', 'wake lock video fallback failed', acquireDetails(reason, {
      error: 'no_video_element',
    }));
    return;
  }
  wakeLockState.videoPending = true;
  try {
    const playResult = video.play();
    if (playResult && typeof (playResult as Promise<void>).then === 'function') {
      await playResult;
    }
    wakeLockState.videoPlaying = isVideoPlaying(video);
    if (!wakeLockState.videoPlaying) {
      logWakeLock('warn', 'wake lock video fallback failed', acquireDetails(reason, {
        error: 'play_resolved_paused',
      }));
    }
  } catch (error) {
    wakeLockState.videoPlaying = false;
    logWakeLock('warn', 'wake lock video fallback failed', acquireDetails(reason, {
      error: errorMessage(error),
    }));
  } finally {
    wakeLockState.videoPending = false;
  }
}

function stopVideoFallbackSync(): void {
  const video = wakeLockState.video;
  wakeLockState.video = null;
  wakeLockState.videoPlaying = false;
  wakeLockState.videoPending = false;
  if (!video) return;
  try {
    video.pause();
  } catch {
    // ignore
  }
  try {
    video.remove?.();
  } catch {
    // ignore
  }
}

async function requestWakeLock(reason: string): Promise<void> {
  if (!wakeLockState.desiredActive || wakeLockState.pending || wakeLockState.sentinel) return;
  const wakeLock = getWakeLockRequestor();
  if (!wakeLock) {
    if (!wakeLockState.supportLogged) {
      wakeLockState.supportLogged = true;
      logWakeLock('warn', 'wake lock unavailable', acquireDetails(reason, {
        userAgent: getNavigator()?.userAgent ?? 'unknown',
      }));
    }
    return;
  }
  if (getVisibilityState() !== 'visible') {
    logWakeLock('debug', 'wake lock request deferred until page is visible', acquireDetails(reason));
    return;
  }
  wakeLockState.pending = true;
  try {
    const sentinel = await wakeLock.request('screen');
    wakeLockState.sentinel = sentinel;
    sentinel.addEventListener('release', () => {
      wakeLockState.sentinel = null;
      if (wakeLockState.desiredActive) {
        logWakeLock('warn', 'wake lock released unexpectedly', acquireDetails('released'));
        void acquireAll('released');
      }
    });
  } catch (error) {
    logWakeLock('warn', 'wake lock request failed', acquireDetails(reason, {
      error: errorMessage(error),
    }));
  } finally {
    wakeLockState.pending = false;
  }
}

async function releaseWakeLock(reason: string): Promise<void> {
  const sentinel = wakeLockState.sentinel;
  if (!sentinel) return;
  wakeLockState.sentinel = null;
  try {
    if (!sentinel.released) {
      await sentinel.release();
    }
  } catch (error) {
    logWakeLock('warn', 'wake lock release failed', acquireDetails(reason, {
      error: errorMessage(error),
    }));
  }
}

async function acquireAll(reason: string): Promise<void> {
  if (!wakeLockState.desiredActive) return;
  const startVideo = needsVideoFallback() ? startVideoFallback(reason) : Promise.resolve();
  const startLock = requestWakeLock(reason);
  await Promise.all([startVideo, startLock]);
  if (wakeLockState.desiredActive && !wakeLockState.sentinel && !wakeLockState.videoPlaying) {
    await startVideoFallback(reason);
  }
}

function reacquireIfVisible(reason: string): void {
  if (!wakeLockState.desiredActive) return;
  if (getVisibilityState() === 'hidden') return;
  void acquireAll(reason);
}

export function initializeRecordingWakeLock(): void {
  if (wakeLockState.listenersAttached) return;
  const doc = getDocument();
  const win = getWindow();
  if (!doc && !win) return;
  wakeLockState.listenersAttached = true;
  doc?.addEventListener('visibilitychange', () => {
    if (getDocument()?.visibilityState === 'visible') {
      reacquireIfVisible('visibilitychange');
    }
  });
  const onPageShow = () => reacquireIfVisible('pageshow');
  win?.addEventListener('pageshow', onPageShow);
  doc?.addEventListener('pageshow', onPageShow);
}

export async function setRecordingWakeLockActive(active: boolean, reason: string): Promise<void> {
  wakeLockState.desiredActive = active;
  if (active) {
    await acquireAll(reason);
    const method = currentMethod();
    if (method === 'none') {
      logWakeLock('warn', 'wake lock acquire failed', acquireDetails(reason));
      return;
    }
    logWakeLock('info', 'wake lock acquired', acquireDetails(reason));
    return;
  }
  await releaseWakeLock(reason);
  stopVideoFallbackSync();
  logWakeLock('info', 'wake lock released', acquireDetails(reason));
}

export function getWakeLockDebugState(): WakeLockDebugState {
  return {
    desiredActive: wakeLockState.desiredActive,
    hasSentinel: Boolean(wakeLockState.sentinel),
    videoPlaying: wakeLockState.videoPlaying,
    method: currentMethod(),
  };
}

export function formatWakeLockStatus(state: WakeLockDebugState = getWakeLockDebugState()): string {
  if (!state.desiredActive) return 'Screen lock off';
  if (state.method === 'wake-lock+video') return 'Screen awake · wake lock + video';
  if (state.method === 'wake-lock') return 'Screen awake · wake lock';
  if (state.method === 'video') return 'Screen awake · video';
  return 'Screen may sleep';
}
