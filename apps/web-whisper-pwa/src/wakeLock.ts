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
};

type WakeLockDocument = {
  visibilityState?: string;
  addEventListener: (type: string, listener: () => void) => void;
};

export type WakeLockEnv = {
  navigator?: WakeLockNavigator;
  document?: WakeLockDocument;
};

const wakeLockState = {
  desiredActive: false,
  sentinel: null as WakeLockSentinelLike | null,
  pending: false,
  supportLogged: false,
  listenersAttached: false,
};

let envOverride: WakeLockEnv | null = null;

export function setWakeLockEnvForTests(env: WakeLockEnv | null): void {
  envOverride = env;
  wakeLockState.desiredActive = false;
  wakeLockState.sentinel = null;
  wakeLockState.pending = false;
  wakeLockState.supportLogged = false;
  wakeLockState.listenersAttached = false;
}

function getNavigator(): WakeLockNavigator | undefined {
  if (envOverride) return envOverride.navigator;
  return typeof navigator === 'undefined' ? undefined : (navigator as WakeLockNavigator);
}

function getDocument(): WakeLockDocument | undefined {
  if (envOverride) return envOverride.document;
  return typeof document === 'undefined' ? undefined : (document as WakeLockDocument);
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

async function requestWakeLock(reason: string): Promise<void> {
  if (!wakeLockState.desiredActive || wakeLockState.pending || wakeLockState.sentinel) return;
  const wakeLock = getWakeLockRequestor();
  if (!wakeLock) {
    if (!wakeLockState.supportLogged) {
      wakeLockState.supportLogged = true;
      console.debug('Wake Lock API unavailable; screen may sleep during recording', {
        reason,
        userAgent: getNavigator()?.userAgent ?? 'unknown',
      });
    }
    return;
  }
  if (getVisibilityState() !== 'visible') {
    console.debug('Wake lock request deferred until page is visible', {
      reason,
      visibility: getVisibilityState(),
    });
    return;
  }
  wakeLockState.pending = true;
  try {
    const sentinel = await wakeLock.request('screen');
    wakeLockState.sentinel = sentinel;
    sentinel.addEventListener('release', () => {
      wakeLockState.sentinel = null;
      if (wakeLockState.desiredActive) {
        console.debug('Wake lock released unexpectedly; retrying', {
          visibility: getVisibilityState(),
        });
        void requestWakeLock('released');
      }
    });
  } catch (error) {
    console.debug('Wake lock request failed', {
      reason,
      visibility: getVisibilityState(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    wakeLockState.pending = false;
  }
}

async function releaseWakeLock(): Promise<void> {
  const sentinel = wakeLockState.sentinel;
  if (!sentinel) return;
  wakeLockState.sentinel = null;
  try {
    if (!sentinel.released) {
      await sentinel.release();
    }
  } catch (error) {
    console.debug('Wake lock release failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function initializeRecordingWakeLock(): void {
  if (wakeLockState.listenersAttached) return;
  const doc = getDocument();
  if (!doc) return;
  wakeLockState.listenersAttached = true;
  doc.addEventListener('visibilitychange', () => {
    if (!wakeLockState.desiredActive) return;
    if (getDocument()?.visibilityState === 'visible') {
      void requestWakeLock('visibilitychange');
    }
  });
}

export async function setRecordingWakeLockActive(active: boolean, reason: string): Promise<void> {
  wakeLockState.desiredActive = active;
  if (active) {
    await requestWakeLock(reason);
    return;
  }
  await releaseWakeLock();
}

export function getWakeLockDebugState(): {
  desiredActive: boolean;
  hasSentinel: boolean;
} {
  return {
    desiredActive: wakeLockState.desiredActive,
    hasSentinel: Boolean(wakeLockState.sentinel),
  };
}
