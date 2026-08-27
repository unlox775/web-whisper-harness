import { useEffect, useRef, useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { playChunk, playSession, playSnip, type PlaybackHandle } from '@web-whisper/playback-engine';
import { formatBytes, formatDuration, formatCapturedRange, formatDurationHeroStyle, jsonReplacer } from '../format';
import { runDoctor, type DoctorReport } from '../doctor';
import { buildTranscriptText, transcribeSession, type TranscribeProgress } from '../orchestration';
import { useApp } from '../context';
import type { ChunkRecord, SessionRecord, SnipRecord, TranscriptRecord } from '../types';
import { VolumeHistogram } from '../components/VolumeHistogram';

function isErrorResult(value: PlaybackHandle | { error: string }): value is { error: string } {
  return 'error' in value;
}

export function SessionDetailScreen() {
  const app = useApp();
  const sessionId = app.sessionId!;
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
  const [snips, setSnips] = useState<SnipRecord[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [volumeProfile, setVolumeProfile] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [failures, setFailures] = useState<Array<{ snipId: string; error: string }>>([]);
  const [snipsTab, setSnipsTab] = useState<'chunks' | 'snips'>('snips');
  const [showHistogram, setShowHistogram] = useState(false);
  const [showDoctor, setShowDoctor] = useState(false);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [doctorJson, setDoctorJson] = useState(false);
  const handleRef = useRef<PlaybackHandle | null>(null);

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
    void load();
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (app.autoPlay && session && session.chunkCount > 0) {
      void startPlayback();
    }
  }, [app.autoPlay, session?.id]);

  function bindHandle(handle: PlaybackHandle) {
    handleRef.current?.stop();
    handleRef.current = handle;
    setPlaying(true);
    setDuration(handle.duration || session?.duration || 0);
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
      app.showToast(
        result.error === 'chunks_missing'
          ? 'Session has no playable audio.'
          : `Playback failed: ${result.error}`,
        'error'
      );
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

  async function runTranscription(retryFailedOnly = false) {
    if (!app.settings.groqApiKey || !app.settings.keyValid) return;
    setTranscribing(true);
    setProgress({ phase: 'analyzing', completed: 0, total: 0 });
    try {
      const outcome = await transcribeSession(
        sessionId,
        app.settings.groqApiKey,
        setProgress,
        { retryFailedOnly }
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

  async function retrySnip(snipId: string) {
    if (!app.settings.groqApiKey || !app.settings.keyValid) return;
    const snip = snips.find((s) => s.id === snipId);
    if (!snip) return;
    
    try {
      const blob = await sessionStore.getSnip(snipId);
      if (!blob?.blob) {
        app.showToast('Snip audio not found', 'error');
        return;
      }
      const { transcribe, ERROR_CODES } = await import('@web-whisper/transcription-client');
      const result = await transcribe(blob.blob, app.settings.groqApiKey);
      if (result.error) {
        const existingFailure = failures.find((f) => f.snipId === snipId);
        if (!existingFailure) {
          setFailures((prev) => [...prev, { snipId, error: result.error! }]);
        }
        const message = result.error === ERROR_CODES.RATE_LIMIT
          ? 'Rate limit reached. Try again later.'
          : `Transcription failed: ${result.error}`;
        app.showToast(message, 'error');
        return;
      }
      await sessionStore.putTranscript({
        id: crypto.randomUUID(),
        sessionId,
        snipId,
        text: result.text || '',
        createdAt: new Date().toISOString(),
      });
      setFailures((prev) => prev.filter((f) => f.snipId !== snipId));
      await load();
      app.showToast('Transcription complete', 'success');
    } catch (error) {
      app.showToast(`Retry failed: ${error instanceof Error ? error.message : 'unknown error'}`, 'error');
    }
  }

  async function downloadSnip(snipId: string) {
    const blob = await sessionStore.getSnip(snipId);
    if (!blob?.blob) {
      app.showToast('Snip audio not found', 'error');
      return;
    }
    const url = URL.createObjectURL(blob.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snip-${snipId}.mp3`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadChunk(chunkId: string) {
    const blob = await sessionStore.getChunk(chunkId);
    if (!blob?.blob) {
      app.showToast('Chunk audio not found', 'error');
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
      app.showToast(`${kind} playback failed: ${result.error}`, 'error');
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
  const transcriptText = buildTranscriptText(snips, transcripts, failures);
  const failedCount = Math.max(failures.length, snips.length - transcripts.length);
  const transcribeComplete = transcripts.length > 0 && failedCount <= 0;
  const transcribePartial = transcripts.length > 0 && failedCount > 0;
  const totalSize = chunks.reduce((sum, c) => sum + c.sizeBytes, 0);
  const format = chunks[0]?.format || 'audio/mpeg';

  return (
    <>
      <header className="header">
        <button className="text-btn" onClick={app.goHome}>
          ← Sessions
        </button>
        <div style={{ flex: 1 }} />
      </header>
      <main className="scroll">
        <section className="card session-detail-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <p className="kicker">RECORDED SESSION</p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                className="icon-btn"
                style={{ padding: 4, minHeight: 32, minWidth: 32, fontSize: 18 }}
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

          <h2 style={{ fontSize: 48, fontWeight: 700, marginBottom: 8 }}>
            {formatDurationHeroStyle(session.duration)}
          </h2>

          <p className="tiny" style={{ marginBottom: 4 }}>
            <strong>Captured:</strong> {formatCapturedRange(session.createdAt, session.duration)}
          </p>
          <p className="tiny" style={{ marginBottom: 4 }}>
            <strong>Size:</strong> {formatBytes(totalSize)}
          </p>
          {chunks.length > 0 ? (
            <p className="tiny" style={{ marginBottom: 16 }}>
              <strong>Format:</strong> {format} · <strong>Chunks:</strong> {chunks.length}
            </p>
          ) : null}

          {hasAudio && (currentTime > 0 || playing) ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <button className="round-play" onClick={() => void togglePlay()}>
                  {playing ? '❚❚' : '▶'}
                </button>
                <div style={{ flex: 1 }}>
                  <input
                    className="seek"
                    type="range"
                    min={0}
                    max={duration || session.duration || 0}
                    step={0.1}
                    value={currentTime}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setCurrentTime(next);
                      handleRef.current?.seek(next);
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <p className="tiny" style={{ margin: 0 }}>
                      {formatDuration(currentTime)} / {formatDuration(duration || session.duration)}
                    </p>
                    {playing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
                        <span className="tiny">🔊</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={volume}
                          onChange={(e) => handleVolumeChange(Number(e.target.value))}
                          style={{ width: 80, accentColor: 'var(--accent-primary)' }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : hasAudio ? (
            <button className="cta" onClick={() => void startPlayback()} style={{ marginTop: 12 }}>
              Play Session
            </button>
          ) : (
            <p className="danger-text" style={{ marginTop: 12 }}>
              This session has no playable audio.
            </p>
          )}
        </section>

        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p className="kicker" style={{ margin: 0 }}>TRANSCRIPTION</p>
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

          {!keyReady ? (
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
          ) : transcripts.length > 0 ? (
            <>
              <div className="transcript" style={{ border: '1px solid rgba(255, 255, 255, 0.1)', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                {transcriptText}
              </div>
              <p className="tiny" style={{ color: 'var(--accent-primary)' }}>
                Transcribed {transcripts.length} of {snips.length} snips.
              </p>
              {failedCount > 0 ? (
                <p className="danger-text tiny" style={{ marginTop: 4 }}>
                  {failedCount} snip transcription error{failedCount === 1 ? '' : 's'} recorded. See the snip list for details.
                </p>
              ) : null}
            </>
          ) : snips.length > 0 ? (
            <button className="cta" onClick={() => void runTranscription()}>
              Transcribe Session
            </button>
          ) : (
            <p className="muted">No snips available for transcription.</p>
          )}
        </section>

        {snips.length > 0 ? (
          <section className="card">
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
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {chunks.map((chunk, index) => (
                  <div
                    key={chunk.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 0',
                      borderBottom: index < chunks.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                      minHeight: 48,
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
            ) : (
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {snips.map((snip, index) => {
                  const transcript = transcripts.find((t) => t.snipId === snip.id);
                  const failure = failures.find((f) => f.snipId === snip.id);
                  const hasTranscript = Boolean(transcript);
                  return (
                    <div
                      key={snip.id}
                      style={{
                        padding: '12px 0',
                        borderBottom: index < snips.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                        minHeight: 48,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
          </section>
        ) : null}

        {app.settings.developerModeEnabled ? (
          <>
            <section className="card">
              <p className="kicker">VOLUME HISTOGRAM (Developer Mode)</p>
              <button className="linkish" onClick={() => setShowHistogram((value) => !value)}>
                {showHistogram ? 'Hide Histogram ▼' : 'Show Histogram ▶'}
              </button>
              {showHistogram ? (
                volumeProfile?.chunkVolumes?.length ? (
                  <VolumeHistogram profile={volumeProfile} snips={snips} />
                ) : (
                  <p className="tiny">Volume profiles not available. Run Doctor to diagnose.</p>
                )
              ) : null}
            </section>

            <section className="card">
              <p className="kicker">DOCTOR (Developer Mode)</p>
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
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
