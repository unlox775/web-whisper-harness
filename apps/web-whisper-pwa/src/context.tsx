import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { CaptureError, flushPending, startCapture, type CaptureHandle } from '@web-whisper/capture-engine';
import { validateKey } from '@web-whisper/transcription-client';
import { applyLoggerConfig, type PackageLogLevels } from './logSettings';
import {
  capBytesFromMb,
  loadSettings,
  saveLogLevels,
  saveSetting,
  transcriptionContextFromSettings,
} from './settings';
import { ingestGrowingSession, transcribeSession } from './orchestration';
import {
  createRetentionGate,
  enforceRetentionAfterPersistIdle,
} from './retentionAfterIdle';
import {
  isIsolationSettingsScreenshot,
  isSessionDebugExportScreenshot,
  isSessionDetailScreenshot,
  isSettingsContextScreenshot,
  isSettingsLogLevelsScreenshot,
  readScreenshotMode,
} from './screenshotMode';
import { ensureSessionDetailScreenshotSession } from './sessionDetailScreenshot';
import {
  actionForCaptureError,
  bannerForPersistEvent,
} from './captureErrorPolicy';
import { type RetentionOpportunity } from './retentionPolicy';
import {
  accountEncodedChunkBytes,
  shouldRunRecordingRetention,
} from './recordingUsedBytes';
import {
  closeAlertAudio,
  pcmHeartbeatFromStatus,
  prepareAlertAudioFromUserGesture,
  shouldShowNoAudioAlert,
} from './noAudioAlert';
import {
  initializeRecordingWakeLock,
  setRecordingWakeLockActive,
  setWakeLockLogger,
} from './wakeLock';
import { rememberRecorderDurationSeconds } from './recorderDuration';
import { waitForStopReady } from './stopFlow';
import type { AppSettings, Screen, SessionRecord, ToastMessage, ToastTone } from './types';

function captureStartOptions() {
  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('simulate') === '1') {
      return { audioSource: 'simulated' as const };
    }
  } catch {
    // ignore
  }
  return undefined;
}

type ConfirmState = {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
} | null;

type AppContextValue = {
  ready: boolean;
  settings: AppSettings;
  sessions: SessionRecord[];
  usedBytes: number;
  capBytes: number;
  screen: Screen;
  sessionId: string | null;
  autoPlay: boolean;
  settingsOpen: boolean;
  developerOpen: boolean;
  toasts: ToastMessage[];
  confirm: ConfirmState;
  permissionError: string | null;
  captureHandle: CaptureHandle | null;
  recordingSessionId: string | null;
  chunkCount: number;
  noAudioAlert: boolean;
  noAudioAlertStartedAt: number | null;
  setSettingsOpen: (open: boolean) => void;
  setDeveloperOpen: (open: boolean) => void;
  setPermissionError: (message: string | null) => void;
  showToast: (text: string, tone?: ToastTone) => void;
  askConfirm: (state: ConfirmState) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  persistKey: (apiKey: string, valid: boolean, status: string) => void;
  refresh: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  abortRecording: () => Promise<void>;
  stopFinishing: boolean;
  openSession: (id: string, autoPlay?: boolean) => void;
  goHome: () => void;
  deleteSessionById: (id: string) => Promise<void>;
  enforceCap: (opts?: { force?: boolean; opportunity?: RetentionOpportunity }) => Promise<void>;
  savingBehind: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [screen, setScreen] = useState<Screen>('home');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [captureHandle, setCaptureHandle] = useState<CaptureHandle | null>(null);
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [noAudioAlert, setNoAudioAlert] = useState(false);
  const [noAudioAlertStartedAt, setNoAudioAlertStartedAt] = useState<number | null>(null);
  const [savingBehind, setSavingBehind] = useState(false);
  const [stopFinishing, setStopFinishing] = useState(false);
  const toastId = useRef(0);
  const handleRef = useRef<CaptureHandle | null>(null);
  const recordingSessionIdRef = useRef<string | null>(null);
  const finishingRef = useRef(false);
  const abortRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const noAudioAlertRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const logSessionRef = useRef<string | null>(null);

  const capBytes = capBytesFromMb(settings.storageCapMb);
  const usedBytesRef = useRef(0);
  const usedBytesKnownRef = useRef(false);

  const syncLogger = useCallback((overrides?: {
    levels?: PackageLogLevels;
    activeSessionId?: string | null;
  }) => {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, 'activeSessionId')) {
      logSessionRef.current = overrides.activeSessionId ?? null;
    }
    applyLoggerConfig(sessionStore.configureLogger, {
      levels: overrides?.levels ?? settingsRef.current.logLevels,
      activeSessionId: logSessionRef.current,
    });
  }, []);

  const settleLoggerIfIdle = useCallback((sessionId: string) => {
    if (recordingSessionIdRef.current === sessionId) return;
    if (logSessionRef.current !== sessionId) return;
    syncLogger({ activeSessionId: null });
  }, [syncLogger]);

  const showToast = useCallback((text: string, tone: ToastTone = 'warning') => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, tone === 'success' ? 2000 : 5000);
  }, []);

  const refreshSessions = useCallback(async () => {
    const listed = await sessionStore.listSessions({ limit: 100, offset: 0 });
    if (!listed.error) {
      setSessions((listed.sessions || []) as SessionRecord[]);
    }
  }, []);

  const refreshStats = useCallback(async () => {
    const stats = await sessionStore.getStorageStats();
    if (!stats.error) {
      usedBytesKnownRef.current = true;
      usedBytesRef.current = stats.usedBytes || 0;
      setUsedBytes(usedBytesRef.current);
    }
  }, []);

  const refresh = useCallback(async () => {
    await refreshSessions();
    // Storage chip is not on the list critical path. Stats may still scan today
    // (store spec); do not block Home chrome or goHome on that work.
    void refreshStats();
  }, [refreshSessions, refreshStats]);

  const lastEnforceAt = useRef(0);
  const lastRecordingRetentionAt = useRef<number | null>(null);
  const lastBackpressureToastAt = useRef(0);
  const enqueueRetention = useMemo(() => createRetentionGate(), []);

  const enforceCap = useCallback(async (opts?: {
    force?: boolean;
    opportunity?: RetentionOpportunity;
  }) => {
    const recording = Boolean(recordingSessionIdRef.current);
    const opportunity: RetentionOpportunity =
      opts?.opportunity ?? (recording ? 'recording' : 'idle');

    if (recording && opportunity === 'recording') {
      // Do not call getStorageStats (or cursor the library) on the live
      // chunk path. The 90% gate uses last-known usedBytes from refresh
      // plus incremental encoded sizes. Unknown stats → skip retention.
      const run = shouldRunRecordingRetention({
        usedBytesKnown: usedBytesKnownRef.current,
        usedBytes: usedBytesRef.current,
        capBytes,
        lastRecordingRetentionAtMs: lastRecordingRetentionAt.current,
        nowMs: Date.now(),
      });
      if (!run) return;
      lastRecordingRetentionAt.current = Date.now();
    } else if (!opts?.force && Date.now() - lastEnforceAt.current < 4000) {
      return;
    }

    if (opportunity !== 'recording') {
      lastEnforceAt.current = Date.now();
    }

    // After Stop / idle / Settings: await flushPending so lostChunks are
    // known, then retain. During a live near-cap take, skip flush so a
    // backed-up persist queue cannot block freeing space.
    const result = await enqueueRetention(() =>
      enforceRetentionAfterPersistIdle({
        capBytes,
        flushPending,
        skipFlush: recording && opportunity === 'recording',
        enforceRetentionPolicy: (bytes) => sessionStore.enforceRetentionPolicy(bytes),
        sessionId: recordingSessionIdRef.current ?? logSessionRef.current,
        log: sessionStore.log,
      })
    );
    if (result.error) return;
    if (typeof result.newUsedBytes === 'number' && Number.isFinite(result.newUsedBytes)) {
      usedBytesKnownRef.current = true;
      usedBytesRef.current = result.newUsedBytes;
      setUsedBytes(result.newUsedBytes);
    }
    const purged = Array.isArray(result.purgedChunkIds) ? result.purgedChunkIds.length : 0;
    if (purged > 0 || result.deletedSessions > 0) {
      await refresh();
    }
  }, [capBytes, enqueueRetention, refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sessionStore.init({ databaseName: 'web-whisper-db' });
      if (cancelled) return;
      await sessionStore.reconcileDanglingSessions();
      if (cancelled) return;
      const loaded = loadSettings();
      setSettings(loaded);
      syncLogger({ levels: loaded.logLevels, activeSessionId: null });
      if (isSettingsLogLevelsScreenshot(readScreenshotMode())) {
        sessionStore.configureLogger({ activeSessionId: 'ses-settings-log-levels' });
        await sessionStore.log('web-whisper-pwa', 'info', () => ({
          message: 'Advanced Settings screenshot seed',
          details: { source: 'screenshot' },
        }));
        await sessionStore.log('capture-engine', 'warn', () => ({
          message: 'capture screenshot seed',
        }));
        sessionStore.configureLogger({ activeSessionId: null });
      }
      await refreshSessions();
      void refreshStats();
      if (!cancelled) setReady(true);
      if (loaded.groqApiKey) {
        const result = await validateKey(loaded.groqApiKey);
        if (!cancelled) {
          setSettings((current) => ({
            ...current,
            keyValid: result.valid,
            keyStatus: result.valid ? 'Valid' : result.reason || 'Invalid',
          }));
        }
      }
    })().catch((error) => {
      console.error(error);
      showToast('Storage unavailable. Check browser storage permissions.', 'error');
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshSessions, refreshStats, showToast, syncLogger]);

  useEffect(() => {
    if (!ready) return;
    void enforceCap({ force: true, opportunity: 'boot' });
  }, [ready, capBytes, enforceCap]);

  useEffect(() => {
    setWakeLockLogger((level, payload) => {
      void sessionStore.log('web-whisper-pwa', level, payload);
    });
    initializeRecordingWakeLock();
    return () => {
      void setRecordingWakeLockActive(false, 'unmount');
      setWakeLockLogger(null);
      closeAlertAudio();
    };
  }, []);

  const enterNoAudioAlert = useCallback((startedAt: number) => {
    if (noAudioAlertRef.current) return;
    noAudioAlertRef.current = true;
    setNoAudioAlert(true);
    setNoAudioAlertStartedAt(startedAt);
  }, []);

  const clearNoAudioAlert = useCallback(() => {
    if (!noAudioAlertRef.current) return;
    noAudioAlertRef.current = false;
    setNoAudioAlert(false);
    setNoAudioAlertStartedAt(null);
  }, []);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    try {
      if (key === 'groqApiKey') saveSetting('groqApiKey', String(value));
      if (key === 'storageCapMb') saveSetting('storageCapMb', Number(value));
      if (key === 'developerModeEnabled') saveSetting('developerModeEnabled', Boolean(value));
      if (key === 'onboardingDismissed') saveSetting('onboardingDismissed', Boolean(value));
      if (key === 'contextAwareTranscription') {
        saveSetting('contextAwareTranscription', Boolean(value));
      }
      if (key === 'transcriptionVocabulary') saveSetting('transcriptionVocabulary', String(value));
      if (key === 'logLevels') {
        saveLogLevels(value as PackageLogLevels);
        syncLogger({ levels: value as PackageLogLevels });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'storage quota exceeded';
      showToast(`Failed to save settings: ${message}`, 'error');
    }
  }, [showToast, syncLogger]);

  useEffect(() => {
    if (!ready) return;
    const mode = readScreenshotMode();
    if (isIsolationSettingsScreenshot(mode) || isSettingsLogLevelsScreenshot(mode)) {
      if (!settings.developerModeEnabled) {
        updateSetting('developerModeEnabled', true);
      }
      setSettingsOpen(true);
    }
    if (isSettingsContextScreenshot(mode)) {
      if (!settings.transcriptionVocabulary) {
        updateSetting('transcriptionVocabulary', 'Asana, Groq, BrainGraft, TeleLinux');
      }
      setSettingsOpen(true);
    }
    if (isSessionDebugExportScreenshot(mode) && !settings.developerModeEnabled) {
      updateSetting('developerModeEnabled', true);
    }
  }, [ready, settings.developerModeEnabled, updateSetting]);

  const persistKey = useCallback((apiKey: string, valid: boolean, status: string) => {
    setSettings((current) => ({
      ...current,
      groqApiKey: apiKey,
      keyValid: valid,
      keyStatus: status,
    }));
    try {
      saveSetting('groqApiKey', apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'storage quota exceeded';
      showToast(`Failed to save settings: ${message}`, 'error');
    }
  }, [showToast]);

  const goHome = useCallback(() => {
    if (handleRef.current || recordingSessionIdRef.current) {
      void abortRecordingRef.current?.();
      return;
    }
    setScreen('home');
    setSessionId(null);
    setAutoPlay(false);
    void refreshSessions();
  }, [refreshSessions]);

  const openSession = useCallback((id: string, shouldAutoPlay = false) => {
    setSessionId(id);
    setAutoPlay(shouldAutoPlay);
    setScreen('session');
  }, []);

  useEffect(() => {
    if (!ready) return;
    const mode = readScreenshotMode();
    if (!isSessionDetailScreenshot(mode) && !isSessionDebugExportScreenshot(mode)) return;
    let cancelled = false;
    void ensureSessionDetailScreenshotSession().then((id) => {
      if (!cancelled && id) openSession(id);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, openSession]);

  const deleteSessionById = useCallback(async (id: string) => {
    const result = await sessionStore.deleteSession(id);
    if (result.error && result.error !== 'session_not_found') {
      showToast(
        result.error === 'database_unavailable'
          ? 'Storage unavailable. Cannot delete session.'
          : 'Session not found. It may have been deleted.',
        'error'
      );
      return;
    }
    if (sessionId === id) goHome();
    else await refresh();
  }, [goHome, refresh, sessionId, showToast]);

  const startRecording = useCallback(async () => {
    if (handleRef.current) return;
    prepareAlertAudioFromUserGesture();
    // Same turn as the Record tap so iOS video.play() / wakeLock.request() keep the gesture.
    void setRecordingWakeLockActive(true, 'start-recording');
    await enforceCap({ force: true, opportunity: 'start' });
    const created = await sessionStore.createSession();
    if (created.error || !created.id) {
      void setRecordingWakeLockActive(false, 'start-failed');
      showToast('Storage unavailable. Check browser storage permissions.', 'error');
      return;
    }
    syncLogger({ activeSessionId: created.id });
    try {
      const handle = await startCapture(created.id, captureStartOptions());
      handleRef.current = handle;
      recordingSessionIdRef.current = created.id;
      lastRecordingRetentionAt.current = null;
      setSavingBehind(false);
      setCaptureHandle(handle);
      setRecordingSessionId(created.id);
      setChunkCount(0);
      setScreen('recording');
      recordingStartedAtRef.current = Date.now();
      void setRecordingWakeLockActive(true, 'recording-active');
      try {
        if (new URLSearchParams(window.location.search).get('perfHarness') === '1') {
          const persist: Array<{ at: number; pendingCount?: number; oldestSeq?: number }> = [];
          const encoded: Array<{ at: number; seq?: number }> = [];
          (window as unknown as { __wwCapture?: unknown }).__wwCapture = {
            getStatus: () => handle.getStatus(),
            persist,
            encoded,
          };
          handle.on('persist_backpressure', (event: { pendingCount?: number; oldestSeq?: number }) => {
            persist.push({ at: performance.now(), ...event });
          });
          handle.on('chunkEncoded', (event: { seq?: number }) => {
            encoded.push({ at: performance.now(), seq: event.seq });
          });
        }
      } catch {
        // harness only
      }
      handle.on('chunkEncoded', (event: { seq?: number; byteLength?: number }) => {
        setChunkCount((event.seq ?? 0) + 1);
        setSavingBehind(false);
        if (usedBytesKnownRef.current && typeof event.byteLength === 'number') {
          usedBytesRef.current = accountEncodedChunkBytes(
            usedBytesRef.current,
            event.byteLength
          );
        }
        void enforceCap({ opportunity: 'recording' });
      });
      handle.on('audioStalled', (event: { stalledFor?: number }) => {
        const stalledForMs = Math.max(0, (event.stalledFor ?? 5) * 1000);
        enterNoAudioAlert(Date.now() - stalledForMs);
      });
      handle.on('audioResumed', () => {
        clearNoAudioAlert();
      });
      handle.on('chunk_lost', (event: {
        sessionId?: string;
        seq?: number;
        startMs?: number;
        endMs?: number;
        reason?: string;
      }) => {
        void sessionStore.log('web-whisper-pwa', 'error', () => ({
          message: 'chunk_lost',
          details: {
            sessionId: event.sessionId ?? created.id,
            seq: event.seq,
            startMs: event.startMs,
            endMs: event.endMs,
            reason: event.reason,
          },
        }));
        const banner = bannerForPersistEvent({ type: 'chunk_lost', reason: event.reason });
        if (banner) showToast(banner, 'warning');
      });
      handle.on('persist_backpressure', (event: { pendingCount?: number; oldestSeq?: number }) => {
        setSavingBehind(true);
        void sessionStore.log('web-whisper-pwa', 'warn', () => ({
          message: 'persist_backpressure',
          details: {
            sessionId: created.id,
            pendingCount: event.pendingCount,
            oldestSeq: event.oldestSeq,
          },
        }));
        const notice = bannerForPersistEvent({ type: 'persist_backpressure' });
        if (notice && Date.now() - lastBackpressureToastAt.current > 15_000) {
          lastBackpressureToastAt.current = Date.now();
          showToast(notice, 'warning');
        }
      });
      handle.on('captureError', (event: { reason?: string; details?: string }) => {
        const action = actionForCaptureError(event.reason);
        if (action === 'alert') {
          enterNoAudioAlert(Date.now() - 10_000);
          return;
        }
        if (action === 'log' || event.reason === 'store_write_failed') {
          void sessionStore.log('web-whisper-pwa', 'warn', () => ({
            message: 'store_write_failed',
            details: { reason: event.reason, details: event.details },
          }));
          void enforceCap({ opportunity: 'recording' });
          return;
        }
        if (action === 'stop') {
          showToast(`Recording failed: ${event.details || event.reason}`, 'error');
          void finishCaptureRef.current?.('home');
          return;
        }
        showToast(`Recording failed: ${event.details || event.reason}`, 'error');
      });
    } catch (error) {
      // Capture never started — no encoded audio to keep.
      void setRecordingWakeLockActive(false, 'start-failed');
      syncLogger({ activeSessionId: null });
      await sessionStore.deleteSession(created.id);
      if (error instanceof CaptureError && error.code === 'permission_denied') {
        setPermissionError(
          'Microphone permission denied. Please allow microphone access in iOS Settings → Safari → Web Whisper → Microphone.'
        );
        return;
      }
      const message = error instanceof Error ? error.message : 'Could not start recording';
      showToast(message, 'error');
    }
  }, [clearNoAudioAlert, enforceCap, enterNoAudioAlert, showToast, syncLogger]);

  const finishCapture = useCallback(
    async (navigate: 'session' | 'home' | 'none') => {
      void setRecordingWakeLockActive(false, navigate === 'none' ? 'unload' : 'finish-capture');
      recordingStartedAtRef.current = null;
      clearNoAudioAlert();
      closeAlertAudio();
      if (finishingRef.current && navigate === 'none') {
        const handle = handleRef.current;
        if (handle) {
          try {
            await handle.stop();
          } catch {
            // keep session
          }
        }
        return;
      }
      if (finishingRef.current) return;
      finishingRef.current = true;
      const handle = handleRef.current;
      const id = recordingSessionIdRef.current;
      let summary: { hasAudio?: boolean; sessionId?: string | null; totalDuration?: number } = {
        hasAudio: false,
        sessionId: id,
      };

      // Durability work is never cancelled. The UI wait below may time out;
      // flushPending / trailing ingest / transcription keep running.
      const persistAndTranscribe = (async () => {
        try {
          if (handle) {
            const liveDuration = handle.getStatus()?.currentDuration;
            if (id && liveDuration) rememberRecorderDurationSeconds(id, liveDuration);
            summary = await handle.stop();
          }
        } catch {
          // Abort/stop must never drop audio that already landed in IndexedDB.
        }
        if (id && typeof summary.totalDuration === 'number') {
          rememberRecorderDurationSeconds(id, summary.totalDuration);
        }
        handleRef.current = null;
        recordingSessionIdRef.current = null;
        setCaptureHandle(null);
        setRecordingSessionId(null);
        setSavingBehind(false);
        if (!id) return;
        const flushed = await flushPending();
        if (flushed?.lostChunks?.length) {
          const banner = bannerForPersistEvent({ type: 'chunk_lost' });
          if (banner) showToast(banner, 'warning');
        }
        await sessionStore.finalizeSession(id);
        if (navigate === 'none') {
          settleLoggerIfIdle(id);
          return;
        }
        // Retention after persist idle — not part of the UI wait, never cancelled.
        void enforceCap({ force: true, opportunity: 'stop' });
        const apiKey = settings.groqApiKey;
        const canTranscribe = Boolean(apiKey && settings.keyValid);
        try {
          await ingestGrowingSession(id, {
            apiKey: canTranscribe ? apiKey : undefined,
            includeTrailing: true,
            transcribe: false,
            ...transcriptionContextFromSettings(settings),
          });
        } catch (error) {
          console.warn('Post-recording snip commit failed', error);
        }
        if (canTranscribe && apiKey) {
          try {
            await transcribeSession(id, apiKey, () => {}, {
              onTranscriptWritten: () => enforceCap({ force: true, opportunity: 'idle' }),
              ...transcriptionContextFromSettings(settings),
            });
          } catch (error) {
            console.warn('Post-recording transcription failed', error);
          } finally {
            settleLoggerIfIdle(id);
          }
        } else {
          settleLoggerIfIdle(id);
        }
      })();

      if (navigate === 'none') {
        await persistAndTranscribe;
        finishingRef.current = false;
        setStopFinishing(false);
        return;
      }

      await waitForStopReady(persistAndTranscribe);
      setStopFinishing(false);
      // UI wait is over. Leftover persist/transcription may still run; a later
      // take must be able to Stop. handle.stop() is idempotent if pagehide races.
      finishingRef.current = false;
      if (navigate === 'session' && id) {
        openSession(id);
        if (summary && summary.hasAudio === false) {
          showToast('This session has no playable audio.', 'warning');
        }
      } else if (navigate === 'home') {
        setScreen('home');
        setSessionId(null);
        setAutoPlay(false);
        await refresh();
      }
      void persistAndTranscribe.finally(() => {
        void refresh();
      });
    },
    [
      clearNoAudioAlert,
      enforceCap,
      openSession,
      refresh,
      settleLoggerIfIdle,
      settings.groqApiKey,
      settings.keyValid,
      settings.contextAwareTranscription,
      settings.transcriptionVocabulary,
      showToast,
    ]
  );

  useEffect(() => {
    if (!captureHandle) return undefined;
    const tick = () => {
      const status = captureHandle.getStatus();
      if (!status?.isActive) return;
      const startedAt = recordingStartedAtRef.current;
      const show = shouldShowNoAudioAlert({
        recording: true,
        pcmHeartbeat: pcmHeartbeatFromStatus(status),
        stalled: status.stalled,
        msSinceRecordingStart: startedAt == null ? 0 : Date.now() - startedAt,
      });
      if (show) {
        const alertStartedAt = status.stalled
          ? Date.now() - Math.max(0, (status.stalledFor || 0) * 1000)
          : startedAt ?? Date.now();
        enterNoAudioAlert(alertStartedAt);
        return;
      }
      clearNoAudioAlert();
    };
    const id = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(id);
  }, [captureHandle, clearNoAudioAlert, enterNoAudioAlert]);

  const finishCaptureRef = useRef(finishCapture);
  finishCaptureRef.current = finishCapture;

  const stopRecording = useCallback(async () => {
    // Same-frame busy state: schedule before the first await in finishCapture.
    setStopFinishing(true);
    await finishCapture('home');
  }, [finishCapture]);

  const abortRecording = useCallback(async () => {
    await finishCapture('home');
  }, [finishCapture]);

  abortRecordingRef.current = abortRecording;

  useEffect(() => {
    const persistOnUnload = () => {
      void finishCaptureRef.current?.('none');
    };
    const persistAndReturnHome = () => {
      void finishCaptureRef.current?.('home');
    };
    const onPageShow = () => {
      if (!handleRef.current) {
        setScreen((current) => (current === 'recording' ? 'home' : current));
        void refresh();
      }
    };
    window.addEventListener('pagehide', persistAndReturnHome);
    window.addEventListener('beforeunload', persistOnUnload);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('freeze', persistOnUnload);
    (window as unknown as { __webWhisperAbortRecording?: () => Promise<void> }).__webWhisperAbortRecording =
      abortRecording;
    return () => {
      window.removeEventListener('pagehide', persistOnUnload);
      window.removeEventListener('beforeunload', persistOnUnload);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('freeze', persistOnUnload);
      delete (window as unknown as { __webWhisperAbortRecording?: () => Promise<void> }).__webWhisperAbortRecording;
    };
  }, [abortRecording, refresh]);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      settings,
      sessions,
      usedBytes,
      capBytes,
      screen,
      sessionId,
      autoPlay,
      settingsOpen,
      developerOpen,
      toasts,
      confirm,
      permissionError,
      captureHandle,
      recordingSessionId,
      chunkCount,
      noAudioAlert,
      noAudioAlertStartedAt,
      savingBehind,
      setSettingsOpen,
      setDeveloperOpen,
      setPermissionError,
      showToast,
      askConfirm: setConfirm,
      updateSetting,
      persistKey,
      refresh,
      startRecording,
      stopRecording,
      abortRecording,
      stopFinishing,
      openSession,
      goHome,
      deleteSessionById,
      enforceCap,
    }),
    [
      autoPlay,
      capBytes,
      captureHandle,
      chunkCount,
      confirm,
      noAudioAlert,
      noAudioAlertStartedAt,
      savingBehind,
      developerOpen,
      permissionError,
      ready,
      recordingSessionId,
      refresh,
      sessionId,
      sessions,
      settings,
      settingsOpen,
      startRecording,
      stopRecording,
      abortRecording,
      stopFinishing,
      usedBytes,
      showToast,
      updateSetting,
      persistKey,
      openSession,
      goHome,
      deleteSessionById,
      enforceCap,
      screen,
      toasts,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
