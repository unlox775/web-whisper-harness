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
  openSession: (id: string, autoPlay?: boolean) => void;
  goHome: () => void;
  deleteSessionById: (id: string) => Promise<void>;
  enforceCap: () => Promise<void>;
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

  const enforceCap = useCallback(async () => {
    const result = await sessionStore.enforceRetentionPolicy(capBytes);
    if (result.error) return;
    if (result.deletedSessions > 0) {
      showToast(
        `Storage quota exceeded. Old sessions were deleted to make space.`,
        'warning'
      );
      await refresh();
    }
  }, [capBytes, refresh, showToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sessionStore.init({ databaseName: 'web-whisper-db' });
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
    const created = await sessionStore.createSession();
    if (created.error || !created.id) {
      showToast('Storage unavailable. Check browser storage permissions.', 'error');
      return;
    }
    try {
      const handle = await startCapture(created.id);
      handleRef.current = handle;
      setCaptureHandle(handle);
      setRecordingSessionId(created.id);
      setChunkCount(0);
      setScreen('recording');
      handle.on('chunkEncoded', (event: { seq?: number }) => {
        setChunkCount((event.seq ?? 0) + 1);
      });
      handle.on('captureError', (event: { reason?: string; details?: string }) => {
        if (event.reason === 'no_audio_received') {
          setCaptureHandle(null);
          handleRef.current = null;
          openSession(created.id);
          return;
        }
        if (event.reason === 'store_write_failed') {
          showToast('Storage write failed. Recording may be incomplete.', 'warning');
          return;
        }
        showToast(`Recording failed: ${event.details || event.reason}`, 'error');
      });
    } catch (error) {
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
  }, [openSession, showToast]);

  const stopRecording = useCallback(async () => {
    const handle = handleRef.current;
    const id = recordingSessionId;
    try {
      const summary = handle ? await handle.stop() : { hasAudio: false, sessionId: id };
      handleRef.current = null;
      setCaptureHandle(null);
      setRecordingSessionId(null);
      if (id) {
        void analyzeVolumeForSession(id)
          .then((analysis) => {
            if (analysis.success) return proposeSnipsForSession(id);
            return analysis;
          })
          .catch((error) => {
            console.warn('Post-recording analysis failed', error);
          });
        await enforceCap();
        openSession(id);
        if (summary && 'hasAudio' in summary && summary.hasAudio === false) {
          showToast('This session has no playable audio.', 'warning');
        }
      } else {
        goHome();
      }
    } catch {
      handleRef.current = null;
      setCaptureHandle(null);
      if (id) openSession(id);
      else goHome();
    }
  }, [enforceCap, goHome, openSession, recordingSessionId, showToast]);

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
