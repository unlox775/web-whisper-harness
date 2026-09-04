import { useEffect, useRef, useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { playChunk, playSession, playSnip, type PlaybackHandle } from '@web-whisper/playback-engine';
import { formatBytes, formatDuration, formatCapturedRange, formatDurationHeroStyle, jsonReplacer } from '../format';
import { runDoctor, type DoctorReport } from '../doctor';
import { transcribeSession, type TranscribeProgress } from '../orchestration';
import { useApp } from '../context';
import type { ChunkRecord, SessionRecord, SnipRecord, TranscriptRecord } from '../types';
import { VolumeHistogram } from '../components/VolumeHistogram';
import { buildTranscriptText, previewSnipTranscriptText } from '../transcriptText';
import {
  isSessionSnipsScreenshot,
  isSessionTranscribedScreenshot,
  readScreenshotMode,
  sessionTranscribedPreview,
} from '../screenshotMode';

function isErrorResult(value: PlaybackHandle | { error: string }): value is { error: string } {
  return 'error' in value;
}

function playbackFailMessage(error: string): string {
  if (error === 'audio_purged') return 'Audio removed after transcription';
  if (error === 'chunks_missing') return 'Session has no playable audio.';
  return `Playback failed: ${error}`;
}

type DetailTab = 'transcript' | 'debug';

export function SessionDetailScreen() {
  const app = useApp();
  const screenshotMode = readScreenshotMode();
  const screenshotPreview =
    isSessionTranscribedScreenshot(screenshotMode) || isSessionSnipsScreenshot(screenshotMode)
      ? sessionTranscribedPreview()
      : null;
  const sessionId = screenshotPreview?.session.id ?? app.sessionId!;
  const [session, setSession] = useState<SessionRecord | null>(screenshotPreview?.session ?? null);
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
  const [snips, setSnips] = useState<SnipRecord[]>(screenshotPreview?.snips ?? []);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>(
    screenshotPreview?.transcripts ?? []
  );
  const [volumeProfile, setVolumeProfile] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(screenshotPreview?.session.duration ?? 0);
  const [volume, setVolume] = useState(1);
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [failures, setFailures] = useState<Array<{ snipId: string; error: string }>>([]);
  const [detailTab, setDetailTab] = useState<DetailTab>(
    isSessionSnipsScreenshot(screenshotMode) ? 'debug' : 'transcript'
  );
  const [snipsTab, setSnipsTab] = useState<'chunks' | 'snips'>('snips');
  const [showHistogram, setShowHistogram] = useState(false);
  const [showDoctor, setShowDoctor] = useState(false);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [doctorJson, setDoctorJson] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const handleRef = useRef<PlaybackHandle | null>(null);
  const [hasPlayback, setHasPlayback] = useState(false);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const selectTokenRef = useRef(0);

  async function load() {
    const next = await sessionStore.getSession(sessionId);
    setSession(next as SessionRecord | null);
    const chunkList = await sessionStore.getChunksForSession(sessionId);
    setChunks((chunkList.chunks || []) as ChunkRecord[]);
    const snipList = await sessionStore.getSnipsForSession(sessionId);
    setSnips((snipList.snips || []) as SnipRecord[]);
    const transcriptList = await sessionStore.getTranscriptsForSession(sessionId);
    setTranscripts((transcriptList.transcripts || []) as TranscriptRecord[]);
    setVolumeProfile(await sessionStore.getVolumeProfile(sessionId));
  }

  useEffect(() => {
    if (screenshotPreview) return undefined;
    void load();
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
      setHasPlayback(false);
    };
  }, [sessionId]);

  useEffect(() => {
    if (app.autoPlay && session && session.chunkCount > 0) {
      void startPlayback();
    }
  }, [app.autoPlay, session?.id]);

  const transcriptText =
    screenshotPreview?.transcriptText ?? buildTranscriptText(snips, transcripts);

  useEffect(() => {
    if (detailTab !== 'transcript' || !transcriptText) return;
    const el = transcriptRef.current;
    if (!el) return;
    const token = ++selectTokenRef.current;
    const selectAll = () => {
      if (selectTokenRef.current !== token || !transcriptRef.current) return;
      const target = transcriptRef.current;
      target.focus({ preventScroll: true });
      target.select();
      try {
        target.setSelectionRange(0, target.value.length);
      } catch {
        /* some browsers reject setSelectionRange on empty/readonly edge cases */
      }
    };
    requestAnimationFrame(selectAll);
    const timer = window.setTimeout(selectAll, 50);
    return () => window.clearTimeout(timer);
  }, [detailTab, transcriptText, sessionId]);

  function bindHandle(handle: PlaybackHandle) {
    handleRef.current?.stop();
    handleRef.current = handle;
    setHasPlayback(true);
    setPlaying(true);
    setDuration(handle.duration || session?.duration || 0);
    handle.setVolume(volume);
    handle.on('timeupdate', (event: { currentTime: number }) => {
      setCurrentTime(event.currentTime);
      if (handle.duration) setDuration(handle.duration);
    });
    handle.on('paused', () => setPlaying(false));
    handle.on('playing', (event: { duration?: number }) => {
      setPlaying(true);
      if (event.duration) setDuration(event.duration);
    });
    handle.on('ended', () => {
      setPlaying(false);
      setCurrentTime(handle.duration || duration);
    });
    handle.on('playbackError', (event: { reason?: string }) => {
      app.showToast(`Playback failed: ${event.reason || 'audio error'}`, 'error');
      setPlaying(false);
    });
  }

  async function startPlayback() {
    const result = await playSession(sessionId);
    if (isErrorResult(result)) {
      app.showToast(playbackFailMessage(result.error), 'error');
      return;
    }
    bindHandle(result);
  }

  async function togglePlay() {
    const handle = handleRef.current;
    if (!handle) {
      await startPlayback();
      return;
    }
    if (playing) handle.pause();
    else handle.resume();
  }

  function handleVolumeChange(level: number) {
    setVolume(level);
    const handle = handleRef.current;
    if (handle) {
      handle.setVolume(level);
    }
  }

  async function copyTranscript() {
    if (!transcriptText) return;
    const el = transcriptRef.current;
    if (el) {
      el.focus({ preventScroll: true });
      el.select();
      try {
        el.setSelectionRange(0, el.value.length);
      } catch {
        /* ignore */
      }
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(transcriptText);
        setCopyStatus('copied');
        app.showToast('Copied', 'success');
        window.setTimeout(() => setCopyStatus('idle'), 2000);
        return;
      }
      throw new Error('clipboard_unavailable');
    } catch {
      setCopyStatus('failed');
      app.showToast('Select text and use Copy from the system menu', 'warning');
      window.setTimeout(() => setCopyStatus('idle'), 2500);
    }
  }

  async function runTranscription(retryFailedOnly = false) {
    if (!app.settings.groqApiKey || !app.settings.keyValid) return;
    setTranscribing(true);
    setProgress({ phase: 'analyzing', completed: 0, total: 0 });
    try {
      const outcome = await transcribeSession(
        sessionId,
        app.settings.groqApiKey,
        setProgress,
        { retryFailedOnly, onTranscriptWritten: () => app.enforceCap({ force: true }) }
      );
      setFailures(outcome.failures);
      if (outcome.empty) {
        app.showToast('No speech detected. Transcription skipped.', 'warning');
      } else if (outcome.stopReason) {
        app.showToast(`Transcription failed: ${outcome.stopReason}`, 'error');
      } else if (outcome.failed > 0) {
        app.showToast(
          `Transcription failed: ${outcome.failed} snip${outcome.failed === 1 ? '' : 's'} failed`,
          'warning'
        );
      }
      await load();
      await app.refresh();
    } catch (error) {
      app.showToast(
        `Transcription failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error'
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function assembleSnipBlob(snip: SnipRecord): Promise<Blob> {
    const blobs: Blob[] = [];
    for (const chunkId of snip.chunkIds || []) {
      const chunk = await sessionStore.getChunk(chunkId);
      if (chunk?.blob && chunk.blob.size > 0) blobs.push(chunk.blob);
    }
    return new Blob(blobs, { type: 'audio/mpeg' });
  }

  async function retrySnip(snipId: string) {
    if (!app.settings.groqApiKey || !app.settings.keyValid) return;
    const snip = snips.find((s) => s.id === snipId);
    if (!snip) return;

    try {
      const blob = await assembleSnipBlob(snip);
      if (!blob.size) {
        app.showToast(
          snip.audioPurgedAt ? 'Audio removed after transcription' : 'Snip audio not found',
          'error'
        );
        return;
      }
      const { transcribeAudio } = await import('@web-whisper/transcription-client');
      const result = await transcribeAudio(blob, { apiKey: app.settings.groqApiKey, mode: 'live' });
      if ('error' in result && result.error) {
        const existingFailure = failures.find((f) => f.snipId === snipId);
        if (!existingFailure) {
          setFailures((prev) => [...prev, { snipId, error: result.error }]);
        }
        const message = result.error === 'Rate limit exceeded'
          ? 'Rate limit reached. Try again later.'
          : `Transcription failed: ${result.error}`;
        app.showToast(message, 'error');
        return;
      }
      await sessionStore.writeTranscript(snipId, 'text' in result ? result.text || '' : '');
      setFailures((prev) => prev.filter((f) => f.snipId !== snipId));
      await app.enforceCap({ force: true });
      await load();
      app.showToast('Transcription complete', 'success');
    } catch (error) {
      app.showToast(`Retry failed: ${error instanceof Error ? error.message : 'unknown error'}`, 'error');
    }
  }

  async function downloadSnip(snipId: string) {
    const snip = snips.find((s) => s.id === snipId);
    if (!snip) {
      app.showToast('Snip audio not found', 'error');
      return;
    }
    const blob = await assembleSnipBlob(snip);
    if (!blob.size) {
      app.showToast(
        snip.audioPurgedAt ? 'Audio removed after transcription' : 'Snip audio not found',
        'error'
      );
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snip-${snipId}.mp3`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadChunk(chunkId: string) {
    const blob = await sessionStore.getChunk(chunkId);
    if (!blob?.blob || blob.blob.size <= 0) {
      app.showToast(
        blob?.audioPurgedAt ? 'Audio removed after transcription' : 'Chunk audio not found',
        'error'
      );
      return;
    }
    const url = URL.createObjectURL(blob.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chunk-${chunkId}.mp3`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function playOne(kind: 'chunk' | 'snip', id: string) {
    const result = kind === 'chunk' ? await playChunk(id) : await playSnip(id);
    if (isErrorResult(result)) {
      app.showToast(
        result.error === 'audio_purged'
          ? 'Audio removed after transcription'
          : `${kind} playback failed: ${result.error}`,
        'error'
      );
      return;
    }
    bindHandle(result);
  }

  if (!session) {
    return (
      <main className="scroll">
        <p className="muted">Loading session…</p>
      </main>
    );
  }

  const hasAudio = session.chunkCount > 0;
  const keyReady = Boolean(app.settings.keyValid && app.settings.groqApiKey);
  const failedCount = Math.max(failures.length, snips.length - transcripts.length);
  const totalSize = session.sizeBytes || chunks.reduce((sum, c) => sum + c.sizeBytes, 0);
  const format = 'audio/mpeg';
  const playbackDuration = duration || session.duration || 0;

  return (
    <>
      <header className="header">
        <button className="text-btn" onClick={app.goHome}>
          ← Sessions
        </button>
        <div style={{ flex: 1 }} />
      </header>
      <main className="scroll session-detail">
        <section className="card session-detail-card">
          <div className="session-detail-top">
            <p className="kicker">RECORDED SESSION</p>
            <div className="session-detail-actions">
              <button
                className="icon-btn"
                style={{ padding: 4, minHeight: 32, minWidth: 32, fontSize: 18 }}
                aria-label="Delete session"
                onClick={() => {
                  const durationStr = formatDuration(session.duration);
                  app.askConfirm({
                    title: 'Delete recording?',
                    body: `Delete Recording ${durationStr}? This cannot be undone.`,
                    confirmLabel: 'Delete',
                    onConfirm: () => void app.deleteSessionById(session.id),
                  });
                }}
              >
                🗑️
              </button>
              <button className="text-btn" onClick={app.goHome}>
                Close
              </button>
            </div>
          </div>

          <p className="session-detail-meta tiny">
            {formatDurationHeroStyle(session.duration)}
            {' · '}
            {formatCapturedRange(session.createdAt, session.duration)}
            {totalSize > 0 ? ` · ${formatBytes(totalSize)}` : ''}
          </p>

          {hasAudio ? (
            <div className="session-detail-playback">
              <button
                className="round-play"
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => void togglePlay()}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <div className="session-detail-seek-wrap">
                <input
                  className="seek"
                  type="range"
                  min={0}
                  max={playbackDuration}
                  step={0.1}
                  value={Math.min(currentTime, playbackDuration)}
                  aria-label="Seek"
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setCurrentTime(next);
                    handleRef.current?.seek(next);
                  }}
                />
                <div className="session-detail-playback-meta">
                  <p className="tiny" style={{ margin: 0 }}>
                    {formatDuration(currentTime)} / {formatDuration(playbackDuration)}
                  </p>
                  <div className="session-detail-volume">
                    <span className="tiny" aria-hidden="true">🔊</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      aria-label="Volume"
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                      className="session-detail-volume-slider"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="danger-text" style={{ marginTop: 12 }}>
              This session has no playable audio.
            </p>
          )}

          <div className="session-detail-tabs" role="tablist" aria-label="Session detail views">
            <button
              role="tab"
              aria-selected={detailTab === 'transcript'}
              className={`session-detail-tab ${detailTab === 'transcript' ? 'active' : ''}`}
              onClick={() => setDetailTab('transcript')}
            >
              Transcript
            </button>
            <button
              role="tab"
              aria-selected={detailTab === 'debug'}
              className={`session-detail-tab ${detailTab === 'debug' ? 'active' : ''}`}
              onClick={() => setDetailTab('debug')}
            >
              Debug
            </button>
          </div>

          {detailTab === 'transcript' ? (
            <div className="session-detail-transcript-panel" role="tabpanel">
              <div className="session-detail-tx-head">
                <p className="kicker" style={{ margin: 0 }}>TRANSCRIPTION</p>
                <div className="session-detail-tx-actions">
                  {transcriptText ? (
                    <button
                      className="session-detail-copy-btn"
                      onClick={() => void copyTranscript()}
                    >
                      {copyStatus === 'copied' ? 'Copied' : 'Copy'}
                    </button>
                  ) : null}
                  {keyReady && snips.length > 0 && !transcribing ? (
                    <button
                      className="linkish"
                      style={{ fontSize: 13, padding: 4 }}
                      onClick={() => void runTranscription(failedCount > 0)}
                    >
                      RETRY TX
                    </button>
                  ) : null}
                </div>
              </div>

              {!keyReady && transcripts.length === 0 ? (
                <>
                  <p>Transcription disabled. Add API key in Settings.</p>
                  <button className="linkish" onClick={() => app.setSettingsOpen(true)}>
                    Open Settings
                  </button>
                </>
              ) : transcribing ? (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="spinner" />
                    <span className="muted">
                      {progress?.phase === 'analyzing' ? 'Analyzing volume...' : 'Transcribing...'}
                    </span>
                  </div>
                  {progress && progress.total > 0 ? (
                    <>
                      <p className="tiny" style={{ marginTop: 8 }}>
                        {progress.completed} / {progress.total} snips transcribed
                      </p>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                        />
                      </div>
                    </>
                  ) : null}
                </>
              ) : transcriptText ? (
                <>
                  <textarea
                    ref={transcriptRef}
                    className="session-detail-transcript"
                    readOnly
                    value={transcriptText}
                    aria-label="Session transcript"
                    onFocus={(event) => {
                      const target = event.currentTarget;
                      target.select();
                      try {
                        target.setSelectionRange(0, target.value.length);
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                  <p className="tiny session-detail-tx-status">
                    Transcribed {transcripts.length} of {snips.length} snips.
                  </p>
                  {failedCount > 0 ? (
                    <p className="danger-text tiny" style={{ marginTop: 4 }}>
                      {failedCount} snip transcription error{failedCount === 1 ? '' : 's'} recorded.
                      See Debug for details.
                    </p>
                  ) : null}
                </>
              ) : keyReady && snips.length > 0 ? (
                <button className="cta" onClick={() => void runTranscription()}>
                  Transcribe Session
                </button>
              ) : snips.length === 0 && keyReady ? (
                <p className="muted">No snips available for transcription.</p>
              ) : (
                <p className="muted">No transcript yet.</p>
              )}
            </div>
          ) : (
            <div className="session-detail-debug-panel" role="tabpanel">
              <p className="kicker" style={{ marginBottom: 12 }}>
                {snipsTab === 'chunks' ? `CHUNKS (${chunks.length})` : `SNIPS (${snips.length})`} · {format}
              </p>
              <div className="pills" style={{ marginBottom: 16 }}>
                <button
                  className={`pill ${snipsTab === 'chunks' ? 'active' : ''}`}
                  onClick={() => setSnipsTab('chunks')}
                >
                  Chunks
                </button>
                <button
                  className={`pill ${snipsTab === 'snips' ? 'active' : ''}`}
                  onClick={() => setSnipsTab('snips')}
                >
                  Snips
                </button>
              </div>

              {snipsTab === 'chunks' ? (
                chunks.length === 0 ? (
                  <p className="muted">No chunks.</p>
                ) : (
                  <div className="session-detail-debug-list">
                    {chunks.map((chunk, index) => (
                      <div
                        key={chunk.id}
                        className="session-detail-debug-row"
                        style={{
                          borderBottom:
                            index < chunks.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>
                            #{index + 1} {chunk.duration.toFixed(2)}s
                          </p>
                          <p className="tiny" style={{ margin: 0, marginTop: 2 }}>
                            {formatBytes(chunk.sizeBytes)}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="icon-btn"
                            style={{ minHeight: 36, minWidth: 36, fontSize: 14 }}
                            onClick={() => void playOne('chunk', chunk.id)}
                          >
                            ▶
                          </button>
                          <button
                            className="icon-btn"
                            style={{ minHeight: 36, minWidth: 36, fontSize: 14 }}
                            onClick={() => void downloadChunk(chunk.id)}
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : snips.length === 0 ? (
                <p className="muted">No snips.</p>
              ) : (
                <div className="session-detail-debug-list">
                  {snips.map((snip, index) => {
                    const transcript = transcripts.find((t) => t.snipId === snip.id);
                    const failure = failures.find((f) => f.snipId === snip.id);
                    const hasTranscript = Boolean(transcript);
                    const previewText = previewSnipTranscriptText(transcript?.text);
                    const pending = !hasTranscript && !failure;
                    return (
                      <div
                        key={snip.id}
                        className="session-detail-debug-row session-detail-debug-row-stack"
                        style={{
                          borderBottom:
                            index < snips.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>
                              #{index + 1} {snip.duration.toFixed(1)}s{' '}
                              <span className="tiny">
                                {formatDuration(snip.startTime)} → {formatDuration(snip.endTime)}
                              </span>
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {hasTranscript ? (
                              <span
                                className="chip enabled"
                                style={{ fontSize: 10, padding: '2px 8px', minHeight: 20 }}
                              >
                                Transcribed
                              </span>
                            ) : null}
                            {!hasTranscript && keyReady ? (
                              <button
                                className="linkish"
                                style={{ fontSize: 12, padding: 4, minHeight: 32 }}
                                onClick={() => void retrySnip(snip.id)}
                              >
                                RETRY
                              </button>
                            ) : null}
                            <button
                              className="icon-btn"
                              style={{ minHeight: 36, minWidth: 36, fontSize: 14 }}
                              onClick={() => void downloadSnip(snip.id)}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                        {previewText ? (
                          <p className="tiny session-detail-snip-preview">{previewText}</p>
                        ) : pending ? (
                          <p className="tiny session-detail-snip-pending">Pending…</p>
                        ) : null}
                        {failure ? (
                          <p className="danger-text" style={{ fontSize: 12, marginTop: 6 }}>
                            {failure.error}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {app.settings.developerModeEnabled ? (
                <>
                  <div className="session-detail-debug-section">
                    <p className="kicker">VOLUME HISTOGRAM</p>
                    <button className="linkish" onClick={() => setShowHistogram((value) => !value)}>
                      {showHistogram ? 'Hide Histogram ▼' : 'Show Histogram ▶'}
                    </button>
                    {showHistogram ? (
                      volumeProfile?.chunkVolumes?.length ? (
                        <VolumeHistogram
                          profile={volumeProfile}
                          snips={snips}
                          currentTime={hasPlayback ? currentTime : null}
                          duration={playbackDuration}
                        />
                      ) : (
                        <p className="tiny">Volume profiles not available. Run Doctor to diagnose.</p>
                      )
                    ) : null}
                  </div>

                  <div className="session-detail-debug-section">
                    <p className="kicker">DOCTOR</p>
                    <button className="linkish" onClick={() => setShowDoctor((value) => !value)}>
                      {showDoctor ? 'Hide Doctor ▼' : 'Show Doctor ▶'}
                    </button>
                    {showDoctor ? (
                      <>
                        <button
                          className="cta-outline"
                          onClick={async () => {
                            const report = await runDoctor(sessionId);
                            setDoctor(report);
                          }}
                        >
                          Run Doctor
                        </button>
                        {!doctor ? (
                          <p className="help">
                            Doctor performs diagnostic checks: coverage, range access, per-chunk decode,
                            snip scan.
                          </p>
                        ) : (
                          <>
                            <p className={doctor.passed ? 'success-text' : 'warning-text'}>
                              {doctor.summary}
                            </p>
                            {doctor.checks.perChunkDecode.failures.map((id) => (
                              <p key={id} className="danger-text tiny">
                                Chunk {id}: decode failed
                              </p>
                            ))}
                            {doctor.checks.snipScan.issues.map((issue) => (
                              <p key={issue} className="danger-text tiny">
                                {issue}
                              </p>
                            ))}
                            <button className="linkish" onClick={() => setDoctorJson((value) => !value)}>
                              {doctorJson ? 'Hide Full Report ▲' : 'Show Full Report ▶'}
                            </button>
                            {doctorJson ? (
                              <pre className="json">{JSON.stringify(doctor, jsonReplacer, 2)}</pre>
                            ) : null}
                          </>
                        )}
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
