import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { startCapture, CaptureError, type CaptureHandle } from '@web-whisper/capture-engine';
import { parseSessionArchive } from '@web-whisper/session-store';
import './App.css';
import {
  FIXTURE_PATTERNS,
  fixtureTickSpecs,
  generateFixtureTick,
  type FixtureTickSpec,
} from './fixtures';
import {
  analyzeChunksVolume,
  analyzeVolume,
  DEFAULT_SNIP_OPTIONS,
  flaggedBoundaryTimes,
  proposeSnips,
  proposeSnipsFromProfile,
  scanSnipBoundaries,
  type ChunkWithBlob,
  type ChunkVolumeProfile,
  type Snip,
} from './volumeAnalyzer';
import VolumeHistogram from './VolumeHistogram';
import SnipList, { type SnipPlaybackStatus } from './SnipList';
import BoundaryDoctorPanel from './BoundaryDoctorPanel';
import { BLT_FIXTURE_NOTE, BLT_LIVE_SNIPS, BLT_RECOMPUTED_SNIPS } from './bltBoundaryFixture';
import { BLT_REPLAY_FIXTURE_NOTE, buildBltReplayQueue } from './bltLiveReplayFixture';
import {
  commitArchiveReplayTrailing,
  emptyArchiveReplayState,
  replayArchiveLivePath,
  stepArchiveReplay,
  type ArchiveReplayState,
} from './archiveReplay';
import { VOLUME_ANALYZER_DEMO_DB, loadTunerSettings, saveTunerSettings } from './demoStore';
import { appDefaultTunerSettings, tunerMatchesAppDefaults } from './tunerDefaults';
import {
  ARCHIVE_ERROR_NO_AUDIO,
  archiveLiveRangesStatusNote,
  buildArchiveMetadataDump,
  buildArchiveReplayQueue,
  compactArchiveStatusLine,
  mapArchivedLiveSnips,
  messageForArchiveParseError,
  type ArchivedLiveSnip,
  type ArchiveMetadataDump,
  type ReplayQueueItem,
} from './archiveSource';
import ArchivedSnipList from './ArchivedSnipList';
import {
  clampViewStart,
  clampWindowSeconds,
  defaultWindowSeconds,
  MIN_WINDOW_SECONDS,
  playheadSessionTime,
  sessionDurationFromProfile,
  viewStartToShowTime,
} from './histogramViewport';
import { assembleSnipWavBlob, SNIP_PLAY_ERROR, snipExportFilename, triggerBlobDownload } from './snipPlayback';
import {
  formatFloorDb,
  runCommitTick,
  runLiveTick,
  sampleWindowLabel,
  sessionEndFromChunks,
  type DemoEvent,
  type FloorHistoryRow,
  type TickTelemetry,
} from './livePath';

type DataSource = 'fixture' | 'mic' | 'archive';
type CompareTarget = 'incremental' | 'batch';

const LIVE_DEFAULTS_LINE = `min ${DEFAULT_SNIP_OPTIONS.minSnipDuration}s · target ${DEFAULT_SNIP_OPTIONS.targetSnipDuration}s · max ${DEFAULT_SNIP_OPTIONS.maxSnipDuration}s · gap ${DEFAULT_SNIP_OPTIONS.minSilenceGapDuration}s · adaptive floor`;

function App() {
  const [source, setSource] = useState<DataSource>('fixture');
  const [selectedPattern, setSelectedPattern] = useState(FIXTURE_PATTERNS[0].id);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState('Idle — tap Start capture and speak');
  const [archiveStatus, setArchiveStatus] = useState('Upload a session archive zip to replay the live path');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFileName, setArchiveFileName] = useState<string | null>(null);
  const [archiveMeta, setArchiveMeta] = useState<ArchiveMetadataDump | null>(null);
  const [showArchiveMetadata, setShowArchiveMetadata] = useState(false);
  const [replayComplete, setReplayComplete] = useState(false);
  const [stoppedCommitted, setStoppedCommitted] = useState(false);
  const [batchRan, setBatchRan] = useState(false);
  const [clockReplay, setClockReplay] = useState(false);

  const captureHandleRef = useRef<CaptureHandle | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const clockTimerRef = useRef<number | null>(null);

  const [quietThresholdDb, setQuietThresholdDb] = useState(-40);
  const [autoNoiseFloor, setAutoNoiseFloor] = useState(true);
  const [minSnipDuration, setMinSnipDuration] = useState(DEFAULT_SNIP_OPTIONS.minSnipDuration);
  const [maxSnipDuration, setMaxSnipDuration] = useState(DEFAULT_SNIP_OPTIONS.maxSnipDuration);
  const [minSilenceGapDuration, setMinSilenceGapDuration] = useState(
    DEFAULT_SNIP_OPTIONS.minSilenceGapDuration
  );
  const [settingsReady, setSettingsReady] = useState(false);
  const [showDefaultsBanner, setShowDefaultsBanner] = useState(false);

  const [fixtureSpecs, setFixtureSpecs] = useState<FixtureTickSpec[]>(() =>
    fixtureTickSpecs(FIXTURE_PATTERNS[0])
  );
  const [archiveQueue, setArchiveQueue] = useState<ReplayQueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const queueIndexRef = useRef(0);

  const [chunks, setChunks] = useState<ChunkWithBlob[]>([]);
  const [volumeProfile, setVolumeProfile] = useState<ChunkVolumeProfile[] | null>(null);
  const [frozenSnips, setFrozenSnips] = useState<Snip[]>([]);
  const [trailing, setTrailing] = useState<Snip | null>(null);
  const [windowStartTime, setWindowStartTime] = useState(0);
  const [includeTrailing, setIncludeTrailing] = useState(false);
  const [adaptiveFloorDb, setAdaptiveFloorDb] = useState<number | null>(null);
  const [floorHistory, setFloorHistory] = useState<FloorHistoryRow[]>([]);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [telemetry, setTelemetry] = useState<TickTelemetry | null>(null);
  const [reason, setReason] = useState('');
  const [lastSeq, setLastSeq] = useState<number | null>(null);
  const [profileReused, setProfileReused] = useState(false);

  const [batchSnips, setBatchSnips] = useState<Snip[] | null>(null);
  const [archivedLiveSnips, setArchivedLiveSnips] = useState<ArchivedLiveSnip[] | null>(null);
  const [compareAgainst, setCompareAgainst] = useState<CompareTarget>('incremental');
  const [isBusy, setIsBusy] = useState(false);

  const [windowSeconds, setWindowSeconds] = useState(MIN_WINDOW_SECONDS);
  const [viewStart, setViewStart] = useState(0);
  const [zoomUserSet, setZoomUserSet] = useState(false);

  const [playheadTime, setPlayheadTime] = useState<number | null>(null);
  const [playbackSnipId, setPlaybackSnipId] = useState<number | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<SnipPlaybackStatus>('idle');
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playingTrailing, setPlayingTrailing] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const playingSnipRef = useRef<Snip | null>(null);

  const liveRef = useRef({
    profiles: [] as ChunkVolumeProfile[],
    chunks: [] as ChunkWithBlob[],
    frozen: [] as Snip[],
    floorHistory: [] as FloorHistoryRow[],
    profileReused: false,
    lastSeq: -1,
  });
  const archiveReplayRef = useRef<ArchiveReplayState>(emptyArchiveReplayState());

  const totalDuration = useMemo(
    () => (volumeProfile ? sessionDurationFromProfile(volumeProfile) : 0),
    [volumeProfile]
  );

  const queueLength =
    source === 'archive' ? archiveQueue.length : source === 'fixture' ? fixtureSpecs.length : 0;

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
    return () => {
      const handle = captureHandleRef.current;
      captureHandleRef.current = null;
      if (handle) void handle.stop().catch(() => {});
      if (clockTimerRef.current != null) window.clearInterval(clockTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
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
    hadProfileRef.current = true;
    if (!zoomUserSet) {
      setWindowSeconds(defaultWindowSeconds(totalDuration));
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
    setPlayingTrailing(false);
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
    if (audio && !audio.paused) audio.pause();
    if (audio && snip) setPlayheadTime(playheadSessionTime(snip.startTime, audio.currentTime));
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
        setPlayingTrailing(false);
      };
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('pause', () => {
        if (audio.ended) return;
        const current = playingSnipRef.current;
        if (!current) return;
        setPlayheadTime(playheadSessionTime(current.startTime, audio.currentTime));
      });
    },
    [stopRaf]
  );

  const handleExportSnip = useCallback(
    async (snip: Pick<Snip, 'startTime' | 'endTime'>, label: string) => {
      if (!volumeProfile) {
        setPlaybackError(SNIP_PLAY_ERROR);
        return;
      }
      setExportingKey(label);
      setPlaybackError(null);
      try {
        const blob = await assembleSnipWavBlob(chunks, volumeProfile, snip);
        if (!blob) {
          setPlaybackError(SNIP_PLAY_ERROR);
          return;
        }
        triggerBlobDownload(blob, snipExportFilename(label, snip.startTime, snip.endTime));
      } catch {
        setPlaybackError(SNIP_PLAY_ERROR);
      } finally {
        setExportingKey(null);
      }
    },
    [chunks, volumeProfile]
  );

  const handlePlaySnip = useCallback(
    async (snip: Snip, trailingPlay = false) => {
      if (!volumeProfile) return;
      const existing = audioRef.current;
      if (existing && playingSnipRef.current?.snipId === snip.snipId && playbackStatus === 'paused') {
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
      setPlayingTrailing(trailingPlay);
      setPlaybackStatus('loading');
      playingSnipRef.current = snip;
      setPlayheadTime(snip.startTime);
      setViewStart((start) => {
        const shown = viewStartToShowTime(snip.startTime, totalDuration, windowSeconds);
        const alreadyVisible = snip.startTime >= start && snip.startTime <= start + windowSeconds;
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

  const stopClock = useCallback(() => {
    if (clockTimerRef.current != null) {
      window.clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    }
    setClockReplay(false);
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

  const applyReplayState = useCallback((state: ArchiveReplayState, extras: DemoEvent[] = []) => {
    liveRef.current = {
      profiles: state.profiles,
      chunks: state.chunks,
      frozen: state.frozen,
      floorHistory: state.floorHistory,
      profileReused: state.profileReused,
      lastSeq: state.lastSeq,
    };
    setVolumeProfile(state.profiles.length > 0 ? state.profiles : null);
    setChunks(state.chunks);
    setFrozenSnips(state.frozen);
    setTrailing(state.trailing);
    setWindowStartTime(state.windowStartTime);
    setIncludeTrailing(state.includeTrailing);
    setAdaptiveFloorDb(state.adaptiveFloorDb);
    setFloorHistory(state.floorHistory);
    setEvents([...state.events, ...extras]);
    setTelemetry(state.telemetry);
    setReason(state.reason);
    setLastSeq(state.lastSeq < 0 ? null : state.lastSeq);
    setProfileReused(state.profileReused);
  }, []);

  const applyTickResult = useCallback(
    (
      result: Awaited<ReturnType<typeof runLiveTick>>,
      seq: number,
      extras: DemoEvent[] = []
    ) => {
      liveRef.current = {
        profiles: result.profiles,
        chunks: result.chunks,
        frozen: result.propose.allCommitted,
        floorHistory: [...liveRef.current.floorHistory, ...result.newFloorRows],
        profileReused: result.telemetry.profileReused || liveRef.current.profileReused,
        lastSeq: seq,
      };
      setVolumeProfile(result.profiles);
      setChunks(result.chunks);
      setFrozenSnips(result.propose.allCommitted);
      setTrailing(result.propose.trailing);
      setWindowStartTime(result.propose.windowStartTime);
      setIncludeTrailing(result.propose.includeTrailing);
      setAdaptiveFloorDb(result.propose.adaptiveFloorDb);
      setFloorHistory(liveRef.current.floorHistory);
      setEvents((prev) => [...prev, ...result.events, ...extras]);
      setTelemetry(result.telemetry);
      setReason(result.reason);
      setLastSeq(seq);
      setProfileReused(liveRef.current.profileReused);
    },
    []
  );

  const commitTrailingNow = useCallback(
    (markReplayComplete: boolean) => {
      const current = liveRef.current;
      if (current.profiles.length === 0) {
        setStoppedCommitted(true);
        if (markReplayComplete) setReplayComplete(true);
        return;
      }
      const result = runCommitTick({
        profiles: current.profiles,
        chunks: current.chunks,
        frozenSnips: current.frozen,
        lastSeq: current.lastSeq,
        profileReused: current.profileReused,
      });
      applyTickResult(result, current.lastSeq, markReplayComplete ? [{
        at: Date.now(),
        name: 'replayComplete',
        detail: { frozen: result.propose.allCommitted.length },
      }] : []);
      setStoppedCommitted(true);
      if (markReplayComplete) setReplayComplete(true);
    },
    [applyTickResult]
  );

  const ingestPreparedChunk = useCallback(
    async (
      chunk: ChunkWithBlob,
      storedProfile: ChunkVolumeProfile | null,
      playable: boolean
    ) => {
      const current = liveRef.current;
      const result = await runLiveTick({
        chunk,
        blob: playable ? chunk.blob : null,
        storedProfile,
        existingProfiles: current.profiles,
        existingChunks: current.chunks,
        frozenSnips: current.frozen,
        includeTrailing: false,
      });
      applyTickResult(result, chunk.seq);
    },
    [applyTickResult]
  );

  const stepFixtureOnce = useCallback(async (): Promise<boolean> => {
    const index = queueIndexRef.current;
    if (index >= fixtureSpecs.length) return false;
    const spec = fixtureSpecs[index];
    const chunk = await generateFixtureTick(spec);
    await ingestPreparedChunk(chunk, null, true);
    const nextIndex = index + 1;
    queueIndexRef.current = nextIndex;
    setQueueIndex(nextIndex);
    if (nextIndex >= fixtureSpecs.length) {
      commitTrailingNow(true);
    }
    return nextIndex < fixtureSpecs.length;
  }, [fixtureSpecs, ingestPreparedChunk, commitTrailingNow]);

  const stepArchiveOnce = useCallback(async (): Promise<boolean> => {
    const index = queueIndexRef.current;
    if (index >= archiveQueue.length) return false;
    const item = archiveQueue[index];
    const isLast = index === archiveQueue.length - 1;
    let next = await stepArchiveReplay(archiveReplayRef.current, item, isLast);
    if (isLast && next.trailing && !next.includeTrailing) {
      next = commitArchiveReplayTrailing(next);
    }
    archiveReplayRef.current = next;
    applyReplayState(
      next,
      isLast
        ? [{ at: Date.now(), name: 'replayComplete', detail: { frozen: next.frozen.length } }]
        : []
    );
    if (isLast) {
      setStoppedCommitted(true);
      setReplayComplete(true);
    }
    const nextIndex = index + 1;
    queueIndexRef.current = nextIndex;
    setQueueIndex(nextIndex);
    return nextIndex < archiveQueue.length;
  }, [archiveQueue, applyReplayState]);

  const handleStepNext = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (source === 'fixture') await stepFixtureOnce();
      else if (source === 'archive') await stepArchiveOnce();
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, source, stepFixtureOnce, stepArchiveOnce]);

  const handleReplayRemaining = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    stopClock();
    try {
      if (source === 'fixture') {
        while (queueIndexRef.current < fixtureSpecs.length) {
          const more = await stepFixtureOnce();
          if (!more) break;
        }
      } else if (source === 'archive') {
        const remaining = archiveQueue.slice(queueIndexRef.current);
        if (remaining.length > 0) {
          const next = await replayArchiveLivePath(remaining, archiveReplayRef.current);
          archiveReplayRef.current = next;
          applyReplayState(next, [
            { at: Date.now(), name: 'replayComplete', detail: { frozen: next.frozen.length } },
          ]);
          queueIndexRef.current = archiveQueue.length;
          setQueueIndex(archiveQueue.length);
          setStoppedCommitted(true);
          setReplayComplete(true);
        }
      }
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, source, stepFixtureOnce, applyReplayState, fixtureSpecs.length, archiveQueue, stopClock]);

  const handleReplayClock = useCallback(() => {
    if (clockReplay) {
      stopClock();
      return;
    }
    setClockReplay(true);
    clockTimerRef.current = window.setInterval(() => {
      void (async () => {
        const more = source === 'archive' ? await stepArchiveOnce() : await stepFixtureOnce();
        if (!more) stopClock();
      })();
    }, 4000);
  }, [clockReplay, source, stepArchiveOnce, stepFixtureOnce, stopClock]);

  const resetSessionCore = useCallback(() => {
    stopClock();
    handleStopPlayback();
    liveRef.current = {
      profiles: [],
      chunks: [],
      frozen: [],
      floorHistory: [],
      profileReused: false,
      lastSeq: -1,
    };
    archiveReplayRef.current = emptyArchiveReplayState();
    setChunks([]);
    setVolumeProfile(null);
    setFrozenSnips([]);
    setTrailing(null);
    setWindowStartTime(0);
    setIncludeTrailing(false);
    setAdaptiveFloorDb(null);
    setFloorHistory([]);
    setEvents([]);
    setTelemetry(null);
    setReason('');
    setLastSeq(null);
    setProfileReused(false);
    setBatchSnips(null);
    setBatchRan(false);
    setCompareAgainst('incremental');
    queueIndexRef.current = 0;
    setQueueIndex(0);
    setReplayComplete(false);
    setStoppedCommitted(false);
    setViewStart(0);
    setZoomUserSet(false);
    setPlaybackError(null);
  }, [handleStopPlayback, stopClock]);

  const handleResetSession = useCallback(() => {
    void stopCaptureIfRunning();
    resetSessionCore();
    if (source === 'mic') {
      setCaptureStatus('Idle — tap Start capture and speak');
    }
  }, [resetSessionCore, source, stopCaptureIfRunning]);

  const handleSourceChange = async (next: DataSource) => {
    await stopCaptureIfRunning();
    resetSessionCore();
    setArchiveError(null);
    setShowDefaultsBanner(false);
    if (next !== 'archive') {
      setArchiveFileName(null);
      setArchiveQueue([]);
      setArchivedLiveSnips(null);
      setArchiveMeta(null);
      setShowArchiveMetadata(false);
      setArchiveStatus('Upload a session archive zip to replay the live path');
    }
    setSource(next);
  };

  const handlePatternChange = (id: string) => {
    const pattern = FIXTURE_PATTERNS.find((item) => item.id === id) ?? FIXTURE_PATTERNS[0];
    setSelectedPattern(pattern.id);
    setFixtureSpecs(fixtureTickSpecs(pattern));
    resetSessionCore();
  };

  const handleArchiveUpload = async (file: File | undefined) => {
    if (!file) return;
    await stopCaptureIfRunning();
    resetSessionCore();
    setSource('archive');
    setArchiveFileName(file.name);
    setArchiveError(null);
    setArchivedLiveSnips(null);
    setArchiveMeta(null);
    setShowArchiveMetadata(false);
    setArchiveStatus('Reading archive…');
    try {
      const parsed = await parseSessionArchive(file);
      if (parsed.error) {
        const message = messageForArchiveParseError(parsed.error);
        setArchiveError(message);
        setArchiveStatus(message);
        return;
      }
      const queue = buildArchiveReplayQueue(parsed);
      const live = mapArchivedLiveSnips(parsed);
      setArchivedLiveSnips(live.length > 0 ? live : null);
      setArchiveQueue(queue.items);
      const dump = buildArchiveMetadataDump({
        fileName: file.name,
        parsed,
        queue: queue.items,
        liveCount: live.length,
      });
      setArchiveMeta(dump);
      setShowArchiveMetadata(false);
      const liveNote = archiveLiveRangesStatusNote(parsed, live.length);
      if (queue.items.length === 0) {
        setArchiveError(ARCHIVE_ERROR_NO_AUDIO);
        setArchiveStatus(`${ARCHIVE_ERROR_NO_AUDIO}` + (liveNote ? ` · ${liveNote}` : ''));
        return;
      }
      setArchiveStatus(
        `${queue.statusLine} · 0 of ${queue.items.length} chunks replayed` +
          (liveNote ? ` · ${liveNote}` : '')
      );
    } catch {
      setArchiveError(messageForArchiveParseError('not_a_zip'));
      setArchiveStatus(messageForArchiveParseError('not_a_zip'));
    } finally {
      if (archiveInputRef.current) archiveInputRef.current.value = '';
    }
  };

  const ingestLiveChunk = useCallback(
    async (data: {
      seq: number;
      startTime: number;
      endTime: number;
      duration: number;
      blob?: Blob;
    }) => {
      if (!data.blob) return;
      const chunk: ChunkWithBlob = {
        id: `live-chunk-${data.seq}`,
        seq: data.seq,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        blob: data.blob,
      };
      await ingestPreparedChunk(chunk, null, true);
    },
    [ingestPreparedChunk]
  );

  const handleStartCapture = async () => {
    await stopCaptureIfRunning();
    resetSessionCore();
    setSource('mic');
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
        void ingestLiveChunk(data);
      });
      handle.on('captureError', (data: { reason?: string }) => {
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
    commitTrailingNow(false);
  };

  const handleStopReplayEarly = () => {
    stopClock();
    if (source === 'archive') {
      const next = commitArchiveReplayTrailing(archiveReplayRef.current);
      archiveReplayRef.current = next;
      applyReplayState(next, [
        { at: Date.now(), name: 'replayComplete', detail: { frozen: next.frozen.length } },
      ]);
      setStoppedCommitted(true);
      setReplayComplete(true);
      return;
    }
    commitTrailingNow(true);
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

  const handleResetToAppDefaults = useCallback(() => {
    const next = appDefaultTunerSettings(quietThresholdDb);
    setAutoNoiseFloor(next.autoNoiseFloor);
    setMinSnipDuration(next.minSnipDuration);
    setMaxSnipDuration(next.maxSnipDuration);
    setMinSilenceGapDuration(next.minSilenceGapDuration);
    void saveTunerSettings(next);
    setShowDefaultsBanner(false);
  }, [quietThresholdDb]);

  const handleBatchCompute = async () => {
    setIsBusy(true);
    try {
      let working = chunks;
      if (source === 'fixture' && working.length < fixtureSpecs.length) {
        const generated: ChunkWithBlob[] = [];
        for (const spec of fixtureSpecs) {
          generated.push(await generateFixtureTick(spec));
        }
        working = generated;
        setChunks(working);
      } else if (source === 'archive' && working.length === 0 && archiveQueue.length > 0) {
        const storedAll = archiveQueue
          .map((item) => item.storedProfile)
          .filter((row): row is ChunkVolumeProfile => row != null);
        if (storedAll.length === archiveQueue.length) {
          setVolumeProfile(storedAll);
          const named = await analyzeVolume(
            archiveQueue
              .filter((item) => item.playable && item.blob)
              .map((item) => ({ ...item.chunk, blob: item.blob as Blob }))
          );
          void named;
          return;
        }
        working = archiveQueue
          .filter((item) => item.playable && item.blob)
          .map((item) => ({ ...item.chunk, blob: item.blob as Blob }));
        setChunks(working);
      }
      if (working.length === 0) {
        if (source === 'archive') {
          setArchiveError(ARCHIVE_ERROR_NO_AUDIO);
        }
        return;
      }
      const profiles = await analyzeChunksVolume(working);
      void (await analyzeVolume(working));
      setVolumeProfile(profiles);
    } finally {
      setIsBusy(false);
    }
  };

  const handleBatchPropose = () => {
    if (!volumeProfile || volumeProfile.length === 0) return;
    const proposed = proposeSnipsFromProfile(volumeProfile, chunks, snipOptions);
    void proposeSnips(chunks, volumeProfile, snipOptions);
    setBatchSnips(proposed);
    setBatchRan(true);
    if (
      source === 'archive' &&
      !tunerMatchesAppDefaults({
        autoNoiseFloor,
        minSnipDuration,
        maxSnipDuration,
        minSilenceGapDuration,
      })
    ) {
      setShowDefaultsBanner(true);
    }
  };

  useEffect(() => {
    if (batchRan && volumeProfile) {
      const proposed = proposeSnipsFromProfile(volumeProfile, chunks, snipOptions);
      setBatchSnips(proposed);
    }
  }, [batchRan, volumeProfile, chunks, snipOptions]);

  const handleLoadBltFixture = () => {
    void stopCaptureIfRunning();
    resetSessionCore();
    setSource('archive');
    setArchiveFileName('blt-boundary-fixture');
    setArchiveStatus(BLT_FIXTURE_NOTE);
    setArchiveQueue([]);
    setArchivedLiveSnips(BLT_LIVE_SNIPS);
    setBatchSnips(BLT_RECOMPUTED_SNIPS);
    setShowArchiveMetadata(false);
    setArchiveMeta({
      fileName: 'blt-boundary-fixture',
      notes: BLT_FIXTURE_NOTE,
      profileMode: 'missing',
      profileLine: BLT_FIXTURE_NOTE,
      queueCount: 0,
      playableCount: 0,
      profileOnlyCount: 0,
      liveArchivedCount: BLT_LIVE_SNIPS.length,
      chunkRows: [],
    });
  };

  const handleLoadBltReplayFixture = async () => {
    await stopCaptureIfRunning();
    resetSessionCore();
    const { items, profiles, liveSnips } = buildBltReplayQueue();
    setSource('archive');
    setArchiveFileName('blt-13-snip-replay-fixture');
    setArchiveQueue(items);
    setArchivedLiveSnips(liveSnips);
    setShowArchiveMetadata(false);
    setArchiveMeta({
      fileName: 'blt-13-snip-replay-fixture',
      notes: BLT_REPLAY_FIXTURE_NOTE,
      sessionId: 'ses_1788550979475_fixture',
      sessionDuration: 207,
      sessionChunkCount: items.length,
      hasSnips: true,
      hasTranscript: true,
      hasVolumeProfile: true,
      profileMode: 'used',
      profileLine: `volume-profile.json used (${profiles.length} chunk profiles, samples present)`,
      queueCount: items.length,
      playableCount: items.length,
      profileOnlyCount: 0,
      liveArchivedCount: liveSnips.length,
      chunkRows: items.map((item) => ({
        seq: item.seq,
        id: item.chunk.id,
        startTime: item.chunk.startTime,
        endTime: item.chunk.endTime,
        playable: item.playable,
        hasSamples: item.storedProfile != null,
      })),
    });
    setArchiveStatus(
      `volume-profile.json used (${profiles.length} chunk profiles, samples present) · 0 of ${items.length} chunks replayed · Live (archived): ${liveSnips.length} snips`
    );
  };

  const handleLoadSyntheticArchive = async () => {
    await stopCaptureIfRunning();
    resetSessionCore();
    setIsBusy(true);
    try {
      const pattern = FIXTURE_PATTERNS[0];
      const specs = fixtureTickSpecs(pattern);
      const generated: ChunkWithBlob[] = [];
      let profiles: ChunkVolumeProfile[] = [];
      let frozen: Snip[] = [];
      for (let i = 0; i < specs.length; i++) {
        const chunk = await generateFixtureTick(specs[i]);
        generated.push(chunk);
        const result = await runLiveTick({
          chunk,
          blob: chunk.blob,
          existingProfiles: profiles,
          existingChunks: generated.slice(0, -1),
          frozenSnips: frozen,
          includeTrailing: false,
        });
        profiles = result.profiles;
        frozen = result.propose.allCommitted;
      }
      const committed = runCommitTick({
        profiles,
        chunks: generated,
        frozenSnips: frozen,
        lastSeq: specs.length - 1,
        profileReused: false,
      });
      frozen = committed.propose.allCommitted;
      const queue: ReplayQueueItem[] = generated.map((chunk, index) => ({
        seq: chunk.seq,
        chunk,
        blob: chunk.blob,
        storedProfile: profiles[index] ?? null,
        playable: true,
      }));
      setSource('archive');
      setArchiveFileName('synthetic-debug-archive');
      setArchiveQueue(queue);
      setArchivedLiveSnips(
        frozen.map((snip, index) => ({
          id: `live-${index}`,
          startTime: snip.startTime,
          endTime: snip.endTime,
          duration: snip.duration,
          chunkIds: snip.chunkRefs,
          startChunkIndex: snip.startChunkIndex,
          endChunkIndex: snip.endChunkIndex,
          confidence: snip.confidence,
          text: `Synthetic live cut ${index}`,
        }))
      );
      setShowArchiveMetadata(false);
      setArchiveMeta({
        fileName: 'synthetic-debug-archive',
        notes: 'Synthetic incremental run encoded as a debug archive (samples + live ranges).',
        sessionId: 'synthetic-debug-archive',
        sessionDuration: profiles.reduce((sum, row) => sum + row.samples.length * 0.1, 0),
        sessionChunkCount: profiles.length,
        hasSnips: true,
        hasTranscript: false,
        hasVolumeProfile: true,
        profileMode: 'used',
        profileLine: `volume-profile.json used (${profiles.length} chunk profiles, samples present)`,
        queueCount: queue.length,
        playableCount: queue.length,
        profileOnlyCount: 0,
        liveArchivedCount: frozen.length,
        chunkRows: queue.map((item) => ({
          seq: item.seq,
          id: item.chunk.id,
          startTime: item.chunk.startTime,
          endTime: item.chunk.endTime,
          playable: item.playable,
          hasSamples: item.storedProfile != null,
        })),
      });
      setArchiveStatus(
        `volume-profile.json used (${profiles.length} chunk profiles, samples present) · 0 of ${queue.length} chunks replayed · Live (archived): ${frozen.length} snips`
      );
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (playbackSnipId === null) return;
    const stillThere =
      frozenSnips.some((snip) => snip.snipId === playbackSnipId) ||
      (trailing && trailing.snipId === playbackSnipId);
    if (!stillThere) handleStopPlayback();
  }, [frozenSnips, trailing, playbackSnipId, handleStopPlayback]);

  const matchesAppDefaults = tunerMatchesAppDefaults({
    autoNoiseFloor,
    minSnipDuration,
    maxSnipDuration,
    minSilenceGapDuration,
  });

  useEffect(() => {
    if (matchesAppDefaults) setShowDefaultsBanner(false);
  }, [matchesAppDefaults]);

  const liveScan = useMemo(
    () =>
      archivedLiveSnips && archivedLiveSnips.length > 0
        ? scanSnipBoundaries(archivedLiveSnips, archivedLiveSnips.map((snip) => snip.text))
        : null,
    [archivedLiveSnips]
  );

  const incrementalScan = useMemo(
    () => (frozenSnips.length > 0 ? scanSnipBoundaries(frozenSnips) : null),
    [frozenSnips]
  );
  const batchScan = useMemo(
    () => (batchSnips && batchSnips.length > 0 ? scanSnipBoundaries(batchSnips) : null),
    [batchSnips]
  );
  const doctorRecomputed = compareAgainst === 'batch' && batchScan ? batchScan : incrementalScan;

  const histogramFlags = useMemo(() => {
    const flags = [];
    if (liveScan) flags.push(...flaggedBoundaryTimes(liveScan));
    if (doctorRecomputed) flags.push(...flaggedBoundaryTimes(doctorRecomputed));
    return flags;
  }, [liveScan, doctorRecomputed]);

  const showDoctor = liveScan != null || incrementalScan != null || batchScan != null;

  const pathChip = batchRan
    ? 'OFFLINE BATCH — NOT LIVE PATH'
    : source === 'archive' && (archiveQueue.length > 0 || archivedLiveSnips)
      ? 'LIVE PATH · ARCHIVE REPLAY'
      : source === 'mic'
        ? 'LIVE PATH · MIC'
        : 'LIVE PATH';

  const replayState = (() => {
    if (isCapturing) return 'Recording (includeTrailing: false)';
    if (replayComplete) return 'Replay complete — trailing committed.';
    if (stoppedCommitted) return 'Stopped (trailing committed)';
    if (queueLength > 0 && queueIndex > 0 && queueIndex < queueLength) {
      return `Replay paused at chunk ${queueIndex} of ${queueLength}`;
    }
    return 'Idle';
  })();

  const sessionEnd = chunks.length > 0 ? sessionEndFromChunks(chunks) : totalDuration;
  const floorWindow =
    adaptiveFloorDb != null && sessionEnd > windowStartTime
      ? { startTime: windowStartTime, endTime: sessionEnd, db: adaptiveFloorDb }
      : null;
  const historicalFloors = floorHistory.map((row) => ({
    startTime: row.windowStart,
    endTime: row.closedAt,
    db: row.floorDb ?? adaptiveFloorDb ?? -40,
  }));

  const frozenFloors = frozenSnips.map((snip) => {
    const row = floorHistory.find(
      (item) => Math.abs(item.closedAt - snip.endTime) < 0.05
    );
    return row?.floorDb ?? null;
  });

  const stepDisabled =
    isBusy ||
    isCapturing ||
    (source === 'fixture' && queueIndex >= fixtureSpecs.length) ||
    (source === 'archive' && (archiveQueue.length === 0 || queueIndex >= archiveQueue.length)) ||
    source === 'mic';

  const archiveStatusWithQueue =
    source === 'archive' && archiveQueue.length > 0 && !archiveError
      ? archiveStatus.replace(/\d+ of \d+ chunks replayed/, `${queueIndex} of ${archiveQueue.length} chunks replayed`)
      : archiveStatus;

  return (
    <div className="app">
      <header className="top-chrome">
        <div className="chrome-row">
          <h1>Volume Analyzer Isolation Demo</h1>
          <div
            className={`data-mode-chip${pathChip.startsWith('LIVE') ? ' live' : ' batch'}${
              pathChip.includes('ARCHIVE') ? ' archive' : ''
            }`}
          >
            {pathChip}
          </div>
          <div className="replay-state">{replayState}</div>
        </div>
        <p className="chrome-subline">
          Same path as PWA ingestGrowingSession: analyze volume → incremental propose. Frozen snips
          stay frozen. Adaptive floor is per window.
        </p>
      </header>

      <main className="main-content">
        <aside className="control-panel">
          <h2>Inputs</h2>
          <div className="control-section source-radios" role="radiogroup" aria-label="Data source">
            <label>
              <input
                type="radio"
                name="source"
                checked={source === 'fixture'}
                disabled={isCapturing}
                onChange={() => void handleSourceChange('fixture')}
              />
              Fixture step
            </label>
            <label>
              <input
                type="radio"
                name="source"
                checked={source === 'mic'}
                disabled={isCapturing}
                onChange={() => void handleSourceChange('mic')}
              />
              Live microphone
            </label>
            <label>
              <input
                type="radio"
                name="source"
                checked={source === 'archive'}
                disabled={isCapturing}
                onChange={() => void handleSourceChange('archive')}
              />
              Session archive replay
            </label>
          </div>

          {source === 'fixture' ? (
            <div className="control-section">
              <label htmlFor="fixture-pattern">Fixture pattern</label>
              <select
                id="fixture-pattern"
                value={selectedPattern}
                onChange={(e) => handlePatternChange(e.target.value)}
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
              <p className="hint">
                {queueIndex} of {fixtureSpecs.length} chunks replayed
              </p>
            </div>
          ) : null}

          {source === 'mic' ? (
            <div className="control-section">
              <p className="hint">{captureStatus}</p>
              <button className="primary" type="button" onClick={() => void handleStartCapture()} disabled={isCapturing}>
                Start capture
              </button>
              <button className="secondary" type="button" onClick={() => void handleStopCapture()} disabled={!isCapturing}>
                Stop capture
              </button>
            </div>
          ) : null}

          {source === 'archive' ? (
            <div className="control-section">
              <p className="hint archive-status-line">
                {archiveMeta
                  ? compactArchiveStatusLine(archiveMeta)
                  : archiveStatusWithQueue}
              </p>
              {archiveMeta && archiveQueue.length > 0 && !archiveError ? (
                <p className="hint">
                  {queueIndex} of {archiveQueue.length} chunks replayed
                </p>
              ) : null}
              {archiveMeta ? (
                <label className="metadata-toggle">
                  <input
                    type="checkbox"
                    checked={showArchiveMetadata}
                    onChange={(e) => setShowArchiveMetadata(e.target.checked)}
                  />
                  Show archive metadata
                </label>
              ) : null}
              {showArchiveMetadata && archiveMeta ? (
                <div className="archive-metadata" aria-label="Archive metadata">
                  {archiveFileName ? <p className="hint archive-filename">{archiveFileName}</p> : null}
                  <p className="hint">{archiveStatusWithQueue}</p>
                  <dl>
                    <div><dt>formatVersion</dt><dd>{archiveMeta.formatVersion ?? '—'}</dd></div>
                    <div><dt>exportedAt</dt><dd>{archiveMeta.exportedAt ?? '—'}</dd></div>
                    <div><dt>session</dt><dd>{archiveMeta.sessionId ?? '—'}</dd></div>
                    <div>
                      <dt>duration</dt>
                      <dd>{archiveMeta.sessionDuration != null ? `${archiveMeta.sessionDuration}s` : '—'}</dd>
                    </div>
                    <div>
                      <dt>flags</dt>
                      <dd>
                        hasSnips={String(archiveMeta.hasSnips ?? false)} · hasTranscript=
                        {String(archiveMeta.hasTranscript ?? false)} · hasVolumeProfile=
                        {String(archiveMeta.hasVolumeProfile ?? false)}
                      </dd>
                    </div>
                    <div><dt>profile</dt><dd>{archiveMeta.profileLine}</dd></div>
                    <div>
                      <dt>chunks</dt>
                      <dd>
                        queue {archiveMeta.queueCount} · playable {archiveMeta.playableCount} ·
                        profile-only {archiveMeta.profileOnlyCount}
                      </dd>
                    </div>
                    {archiveMeta.notes ? (
                      <div><dt>notes</dt><dd>{archiveMeta.notes}</dd></div>
                    ) : null}
                  </dl>
                  {archiveMeta.chunkRows.length > 0 ? (
                    <ol className="archive-chunk-rows">
                      {archiveMeta.chunkRows.map((row) => (
                        <li key={`${row.seq}-${row.id}`}>
                          seq {row.seq} · {row.id} · {row.startTime.toFixed(1)}–{row.endTime.toFixed(1)}s
                          {row.playable ? '' : ' · purged'}
                          {row.hasSamples ? ' · samples' : ''}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {source !== 'mic' ? (
            <div className="control-section">
              <button className="primary" type="button" disabled={stepDisabled} onClick={() => void handleStepNext()}>
                Step next chunk
              </button>
              <button
                className="secondary"
                type="button"
                disabled={stepDisabled}
                onClick={() => void handleReplayRemaining()}
              >
                Replay remaining
              </button>
              <button
                className="secondary"
                type="button"
                disabled={stepDisabled && !clockReplay}
                onClick={handleReplayClock}
              >
                {clockReplay ? 'Stop 4s clock' : 'Replay remaining (4s clock)'}
              </button>
              {source === 'archive' && queueIndex > 0 && !replayComplete ? (
                <button className="secondary" type="button" onClick={handleStopReplayEarly}>
                  Stop replay early
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="control-section">
            <label htmlFor="session-archive">Upload session archive</label>
            <input
              ref={archiveInputRef}
              id="session-archive"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              disabled={isCapturing}
              onChange={(e) => void handleArchiveUpload(e.target.files?.[0])}
            />
            <button type="button" className="secondary" onClick={() => void handleLoadSyntheticArchive()}>
              Load synthetic debug archive
            </button>
            <button type="button" className="secondary" onClick={handleLoadBltFixture}>
              Load BLT diagnosis fixture
            </button>
            <button type="button" className="secondary" onClick={() => void handleLoadBltReplayFixture()}>
              Load BLT 13-snip replay fixture
            </button>
            <p className="hint">
              Synthetic archive has volume-profile samples + live ranges from an incremental run.
              BLT diagnosis fixture is doctor-only (no audio). BLT 13-snip replay fixture is
              Dave’s cut times (including #7 92.9–103.4) with growing samples.
            </p>
            {archiveError ? <p className="error-banner">{archiveError}</p> : null}
          </div>

          <section className="window-card" aria-label="Current window">
            <h3>Current window</h3>
            <dl>
              <div><dt>chunk seq</dt><dd>{lastSeq == null ? '—' : lastSeq}</dd></div>
              <div><dt>session t</dt><dd>{sessionEnd > 0 ? `0.0s → ${sessionEnd.toFixed(1)}s` : '—'}</dd></div>
              <div><dt>windowStartTime</dt><dd>{lastSeq == null ? '—' : `${windowStartTime.toFixed(1)}s`}</dd></div>
              <div><dt>includeTrailing</dt><dd>{lastSeq == null ? '—' : String(includeTrailing)}</dd></div>
              <div>
                <dt>adaptive floor</dt>
                <dd>
                  {adaptiveFloorDb == null
                    ? '—'
                    : `${formatFloorDb(adaptiveFloorDb)} · window ${sampleWindowLabel(windowStartTime, sessionEnd)}`}
                  <span className="floor-note">Per-window floor — not a global slider.</span>
                </dd>
              </div>
              <div><dt>frozen</dt><dd>{frozenSnips.length}</dd></div>
              <div>
                <dt>trailing</dt>
                <dd>
                  {trailing
                    ? `held ${trailing.startTime.toFixed(1)}–${trailing.endTime.toFixed(1)}s`
                    : 'none'}
                </dd>
              </div>
              <div>
                <dt>profile</dt>
                <dd>{profileReused ? 'volume-profile.json samples reused' : lastSeq == null ? '—' : 'decoded this session'}</dd>
              </div>
            </dl>
          </section>

          <p className="defaults-line">{LIVE_DEFAULTS_LINE}</p>
          <p className="hint inspector">
            Live tick: <code>analyzeVolumeForSession</code> / <code>analyzeVolumeIncremental</code> then{' '}
            <code>proposeSnipsForSession</code> / <code>proposeSnipsIncremental</code>. Kernel:{' '}
            <code>proposeSnipsFromProfile</code> + <code>computeAdaptiveQuietThresholdDb</code>.
          </p>

          <button className="secondary" type="button" onClick={handleResetSession}>
            Reset session
          </button>
          <p className="hint">
            Clears in-memory chunks, profile, frozen snips, trailing, floor history, playhead. Does not
            open Offline batch.
          </p>

          <details className="offline-batch">
            <summary>Offline batch (not the live path)</summary>
            <div className="batch-banner" role="status">
              <p>
                <strong>Not the live path.</strong> The PWA does <strong>not</strong> record this way.
                This panel batch-runs <code>proposeSnipsFromProfile</code> over the <strong>entire</strong>{' '}
                volume profile with one global adaptive floor (and optional aggressiveness sliders). Use it
                only to explore the kernel. Live path (left / default) is how production records:{' '}
                <code>analyzeVolumeForSession</code> + <code>proposeSnipsForSession</code> per chunk, frozen
                snips, <code>windowStartTime = lastEnd</code>.
              </p>
            </div>
            {batchRan && batchSnips ? (
              <p className="count-compare">
                Incremental live path: {frozenSnips.length} · Offline batch: {batchSnips.length}
                {frozenSnips.length !== batchSnips.length
                  ? ' — counts may differ (Dave’s case: live 13 vs batch 11).'
                  : ''}
              </p>
            ) : null}
            {showDefaultsBanner ? (
              <div className="defaults-banner" role="status">
                <p>
                  Saved Isolation Demo sliders differ from the PWA / DEFAULT_SNIP_OPTIONS, so batch snips
                  will not match live Session Detail cuts.
                </p>
                <button type="button" className="primary" onClick={handleResetToAppDefaults}>
                  Reset to app defaults
                </button>
                <button type="button" className="linkish" onClick={() => setShowDefaultsBanner(false)}>
                  Keep current sliders
                </button>
              </div>
            ) : null}
            <label htmlFor="noise-floor">
              Noise floor {autoNoiseFloor ? '(auto)' : '(manual)'}
            </label>
            <input
              type="range"
              id="noise-floor"
              min="-70"
              max="-20"
              step="1"
              value={Math.round(autoNoiseFloor ? (adaptiveFloorDb ?? quietThresholdDb) : quietThresholdDb)}
              onChange={(e) => {
                setAutoNoiseFloor(false);
                setQuietThresholdDb(Number(e.target.value));
              }}
            />
            <button type="button" className="linkish" onClick={() => setAutoNoiseFloor(true)} disabled={autoNoiseFloor}>
              Reset to auto noise floor
            </button>
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
            <button
              type="button"
              className="secondary"
              onClick={handleResetToAppDefaults}
              disabled={matchesAppDefaults}
            >
              Reset to app defaults
            </button>
            <button className="secondary" type="button" disabled={isBusy} onClick={() => void handleBatchCompute()}>
              Compute Volume
            </button>
            <button className="primary" type="button" disabled={!volumeProfile} onClick={handleBatchPropose}>
              Batch propose
            </button>
            <p className="hint">
              Compute Volume / Batch propose call <code>analyzeChunksVolume</code> / <code>analyzeVolume</code>{' '}
              and <code>proposeSnipsFromProfile</code> / <code>proposeSnips</code> on the whole session.
              Tuner persists in IDB {VOLUME_ANALYZER_DEMO_DB}. Does not wipe archive or frozen snips.
            </p>
          </details>
        </aside>

        <section className="histogram-panel">
          <h2>Volume profile (100ms peak dB) · reason</h2>
          {playbackStatus !== 'idle' && playheadTime !== null ? (
            <p className="playhead-readout">
              Playhead {playheadTime.toFixed(2)}s
              {playbackStatus === 'paused' ? ' (paused)' : ''}
              {playingTrailing ? ' · trailing (not committed)' : ''}
              {playbackSnipId !== null && !playingTrailing ? ` · snip ${playbackSnipId}` : ''}
            </p>
          ) : (
            <p className="playhead-readout muted">Playhead idle — play a frozen snip to inspect the cut</p>
          )}
          {playbackError ? <p className="error-banner">{playbackError}</p> : null}
          {archivedLiveSnips && archivedLiveSnips.length > 0 ? (
            <p className="overlay-legend">
              <span className="overlay-legend-live">Live (archived)</span> amber dashed ·{' '}
              <span className="overlay-legend-recomputed">Incremental frozen</span> cyan fill · trailing
              hatched. Rose dashed = contiguous-repeat; purple = time-overlap.
            </p>
          ) : null}
          <div className="histogram-container">
            {volumeProfile ? (
              <VolumeHistogram
                volumeProfile={volumeProfile}
                threshold={adaptiveFloorDb ?? -40}
                snips={frozenSnips}
                trailing={includeTrailing ? null : trailing}
                floorWindow={floorWindow}
                historicalFloors={historicalFloors}
                archivedSnips={archivedLiveSnips}
                flaggedBoundaryTimes={histogramFlags}
                viewStart={viewStart}
                windowSeconds={windowSeconds}
                playheadTime={playheadTime}
                onViewStartChange={(start) => {
                  setZoomUserSet(true);
                  setViewStart(clampViewStart(start, totalDuration, windowSeconds));
                }}
                onSnipActivate={(snip) => {
                  void handlePlaySnip(snip);
                }}
              />
            ) : (
              <div className="histogram-placeholder">
                Step a chunk, start capture, or upload an archive to replay the live path.
              </div>
            )}
          </div>
          <p className="reason-strip">{reason || 'No ticks yet.'}</p>
          <div className="control-section zoom-row">
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
              onChange={(e) => {
                setZoomUserSet(true);
                const next = clampWindowSeconds(Number(e.target.value), totalDuration || Number(e.target.value));
                setWindowSeconds(next);
                setViewStart((start) => clampViewStart(start, totalDuration, next));
              }}
            />
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setZoomUserSet(true);
                setWindowSeconds(Math.max(MIN_WINDOW_SECONDS, totalDuration || MIN_WINDOW_SECONDS));
                setViewStart(0);
              }}
              disabled={!volumeProfile || windowSeconds >= totalDuration - 0.001}
            >
              Fit all
            </button>
            <p className="hint">
              Drag the waveform to pan (mouse or touch). Scrollbar still works.
            </p>
          </div>
        </section>

        <aside className="snip-list-panel">
          {archivedLiveSnips && archivedLiveSnips.length > 0 ? (
            <div
              className={`count-match-banner${
                frozenSnips.length === archivedLiveSnips.length ? ' match' : ' fail'
              }`}
              role="status"
              aria-live="polite"
            >
              Frozen {frozenSnips.length} · Live archived {archivedLiveSnips.length}
              {frozenSnips.length === archivedLiveSnips.length
                ? ' — MATCH'
                : ' — FAIL count mismatch'}
            </div>
          ) : null}
          <h2>Frozen snips</h2>
          {frozenSnips.length === 0 ? (
            <p className="snip-placeholder">
              No frozen snips yet — live path holds the trailing region until a quiet-gap cut or Stop.
            </p>
          ) : (
            <SnipList
              snips={frozenSnips}
              floors={frozenFloors}
              playbackSnipId={playingTrailing ? null : playbackSnipId}
              playbackStatus={playingTrailing ? 'idle' : playbackStatus}
              exportEnabled={chunks.some((chunk) => chunk.blob && chunk.blob.size > 0)}
              exportingKey={exportingKey}
              onPlay={(snip) => void handlePlaySnip(snip)}
              onPause={handlePausePlayback}
              onStop={handleStopPlayback}
              onExport={(snip, label) => void handleExportSnip(snip, label)}
            />
          )}

          <section className="trailing-callout">
            <h2>Trailing (held)</h2>
            {trailing && !includeTrailing ? (
              <>
                <p>
                  {trailing.startTime.toFixed(1)}s – {trailing.endTime.toFixed(1)}s ·{' '}
                  {trailing.duration.toFixed(1)}s · includeTrailing: false
                </p>
                <button type="button" className="snip-play-btn" onClick={() => void handlePlaySnip(trailing, true)}>
                  Play trailing (not committed)
                </button>
              </>
            ) : (
              <p className="hint">
                {stoppedCommitted || replayComplete
                  ? 'No trailing region (committed on Stop).'
                  : 'none'}
              </p>
            )}
          </section>

          {showDoctor ? (
            <>
              {batchRan ? (
                <div className="compare-toggle">
                  <span>Compare against:</span>
                  <label>
                    <input
                      type="radio"
                      name="compare"
                      checked={compareAgainst === 'incremental'}
                      onChange={() => setCompareAgainst('incremental')}
                    />
                    Incremental live path
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="compare"
                      checked={compareAgainst === 'batch'}
                      onChange={() => setCompareAgainst('batch')}
                    />
                    Offline batch
                  </label>
                </div>
              ) : null}
              <BoundaryDoctorPanel
                liveScan={liveScan}
                recomputedScan={doctorRecomputed}
                recomputedTitle={
                  compareAgainst === 'batch' && batchRan ? 'Offline batch' : 'Incremental live path'
                }
                compareNote="Default compare is incremental frozen vs Live (archived), not offline batch."
              />
            </>
          ) : null}

          {archivedLiveSnips && archivedLiveSnips.length > 0 ? (
            <section className="archived-live-section">
              <h2>Live (archived)</h2>
              <p className="snip-summary archived">
                {archivedLiveSnips.length} live cuts from the zip — compare to Frozen snips after
                incremental replay.
              </p>
              <ArchivedSnipList
                snips={archivedLiveSnips}
                exportEnabled={chunks.some((chunk) => chunk.blob && chunk.blob.size > 0)}
                exportingKey={exportingKey}
                onExport={(snip, label) => void handleExportSnip(snip, label)}
              />
            </section>
          ) : null}

          {batchSnips ? (
            <section className="batch-snips">
              <h2>Offline batch snips</h2>
              <p className="hint">Not the live path. Frozen snips above are unchanged.</p>
              <SnipList
                snips={batchSnips}
                playbackSnipId={null}
                playbackStatus="idle"
                emptyMessage="Offline batch proposed no snips"
                exportEnabled={chunks.some((chunk) => chunk.blob && chunk.blob.size > 0)}
                exportingKey={exportingKey}
                onPlay={(snip) => void handlePlaySnip(snip)}
                onPause={handlePausePlayback}
                onStop={handleStopPlayback}
                onExport={(snip, label) => void handleExportSnip(snip, `batch-${label}`)}
              />
            </section>
          ) : null}

          <section className="floor-history">
            <h2>Floor history</h2>
            {floorHistory.length === 0 ? (
              <p className="hint">Grows when a snip closes (or on Stop commit).</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>snip #</th>
                    <th>closed at t</th>
                    <th>windowStart</th>
                    <th>window samples</th>
                    <th>floor dB</th>
                    <th>includeTrailing</th>
                  </tr>
                </thead>
                <tbody>
                  {floorHistory.map((row) => (
                    <tr key={`${row.snipId}-${row.closedAt}`}>
                      <td>{row.snipId}</td>
                      <td>{row.closedAt.toFixed(1)}</td>
                      <td>{row.windowStart.toFixed(1)}</td>
                      <td>{row.windowSamples}</td>
                      <td>{formatFloorDb(row.floorDb)}</td>
                      <td>{String(row.includeTrailing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <details className="events-telemetry">
            <summary>Events / telemetry</summary>
            {telemetry ? (
              <ul className="telemetry">
                <li>analyze {telemetry.analyzeMs.toFixed(1)}ms · propose {telemetry.proposeMs.toFixed(1)}ms</li>
                <li>floor {formatFloorDb(telemetry.floorDb)} · windowStart {telemetry.windowStartTime.toFixed(1)}s</li>
                <li>window samples {telemetry.windowSampleCount} · gaps in window: {telemetry.gapCount}</li>
                <li>
                  {telemetry.profileReused ? 'profileReused' : 'newChunksDecoded'} · decoded{' '}
                  {telemetry.newChunksDecoded}
                </li>
                <li>{telemetry.analyzeFn}</li>
                <li>{telemetry.proposeFn}</li>
                <li>{telemetry.volumeFn}</li>
                {telemetry.error ? <li className="error-banner">{telemetry.error}</li> : null}
              </ul>
            ) : (
              <p className="hint">Telemetry appears after the first tick.</p>
            )}
            <ol className="event-feed">
              {events.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <strong>{event.name}</strong>{' '}
                  {Object.entries(event.detail)
                    .map(([key, value]) => `${key}=${String(value)}`)
                    .join(' ')}
                </li>
              ))}
            </ol>
          </details>
        </aside>
      </main>
    </div>
  );
}

export default App;
