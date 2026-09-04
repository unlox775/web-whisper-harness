import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { startCapture, CaptureError, type CaptureHandle } from '@web-whisper/capture-engine';
import { parseSessionArchive } from '@web-whisper/session-store';
import './App.css';
import { FIXTURE_PATTERNS, generateFixturePattern } from './fixtures';
import {
  analyzeChunksVolume,
  proposeSnipsFromProfile,
  computeAdaptiveQuietThresholdDb,
  DEFAULT_SNIP_OPTIONS,
  type ChunkWithBlob,
  type ChunkVolumeProfile,
  type Snip,
} from './volumeAnalyzer';
import VolumeHistogram from './VolumeHistogram';
import SnipList, { type SnipPlaybackStatus } from './SnipList';
import {
  VOLUME_ANALYZER_DEMO_DB,
  loadTunerSettings,
  saveTunerSettings,
} from './demoStore';
import {
  ARCHIVE_ERROR_NO_AUDIO,
  mapArchiveChunksToAnalyze,
  messageForArchiveParseError,
} from './archiveSource';
import {
  clampViewStart,
  clampWindowSeconds,
  defaultWindowSeconds,
  MIN_WINDOW_SECONDS,
  playheadSessionTime,
  sessionDurationFromProfile,
  viewStartToShowTime,
} from './histogramViewport';
import { assembleSnipWavBlob, SNIP_PLAY_ERROR } from './snipPlayback';

// Storage: live/fixture/archive chunks in RAM; tuner settings in isolated
// IndexedDB `web-whisper-volume-analyzer-demo-db` (see demoStore.ts). Must
// never open `web-whisper-db`. Archive parse uses session-store
// parseSessionArchive only — no zip/manifest reimplementation.

type DataMode = 'live' | 'fixture' | 'archive';

function App() {
  const [selectedPattern, setSelectedPattern] = useState(FIXTURE_PATTERNS[0].id);
  const [dataMode, setDataMode] = useState<DataMode>('live');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState('Idle — tap Start Capture and speak');
  const [archiveStatus, setArchiveStatus] = useState('Pick a session archive zip to analyze');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFileName, setArchiveFileName] = useState<string | null>(null);
  const captureHandleRef = useRef<CaptureHandle | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const liveCaptureEnabled = dataMode === 'live';

  const [quietThresholdDb, setQuietThresholdDb] = useState(-40);
  const [autoNoiseFloor, setAutoNoiseFloor] = useState(true);
  const [minSnipDuration, setMinSnipDuration] = useState(DEFAULT_SNIP_OPTIONS.minSnipDuration);
  const [maxSnipDuration, setMaxSnipDuration] = useState(DEFAULT_SNIP_OPTIONS.maxSnipDuration);
  const [minSilenceGapDuration, setMinSilenceGapDuration] = useState(
    DEFAULT_SNIP_OPTIONS.minSilenceGapDuration
  );

  const [chunks, setChunks] = useState<ChunkWithBlob[]>([]);
  const [volumeProfile, setVolumeProfile] = useState<ChunkVolumeProfile[] | null>(null);
  const [snips, setSnips] = useState<Snip[] | null>(null);
  const [computedFloorDb, setComputedFloorDb] = useState<number | null>(null);

  const [isComputing, setIsComputing] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);

  const [windowSeconds, setWindowSeconds] = useState(MIN_WINDOW_SECONDS);
  const [viewStart, setViewStart] = useState(0);
  const [zoomUserSet, setZoomUserSet] = useState(false);

  const [playheadTime, setPlayheadTime] = useState<number | null>(null);
  const [playbackSnipId, setPlaybackSnipId] = useState<number | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<SnipPlaybackStatus>('idle');
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const playingSnipRef = useRef<Snip | null>(null);

  const totalDuration = useMemo(
    () => (volumeProfile ? sessionDurationFromProfile(volumeProfile) : 0),
    [volumeProfile]
  );

  useEffect(() => {
    let cancelled = false;
    loadTunerSettings().then((saved) => {
      if (cancelled || !saved) {
        setSettingsReady(true);
        return;
      }
      setQuietThresholdDb(saved.quietThresholdDb);
      setAutoNoiseFloor(saved.autoNoiseFloor);
      setMinSnipDuration(saved.minSnipDuration);
      setMaxSnipDuration(saved.maxSnipDuration);
      setMinSilenceGapDuration(saved.minSilenceGapDuration);
      setSettingsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    void saveTunerSettings({
      quietThresholdDb,
      autoNoiseFloor,
      minSnipDuration,
      maxSnipDuration,
      minSilenceGapDuration,
    });
  }, [
    settingsReady,
    quietThresholdDb,
    autoNoiseFloor,
    minSnipDuration,
    maxSnipDuration,
    minSilenceGapDuration,
  ]);

  useEffect(() => {
    if (dataMode !== 'fixture') {
      return;
    }
    const pattern = FIXTURE_PATTERNS.find((p) => p.id === selectedPattern);
    if (pattern) {
      generateFixturePattern(pattern).then(setChunks);
    }
  }, [selectedPattern, dataMode]);

  useEffect(() => {
    return () => {
      const handle = captureHandleRef.current;
      captureHandleRef.current = null;
      if (handle) {
        void handle.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const hadProfileRef = useRef(false);
  useEffect(() => {
    if (!volumeProfile) {
      hadProfileRef.current = false;
      setWindowSeconds(MIN_WINDOW_SECONDS);
      setViewStart(0);
      return;
    }
    const firstProfile = !hadProfileRef.current;
    hadProfileRef.current = true;
    if (firstProfile && !zoomUserSet) {
      const next = defaultWindowSeconds(totalDuration);
      setWindowSeconds(next);
      setViewStart(0);
      return;
    }
    setWindowSeconds((current) => {
      const nextWindow = clampWindowSeconds(current, totalDuration);
      setViewStart((start) => clampViewStart(start, totalDuration, nextWindow));
      return nextWindow;
    });
  }, [volumeProfile, totalDuration, zoomUserSet]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const releaseAudio = useCallback(() => {
    stopRaf();
    playingSnipRef.current = null;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, [stopRaf]);

  const handleStopPlayback = useCallback(() => {
    releaseAudio();
    setPlayheadTime(null);
    setPlaybackSnipId(null);
    setPlaybackStatus('idle');
  }, [releaseAudio]);

  const startPlayheadLoop = useCallback(() => {
    stopRaf();
    const tick = () => {
      const audio = audioRef.current;
      const snip = playingSnipRef.current;
      if (!audio || !snip || audio.paused) {
        rafRef.current = null;
        return;
      }
      setPlayheadTime(playheadSessionTime(snip.startTime, audio.currentTime));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf]);

  const handlePausePlayback = useCallback(() => {
    const audio = audioRef.current;
    const snip = playingSnipRef.current;
    stopRaf();
    if (audio && !audio.paused) {
      audio.pause();
    }
    if (audio && snip) {
      setPlayheadTime(playheadSessionTime(snip.startTime, audio.currentTime));
    }
    setPlaybackStatus('paused');
  }, [stopRaf]);

  const attachAudioListeners = useCallback(
    (audio: HTMLAudioElement) => {
      const onEnded = () => {
        stopRaf();
        playingSnipRef.current = null;
        setPlayheadTime(null);
        setPlaybackSnipId(null);
        setPlaybackStatus('idle');
      };
      const onPause = () => {
        if (audio.ended) return;
        const current = playingSnipRef.current;
        if (!current) return;
        setPlayheadTime(playheadSessionTime(current.startTime, audio.currentTime));
      };
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('timeupdate', () => {
        const current = playingSnipRef.current;
        if (!current || audio.ended) return;
        setPlayheadTime(playheadSessionTime(current.startTime, audio.currentTime));
      });
    },
    [stopRaf]
  );

  const handlePlaySnip = useCallback(
    async (snip: Snip) => {
      if (!volumeProfile) return;
      const existing = audioRef.current;
      if (
        existing &&
        playingSnipRef.current?.snipId === snip.snipId &&
        playbackStatus === 'paused'
      ) {
        try {
          await existing.play();
          setPlaybackStatus('playing');
          startPlayheadLoop();
        } catch {
          setPlaybackError(SNIP_PLAY_ERROR);
          handleStopPlayback();
        }
        return;
      }

      handleStopPlayback();
      setPlaybackError(null);
      setPlaybackSnipId(snip.snipId);
      setPlaybackStatus('loading');
      playingSnipRef.current = snip;
      setPlayheadTime(snip.startTime);
      setViewStart((start) => {
        const shown = viewStartToShowTime(snip.startTime, totalDuration, windowSeconds);
        const alreadyVisible =
          snip.startTime >= start && snip.startTime <= start + windowSeconds;
        return alreadyVisible ? start : shown;
      });

      try {
        const blob = await assembleSnipWavBlob(chunks, volumeProfile, snip);
        if (!blob) {
          setPlaybackError(SNIP_PLAY_ERROR);
          handleStopPlayback();
          return;
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        attachAudioListeners(audio);
        await audio.play();
        setPlaybackStatus('playing');
        startPlayheadLoop();
      } catch {
        setPlaybackError(SNIP_PLAY_ERROR);
        handleStopPlayback();
      }
    },
    [
      volumeProfile,
      chunks,
      playbackStatus,
      totalDuration,
      windowSeconds,
      handleStopPlayback,
      startPlayheadLoop,
      attachAudioListeners,
    ]
  );

  const clearAnalysis = useCallback(() => {
    handleStopPlayback();
    setVolumeProfile(null);
    setSnips(null);
    setComputedFloorDb(null);
    setViewStart(0);
    setZoomUserSet(false);
    setPlaybackError(null);
  }, [handleStopPlayback]);

  const stopCaptureIfRunning = useCallback(async () => {
    const handle = captureHandleRef.current;
    captureHandleRef.current = null;
    setIsCapturing(false);
    if (handle) {
      try {
        await handle.stop();
      } catch {
        // already stopped
      }
    }
  }, []);

  const handleToggleLiveCapture = async (enabled: boolean) => {
    await stopCaptureIfRunning();
    clearAnalysis();
    setArchiveError(null);
    setArchiveFileName(null);
    if (enabled) {
      setDataMode('live');
      setChunks([]);
      setCaptureStatus('Idle — tap Start Capture and speak');
    } else {
      setDataMode('fixture');
    }
  };

  const handleArchiveUpload = async (file: File | undefined) => {
    if (!file) return;
    await stopCaptureIfRunning();
    clearAnalysis();
    setDataMode('archive');
    setArchiveFileName(file.name);
    setArchiveError(null);
    setChunks([]);
    setArchiveStatus('Reading archive…');
    try {
      const parsed = await parseSessionArchive(file);
      if (parsed.error) {
        const message = messageForArchiveParseError(parsed.error);
        setArchiveError(message);
        setArchiveStatus(message);
        return;
      }
      const mapped = mapArchiveChunksToAnalyze(parsed);
      if (mapped.length === 0) {
        setArchiveError(ARCHIVE_ERROR_NO_AUDIO);
        setArchiveStatus(ARCHIVE_ERROR_NO_AUDIO);
        return;
      }
      setChunks(mapped);
      const sessionId = parsed.session?.id ? `session ${parsed.session.id}` : 'session archive';
      const skipped = (parsed.chunks?.length ?? 0) - mapped.length;
      setArchiveStatus(
        `${mapped.length} playable chunk${mapped.length === 1 ? '' : 's'} from ${sessionId}` +
          (skipped > 0 ? ` (${skipped} purged skipped)` : '')
      );
    } catch {
      setArchiveError(messageForArchiveParseError('not_a_zip'));
      setArchiveStatus(messageForArchiveParseError('not_a_zip'));
    } finally {
      if (archiveInputRef.current) {
        archiveInputRef.current.value = '';
      }
    }
  };

  const handleStartCapture = async () => {
    await stopCaptureIfRunning();
    clearAnalysis();
    setChunks([]);
    setCaptureStatus('Requesting microphone…');
    try {
      const handle = await startCapture(`iso-volume-${Date.now()}`, {
        audioSource: 'live',
        chunkTargetDuration: 4.0,
        watchdogTimeout: 10.0,
        inMemory: true,
      });
      captureHandleRef.current = handle;
      handle.on('chunkEncoded', (data: {
        seq: number;
        startTime: number;
        endTime: number;
        duration: number;
        blob?: Blob;
      }) => {
        if (!data.blob) return;
        setChunks((prev) => [
          ...prev,
          {
            id: `live-chunk-${data.seq}`,
            seq: data.seq,
            startTime: data.startTime,
            endTime: data.endTime,
            duration: data.duration,
            blob: data.blob,
          },
        ]);
      });
      handle.on('captureError', (data: { reason?: string; details?: string }) => {
        setCaptureStatus(`Error: ${data.reason || 'capture_failed'}`);
        setIsCapturing(false);
      });
      handle.on('captureStopped', (data: { chunksWritten?: number; totalDuration?: number }) => {
        setIsCapturing(false);
        captureHandleRef.current = null;
        setCaptureStatus(
          `Stopped — ${data.chunksWritten ?? 0} chunks, ${(data.totalDuration ?? 0).toFixed(1)}s`
        );
      });
      setIsCapturing(true);
      setCaptureStatus('Recording… speak into the mic');
    } catch (error) {
      const code = error instanceof CaptureError ? error.code : '';
      setIsCapturing(false);
      captureHandleRef.current = null;
      if (code === 'permission_denied') {
        setCaptureStatus('Microphone permission denied');
        alert('Microphone permission denied. Allow access in browser settings.');
      } else {
        setCaptureStatus(`Failed to start: ${(error as Error).message || String(error)}`);
      }
    }
  };

  const handleStopCapture = async () => {
    setCaptureStatus('Stopping…');
    await stopCaptureIfRunning();
  };

  const snipOptions = useMemo(
    () => ({
      quietThreshold: autoNoiseFloor ? undefined : quietThresholdDb,
      minSnipDuration,
      maxSnipDuration,
      minSilenceGapDuration,
      targetSnipDuration: DEFAULT_SNIP_OPTIONS.targetSnipDuration,
    }),
    [autoNoiseFloor, quietThresholdDb, minSnipDuration, maxSnipDuration, minSilenceGapDuration]
  );

  const recomputeSnips = useCallback(
    (profiles: ChunkVolumeProfile[], chunkList: ChunkWithBlob[]) => {
      const allSamples = profiles.flatMap((profile) => Array.from(profile.samples));
      const adaptive = computeAdaptiveQuietThresholdDb(allSamples);
      setComputedFloorDb(adaptive);

      const chunkMetadata = chunkList.map((c) => ({
        id: c.id,
        seq: c.seq,
        startTime: c.startTime,
        endTime: c.endTime,
        duration: c.duration,
      }));

      const proposed = proposeSnipsFromProfile(profiles, chunkMetadata, {
        ...snipOptions,
        quietThreshold: autoNoiseFloor ? undefined : quietThresholdDb,
      });
      setSnips(proposed);
      return adaptive;
    },
    [autoNoiseFloor, quietThresholdDb, snipOptions]
  );

  const handleComputeVolume = useCallback(async () => {
    if (chunks.length === 0) {
      if (dataMode === 'archive') {
        setArchiveError(ARCHIVE_ERROR_NO_AUDIO);
        setArchiveStatus(ARCHIVE_ERROR_NO_AUDIO);
      }
      return;
    }

    setIsComputing(true);
    try {
      const profiles = await analyzeChunksVolume(chunks);
      setVolumeProfile(profiles);
      const adaptive = recomputeSnips(profiles, chunks);
      if (autoNoiseFloor) {
        setQuietThresholdDb(Math.round(adaptive));
      }
    } catch (error) {
      console.error('Volume computation failed:', error);
      alert('Failed to compute volume. Check console for details.');
    } finally {
      setIsComputing(false);
    }
  }, [chunks, recomputeSnips, autoNoiseFloor, dataMode]);

  useEffect(() => {
    if (volumeProfile) {
      recomputeSnips(volumeProfile, chunks);
    }
  }, [volumeProfile, chunks, recomputeSnips]);

  useEffect(() => {
    if (playbackSnipId === null || !snips) return;
    const stillThere = snips.some((snip) => snip.snipId === playbackSnipId);
    if (!stillThere) {
      handleStopPlayback();
    }
  }, [snips, playbackSnipId, handleStopPlayback]);

  const handleReset = () => {
    void stopCaptureIfRunning();
    handleStopPlayback();
    setVolumeProfile(null);
    setSnips(null);
    setComputedFloorDb(null);
    setAutoNoiseFloor(true);
    setMinSnipDuration(DEFAULT_SNIP_OPTIONS.minSnipDuration);
    setMaxSnipDuration(DEFAULT_SNIP_OPTIONS.maxSnipDuration);
    setMinSilenceGapDuration(DEFAULT_SNIP_OPTIONS.minSilenceGapDuration);
    setViewStart(0);
    setZoomUserSet(false);
    setPlaybackError(null);
    if (dataMode === 'live') {
      setChunks([]);
      setCaptureStatus('Idle — tap Start Capture and speak');
    }
  };

  const handleWindowChange = (next: number) => {
    setZoomUserSet(true);
    const clamped = clampWindowSeconds(next, totalDuration || next);
    setWindowSeconds(clamped);
    setViewStart((start) => clampViewStart(start, totalDuration, clamped));
  };

  const handleFitAll = () => {
    setZoomUserSet(true);
    const next = Math.max(MIN_WINDOW_SECONDS, totalDuration || MIN_WINDOW_SECONDS);
    setWindowSeconds(next);
    setViewStart(0);
  };

  const handleViewStartChange = (start: number) => {
    setZoomUserSet(true);
    setViewStart(clampViewStart(start, totalDuration, windowSeconds));
  };

  const effectiveThreshold = autoNoiseFloor ? (computedFloorDb ?? quietThresholdDb) : quietThresholdDb;
  const avgSnip =
    snips && snips.length > 0
      ? snips.reduce((sum, snip) => sum + snip.duration, 0) / snips.length
      : null;

  return (
    <div className="app">
      <header className="top-chrome">
        <h1>Volume Analyzer Isolation Demo</h1>
        <div
          className={`data-mode-chip${dataMode === 'live' ? ' live' : ''}${dataMode === 'archive' ? ' archive' : ''}`}
        >
          {dataMode === 'live'
            ? 'LIVE FROM CAPTURE (in-memory)'
            : dataMode === 'archive'
              ? 'SESSION ARCHIVE'
              : 'FIXTURE AUDIO'}
        </div>
        <div className="db-chip" title="Isolated from the PWA and other package demos">
          IDB {VOLUME_ANALYZER_DEMO_DB}
        </div>
        <div className="live-capture-toggle">
          <input
            type="checkbox"
            id="live-capture"
            checked={liveCaptureEnabled}
            disabled={isCapturing}
            onChange={(e) => {
              void handleToggleLiveCapture(e.target.checked);
            }}
          />
          <label htmlFor="live-capture">Live microphone</label>
        </div>
      </header>

      <main className="main-content">
        <aside className="control-panel">
          {dataMode === 'live' ? (
            <div className="control-section">
              <p className="hint">{captureStatus}</p>
              <p className="hint">
                {chunks.length} live chunk{chunks.length === 1 ? '' : 's'} in RAM
              </p>
              <button
                className="primary"
                type="button"
                onClick={() => void handleStartCapture()}
                disabled={isCapturing}
              >
                Start Capture
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void handleStopCapture()}
                disabled={!isCapturing}
              >
                Stop Capture
              </button>
            </div>
          ) : dataMode === 'archive' ? (
            <div className="control-section">
              <p className="hint">{archiveStatus}</p>
              {archiveFileName ? (
                <p className="hint archive-filename">{archiveFileName}</p>
              ) : null}
              <p className="hint">
                {chunks.length} archive chunk{chunks.length === 1 ? '' : 's'} in RAM
              </p>
              <button
                className="secondary"
                type="button"
                onClick={() => void handleToggleLiveCapture(false)}
              >
                Use fixture instead
              </button>
            </div>
          ) : (
            <div className="control-section">
              <label htmlFor="fixture-pattern">Fixture Pattern (optional)</label>
              <select
                id="fixture-pattern"
                value={selectedPattern}
                onChange={(e) => {
                  setSelectedPattern(e.target.value);
                  handleStopPlayback();
                  setVolumeProfile(null);
                  setSnips(null);
                  setComputedFloorDb(null);
                }}
              >
                {FIXTURE_PATTERNS.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name}
                  </option>
                ))}
              </select>
              <p className="hint">
                {FIXTURE_PATTERNS.find((p) => p.id === selectedPattern)?.description}
              </p>
            </div>
          )}

          <div className="control-section">
            <label htmlFor="session-archive">Upload session archive</label>
            <input
              ref={archiveInputRef}
              id="session-archive"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              disabled={isCapturing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleArchiveUpload(file);
              }}
            />
            <p className="hint">
              Spec-1 zip from session-store export. Parsed with parseSessionArchive; same Compute
              Volume path as live/fixture.
            </p>
            {archiveError ? <p className="error-banner">{archiveError}</p> : null}
          </div>

          <button
            className="primary"
            onClick={handleComputeVolume}
            disabled={isComputing || chunks.length === 0}
          >
            {isComputing ? 'Computing...' : volumeProfile ? 'Recompute Volume' : 'Compute Volume'}
          </button>

          <div className="control-section">
            <label htmlFor="noise-floor">
              Noise floor {autoNoiseFloor ? '(auto)' : '(manual)'}
            </label>
            <input
              type="range"
              id="noise-floor"
              min="-70"
              max="-20"
              step="1"
              value={Math.round(effectiveThreshold)}
              onChange={(e) => {
                setAutoNoiseFloor(false);
                setQuietThresholdDb(Number(e.target.value));
              }}
            />
            <div className="threshold-value">
              {effectiveThreshold.toFixed(0)} dB
              {autoNoiseFloor && computedFloorDb !== null ? ' · percentile floor' : ''}
            </div>
            <button
              type="button"
              className="linkish"
              onClick={() => setAutoNoiseFloor(true)}
              disabled={autoNoiseFloor}
            >
              Reset to auto noise floor
            </button>
          </div>

          <div className="control-section">
            <label htmlFor="min-snip">Min snip length</label>
            <input
              type="range"
              id="min-snip"
              min="1"
              max="20"
              step="0.5"
              value={minSnipDuration}
              onChange={(e) => setMinSnipDuration(Number(e.target.value))}
            />
            <div className="threshold-value">{minSnipDuration.toFixed(1)} s</div>
          </div>

          <div className="control-section">
            <label htmlFor="max-snip">Max snip length</label>
            <input
              type="range"
              id="max-snip"
              min="10"
              max="90"
              step="1"
              value={maxSnipDuration}
              onChange={(e) => setMaxSnipDuration(Number(e.target.value))}
            />
            <div className="threshold-value">{maxSnipDuration.toFixed(0)} s</div>
          </div>

          <div className="control-section">
            <label htmlFor="quiet-gap">Quiet-gap duration</label>
            <input
              type="range"
              id="quiet-gap"
              min="0.2"
              max="2.5"
              step="0.1"
              value={minSilenceGapDuration}
              onChange={(e) => setMinSilenceGapDuration(Number(e.target.value))}
            />
            <div className="threshold-value">{minSilenceGapDuration.toFixed(1)} s</div>
          </div>

          <div className="control-section">
            <label htmlFor="histogram-window">
              Window:{' '}
              {volumeProfile && windowSeconds >= totalDuration - 0.001
                ? 'all'
                : `${windowSeconds.toFixed(0)} seconds`}
            </label>
            <input
              type="range"
              id="histogram-window"
              min={MIN_WINDOW_SECONDS}
              max={Math.max(MIN_WINDOW_SECONDS, Math.ceil(totalDuration || MIN_WINDOW_SECONDS))}
              step="1"
              value={Math.round(windowSeconds)}
              disabled={!volumeProfile}
              onChange={(e) => handleWindowChange(Number(e.target.value))}
            />
            <div className="threshold-value">
              {volumeProfile
                ? `${windowSeconds.toFixed(0)}s visible · ${totalDuration.toFixed(1)}s total`
                : 'Compute volume to zoom'}
            </div>
            <button
              type="button"
              className="linkish"
              onClick={handleFitAll}
              disabled={!volumeProfile || windowSeconds >= totalDuration - 0.001}
            >
              Fit all
            </button>
            <p className="hint">
              Seconds visible across the histogram width. Zoom in, then pan the scrollbar under the
              waveform. Slider recomputes do not reset the pan.
            </p>
          </div>

          <p className="hint">
            Target snip {DEFAULT_SNIP_OPTIONS.targetSnipDuration}s (original). Sliders recompute snips
            live after volume is computed. Defaults copied from unlox775/web-whisper.
          </p>

          <button className="secondary" onClick={handleReset}>
            Reset
          </button>
        </aside>

        <section className="histogram-panel">
          <h2>Waveform + snip overlay (100ms peak dB)</h2>
          {playbackStatus !== 'idle' && playheadTime !== null ? (
            <p className="playhead-readout">
              Playhead {playheadTime.toFixed(2)}s
              {playbackStatus === 'paused' ? ' (paused)' : ''}
              {playbackSnipId !== null ? ` · snip ${playbackSnipId}` : ''}
            </p>
          ) : (
            <p className="playhead-readout muted">Playhead idle — play a snip to inspect the cut</p>
          )}
          {playbackError ? <p className="error-banner">{playbackError}</p> : null}
          <div className="histogram-container">
            {volumeProfile ? (
              <VolumeHistogram
                volumeProfile={volumeProfile}
                threshold={effectiveThreshold}
                snips={snips}
                viewStart={viewStart}
                windowSeconds={windowSeconds}
                playheadTime={playheadTime}
                onViewStartChange={handleViewStartChange}
                onSnipActivate={(snip) => {
                  void handlePlaySnip(snip);
                }}
              />
            ) : (
              <div className="histogram-placeholder">
                Click &quot;Compute Volume&quot; to generate profile
              </div>
            )}
          </div>
        </section>

        <aside className="snip-list-panel">
          <h2>Proposed Snips</h2>
          {avgSnip !== null && (
            <p className="snip-summary">
              {snips!.length} snip{snips!.length === 1 ? '' : 's'} · avg {avgSnip.toFixed(1)}s
              {avgSnip >= 5 ? ' (longer than 4–5 words)' : ''}
            </p>
          )}
          {snips !== null ? (
            <SnipList
              snips={snips}
              playbackSnipId={playbackSnipId}
              playbackStatus={playbackStatus}
              onPlay={(snip) => {
                void handlePlaySnip(snip);
              }}
              onPause={handlePausePlayback}
              onStop={handleStopPlayback}
            />
          ) : (
            <div className="snip-placeholder">
              Click &quot;Compute Volume&quot; — snips propose automatically
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
