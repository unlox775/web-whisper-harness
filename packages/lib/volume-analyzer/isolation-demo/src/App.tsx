import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { startCapture, CaptureError, type CaptureHandle } from '@web-whisper/capture-engine';
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
import SnipList from './SnipList';
import {
  VOLUME_ANALYZER_DEMO_DB,
  loadTunerSettings,
  saveTunerSettings,
} from './demoStore';

// Storage: live/fixture chunks in RAM; tuner settings in isolated IndexedDB
// `web-whisper-volume-analyzer-demo-db` (see demoStore.ts). Must never open
// `web-whisper-db`. Live capture uses capture-engine inMemory mode.

function App() {
  const [selectedPattern, setSelectedPattern] = useState(FIXTURE_PATTERNS[0].id);
  const [liveCaptureEnabled, setLiveCaptureEnabled] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState('Idle — tap Start Capture and speak');
  const captureHandleRef = useRef<CaptureHandle | null>(null);

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
    if (liveCaptureEnabled) {
      return;
    }
    const pattern = FIXTURE_PATTERNS.find((p) => p.id === selectedPattern);
    if (pattern) {
      generateFixturePattern(pattern).then(setChunks);
    }
  }, [selectedPattern, liveCaptureEnabled]);

  useEffect(() => {
    return () => {
      const handle = captureHandleRef.current;
      captureHandleRef.current = null;
      if (handle) {
        void handle.stop().catch(() => {});
      }
    };
  }, []);

  const clearAnalysis = useCallback(() => {
    setVolumeProfile(null);
    setSnips(null);
    setComputedFloorDb(null);
  }, []);

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
    setLiveCaptureEnabled(enabled);
    clearAnalysis();
    if (enabled) {
      setChunks([]);
      setCaptureStatus('Idle — tap Start Capture and speak');
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
    if (chunks.length === 0) return;

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
  }, [chunks, recomputeSnips, autoNoiseFloor]);

  useEffect(() => {
    if (volumeProfile) {
      recomputeSnips(volumeProfile, chunks);
    }
  }, [volumeProfile, chunks, recomputeSnips]);

  const handleReset = () => {
    void stopCaptureIfRunning();
    setVolumeProfile(null);
    setSnips(null);
    setComputedFloorDb(null);
    setAutoNoiseFloor(true);
    setMinSnipDuration(DEFAULT_SNIP_OPTIONS.minSnipDuration);
    setMaxSnipDuration(DEFAULT_SNIP_OPTIONS.maxSnipDuration);
    setMinSilenceGapDuration(DEFAULT_SNIP_OPTIONS.minSilenceGapDuration);
    if (liveCaptureEnabled) {
      setChunks([]);
      setCaptureStatus('Idle — tap Start Capture and speak');
    }
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
        <div className={`data-mode-chip ${liveCaptureEnabled ? 'live' : ''}`}>
          {liveCaptureEnabled ? 'LIVE FROM CAPTURE (in-memory)' : 'FIXTURE AUDIO'}
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
          {liveCaptureEnabled ? (
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
          ) : (
            <div className="control-section">
              <label htmlFor="fixture-pattern">Fixture Pattern (optional)</label>
              <select
                id="fixture-pattern"
                value={selectedPattern}
                onChange={(e) => {
                  setSelectedPattern(e.target.value);
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
          <div className="histogram-container">
            {volumeProfile ? (
              <VolumeHistogram
                volumeProfile={volumeProfile}
                threshold={effectiveThreshold}
                snips={snips}
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
            <SnipList snips={snips} />
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
