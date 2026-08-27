import { useEffect, useRef, useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { playChunk, playSession, playSnip, type PlaybackHandle } from '@web-whisper/playback-engine';
import { formatDuration, formatTimestamp, jsonReplacer } from '../format';
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
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [failures, setFailures] = useState<Array<{ snipId: string; error: string }>>([]);
  const [copied, setCopied] = useState(false);
  const [showChunks, setShowChunks] = useState(false);
  const [showSnips, setShowSnips] = useState(false);
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

  function seekBy(delta: number) {
    const handle = handleRef.current;
    if (!handle) return;
    const next = Math.max(0, Math.min((handle.currentTime || currentTime) + delta, duration || 0));
    handle.seek(next);
    setCurrentTime(next);
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

  async function copyTranscript() {
    const text = buildTranscriptText(snips, transcripts, failures);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      app.showToast('Copied!', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      app.showToast('Could not copy transcript', 'error');
    }
  }

  async function downloadAudio() {
    const blobs: Blob[] = [];
    for (const chunk of chunks) {
      const full = await sessionStore.getChunk(chunk.id);
      if (full?.blob) blobs.push(full.blob);
    }
    if (!blobs.length) {
      app.showToast('This session has no playable audio.', 'warning');
      return;
    }
    const url = URL.createObjectURL(new Blob(blobs, { type: 'audio/mpeg' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `web-whisper-${sessionId}.mp3`;
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

  return (
    <>
      <header className="header">
        <button className="text-btn" onClick={app.goHome}>
          ← Sessions
        </button>
        <h1 style={{ fontSize: 18 }}>{formatTimestamp(session.createdAt)}</h1>
      </header>
      <main className="scroll">
        <section className="card">
          <dl>
            <div className="meta-row">
              <dt>Duration</dt>
              <dd>{formatDuration(session.duration)}</dd>
            </div>
            <div className="meta-row">
              <dt>Recorded</dt>
              <dd>{formatTimestamp(session.createdAt)}</dd>
            </div>
            {!hasAudio ? (
              <div className="meta-row">
                <dt>Status</dt>
                <dd className="danger-text" style={{ fontWeight: 600, fontSize: 14 }}>
                  Completed without playable audio
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="card">
          <p className="kicker">PLAYBACK</p>
          {!playing && currentTime === 0 ? (
            <button className="cta" disabled={!hasAudio} onClick={() => void startPlayback()}>
              Play Session
            </button>
          ) : (
            <>
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
              <p className="tiny">
                {formatDuration(currentTime)} / {formatDuration(duration || session.duration)}
              </p>
              <div className="playback-row">
                <button className="skip" onClick={() => seekBy(-15)}>
                  −15s
                </button>
                <button className="round-play" onClick={() => void togglePlay()}>
                  {playing ? '❚❚' : '▶'}
                </button>
                <button className="skip" onClick={() => seekBy(15)}>
                  +15s
                </button>
              </div>
            </>
          )}
          {!hasAudio ? (
            <p className="help">This session has no playable audio.</p>
          ) : null}
        </section>

        <section className="card">
          <p className="kicker">TRANSCRIPTION</p>
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
          ) : transcribePartial ? (
            <>
              <p className="warning-text">
                {transcripts.length} of {snips.length} snips transcribed. {failedCount} failed.
              </p>
              <div className="transcript">{transcriptText}</div>
              <button className="linkish" onClick={() => void runTranscription(true)}>
                Retry Failed
              </button>
            </>
          ) : transcribeComplete || transcripts.length > 0 ? (
            <>
              <div className="transcript">{transcriptText}</div>
              <button className="cta-outline" onClick={() => void copyTranscript()}>
                {copied ? 'Copied!' : 'Copy Transcript'}
              </button>
            </>
          ) : (
            <button className="cta" onClick={() => void runTranscription()}>
              Transcribe Session
            </button>
          )}
        </section>

        <section className="action-bar">
          <button
            className="linkish danger-text"
            onClick={() =>
              app.askConfirm({
                title: 'Delete this session?',
                body: 'This cannot be undone.',
                confirmLabel: 'Delete',
                onConfirm: () => void app.deleteSessionById(session.id),
              })
            }
          >
            Delete Session
          </button>
          <button className="linkish" onClick={() => void downloadAudio()}>
            Download Audio
          </button>
        </section>

        {app.settings.developerModeEnabled ? (
          <>
            <section className="card">
              <p className="kicker">CHUNKS (Developer Mode)</p>
              <button className="linkish" onClick={() => setShowChunks((value) => !value)}>
                {showChunks ? 'Hide Chunks ▼' : 'Show Chunks ▶'}
              </button>
              {showChunks ? (
                <div className="dev-list">
                  {chunks.map((chunk) => (
                    <div className="dev-row" key={chunk.id}>
                      <span className="tiny">{chunk.id}</span>
                      <span>{formatDuration(chunk.startTime)}</span>
                      <span>{chunk.duration.toFixed(2)}s</span>
                      <span className="tiny">{chunk.sizeBytes.toLocaleString()} bytes</span>
                      <button className="linkish" onClick={() => void playOne('chunk', chunk.id)}>
                        Play
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="card">
              <p className="kicker">SNIPS (Developer Mode)</p>
              <button className="linkish" onClick={() => setShowSnips((value) => !value)}>
                {showSnips ? 'Hide Snips ▼' : 'Show Snips ▶'}
              </button>
              {showSnips ? (
                <div className="dev-list">
                  {snips.map((snip) => {
                    const preview = transcripts.find((item) => item.snipId === snip.id)?.text || '';
                    return (
                      <div className="dev-row" key={snip.id}>
                        <span className="tiny">{snip.id}</span>
                        <span>
                          {formatDuration(snip.startTime)} – {formatDuration(snip.endTime)}
                        </span>
                        <span>{snip.duration.toFixed(1)}s</span>
                        <span className="tiny">{preview.slice(0, 50)}</span>
                        <button className="linkish" onClick={() => void playOne('snip', snip.id)}>
                          Play
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>

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
