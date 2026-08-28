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
import { CaptureError, startCapture, type CaptureHandle } from '@web-whisper/capture-engine';
import { validateKey } from '@web-whisper/transcription-client';
import { analyzeVolumeForSession, proposeSnipsForSession } from '@web-whisper/volume-analyzer';
import { capBytesFromMb, loadSettings, saveSetting } from './settings';
import { isIsolationSettingsScreenshot, readScreenshotMode } from './screenshotMode';
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
  openSession: (id: string, autoPlay?: boolean) => void;
  goHome: () => void;
  deleteSessionById: (id: string) => Promise<void>;
  enforceCap: (opts?: { force?: boolean }) => Promise<void>;
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
  const toastId = useRef(0);
  const handleRef = useRef<CaptureHandle | null>(null);
  const recordingSessionIdRef = useRef<string | null>(null);
  const finishingRef = useRef(false);
  const abortRecordingRef = useRef<(() => Promise<void>) | null>(null);

  const capBytes = capBytesFromMb(settings.storageCapMb);

  const showToast = useCallback((text: string, tone: ToastTone = 'warning') => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, tone === 'success' ? 2000 : 5000);
  }, []);

  const refresh = useCallback(async () => {
    const listed = await sessionStore.listSessions({ limit: 100, offset: 0 });
    if (!listed.error) {
      setSessions((listed.sessions || []) as SessionRecord[]);
    }
    const stats = await sessionStore.getStorageStats();
    if (!stats.error) {
      setUsedBytes(stats.usedBytes || 0);
    }
  }, []);

  const lastEnforceAt = useRef(0);

  const enforceCap = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force && Date.now() - lastEnforceAt.current < 4000) return;
    lastEnforceAt.current = Date.now();
    const result = await sessionStore.enforceRetentionPolicy(capBytes);
    if (result.error) return;
    const purged = Array.isArray(result.purgedChunkIds) ? result.purgedChunkIds.length : 0;
    if (purged > 0 || result.deletedSessions > 0) {
      await refresh();
    }
  }, [capBytes, refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sessionStore.init({ databaseName: 'web-whisper-db' });
      if (cancelled) return;
      await sessionStore.reconcileDanglingSessions();
      if (cancelled) return;
      const loaded = loadSettings();
      setSettings(loaded);
      await refresh();
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
      if (!cancelled) setReady(true);
    })().catch((error) => {
      console.error(error);
      showToast('Storage unavailable. Check browser storage permissions.', 'error');
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  useEffect(() => {
    if (!ready) return;
    void enforceCap({ force: true });
  }, [ready, capBytes, enforceCap]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    try {
      if (key === 'groqApiKey') saveSetting('groqApiKey', String(value));
      if (key === 'storageCapMb') saveSetting('storageCapMb', Number(value));
      if (key === 'developerModeEnabled') saveSetting('developerModeEnabled', Boolean(value));
      if (key === 'onboardingDismissed') saveSetting('onboardingDismissed', Boolean(value));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'storage quota exceeded';
      showToast(`Failed to save settings: ${message}`, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (!ready) return;
    if (!isIsolationSettingsScreenshot(readScreenshotMode())) return;
    if (!settings.developerModeEnabled) {
      updateSetting('developerModeEnabled', true);
    }
    setSettingsOpen(true);
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
    void refresh();
  }, [refresh]);

  const openSession = useCallback((id: string, shouldAutoPlay = false) => {
    setSessionId(id);
    setAutoPlay(shouldAutoPlay);
    setScreen('session');
  }, []);

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
    await enforceCap({ force: true });
    const created = await sessionStore.createSession();
    if (created.error || !created.id) {
      showToast('Storage unavailable. Check browser storage permissions.', 'error');
      return;
    }
    try {
      const handle = await startCapture(created.id, captureStartOptions());
      handleRef.current = handle;
      recordingSessionIdRef.current = created.id;
      setCaptureHandle(handle);
      setRecordingSessionId(created.id);
      setChunkCount(0);
      setScreen('recording');
      handle.on('chunkEncoded', (event: { seq?: number }) => {
        setChunkCount((event.seq ?? 0) + 1);
        void enforceCap();
      });
      handle.on('captureError', (event: { reason?: string; details?: string }) => {
        if (event.reason === 'no_audio_received') {
          void finishCaptureRef.current?.('session');
          return;
        }
        if (event.reason === 'store_write_failed') {
          void enforceCap({ force: true });
          showToast('Storage write failed. Recording may be incomplete.', 'warning');
          return;
        }
        if (event.reason === 'encoding_failed') {
          showToast(`Recording failed: ${event.details || event.reason}`, 'error');
          void finishCaptureRef.current?.('home');
          return;
        }
        showToast(`Recording failed: ${event.details || event.reason}`, 'error');
      });
    } catch (error) {
      // Capture never started — no encoded audio to keep.
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
  }, [enforceCap, showToast]);

  const finishCapture = useCallback(
    async (navigate: 'session' | 'home' | 'none') => {
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
      let summary: { hasAudio?: boolean; sessionId?: string | null } = { hasAudio: false, sessionId: id };
      try {
        if (handle) {
          summary = await handle.stop();
        }
      } catch {
        // Abort/stop must never drop audio that already landed in IndexedDB.
      }
      handleRef.current = null;
      recordingSessionIdRef.current = null;
      setCaptureHandle(null);
      setRecordingSessionId(null);
      if (id) {
        await sessionStore.finalizeSession(id);
        if (navigate !== 'none') {
          void analyzeVolumeForSession(id)
            .then((analysis) => {
              if (analysis.success) return proposeSnipsForSession(id);
              return analysis;
            })
            .catch((error) => {
              console.warn('Post-recording analysis failed', error);
            });
          await enforceCap({ force: true });
        }
      }
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
    },
    [enforceCap, openSession, refresh, showToast]
  );

  const finishCaptureRef = useRef(finishCapture);
  finishCaptureRef.current = finishCapture;

  const stopRecording = useCallback(async () => {
    await finishCapture('session');
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
