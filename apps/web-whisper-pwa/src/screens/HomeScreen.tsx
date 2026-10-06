import { useEffect, useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { formatBytes, formatDuration, formatTimestamp } from '../format';
import { useApp } from '../context';
import { transcribeSession } from '../orchestration';
import { sessionTilePreview, type SessionTilePreview } from '../sessionTile';
import { emitTranscriptionEvent, subscribeSessionTranscription } from '../transcriptionEvents';
import { sessionTranscriptionCoverage, uncoveredTailCopy } from '../transcriptionCoverage';
import { coverageExtrasForSession } from '../recorderDuration';
import type { SessionRecord, SnipRecord, TranscriptRecord } from '../types';
import {
  homeAfterStopPreview,
  homeAfterStopStalePreview,
  homePartialCoveragePreview,
  isHomeAfterStopScreenshot,
  isHomeAfterStopStaleScreenshot,
  isHomePartialCoverageScreenshot,
  isHomeTileLiveScreenshot,
  readScreenshotMode,
} from '../screenshotMode';

const GROQ_CONSOLE = 'https://console.groq.com/keys';

function SessionCard({
  session,
  onRetry,
  retrying,
  preview,
}: {
  session: SessionRecord;
  onRetry: (sessionId: string) => void;
  retrying: boolean;
  preview?: { snips: SnipRecord[]; transcripts: TranscriptRecord[]; snippet: string };
}) {
  const app = useApp();
  const [tile, setTile] = useState<SessionTilePreview>(() =>
    preview
      ? sessionTilePreview(session, preview.snips, preview.transcripts)
      : {
          snipCount: 0,
          transcriptCount: 0,
          snippet: '',
          badge: null,
          coverage: sessionTranscriptionCoverage(session, [], []),
          coverageNote: null,
        }
  );

  useEffect(() => {
    if (preview) {
      setTile(sessionTilePreview(session, preview.snips, preview.transcripts));
      return undefined;
    }

    let cancelled = false;
    async function loadTile() {
      const snipsResult = await sessionStore.getSnipsForSession(session.id);
      const transcriptsResult = await sessionStore.getTranscriptsForSession(session.id);
      if (cancelled) return;
      setTile(
        sessionTilePreview(
          session,
          (snipsResult.snips || []) as SnipRecord[],
          (transcriptsResult.transcripts || []) as TranscriptRecord[],
          coverageExtrasForSession(session.id)
        )
      );
    }

    void loadTile();
    return subscribeSessionTranscription(session.id, () => {
      void loadTile();
    });
  }, [preview, session]);

  const { snippet, badge, coverageNote } = tile;
  const showRetry = badge === 'part-tx';

  return (
    <article
      key={session.id}
      className="card session-card"
      onClick={() => app.openSession(session.id)}
    >
      <div className="session-header">
        {badge ? (
          <span className={`session-badge ${badge}`}>
            {badge === 'ready' ? 'READY' : 'PART TX'}
          </span>
        ) : null}
        <div className="session-title">{formatTimestamp(session.createdAt)}</div>
      </div>
      <div className="session-meta">
        {formatDuration(session.duration)}
        {' · '}
        {formatBytes(session.sizeBytes)}
        {session.chunkCount === 0 ? ' · no playable audio' : ''}
      </div>
      {snippet ? <div className="session-snippet">{snippet}</div> : null}
      {coverageNote ? <p className="session-coverage-note">{coverageNote}</p> : null}
      <div className="session-actions" onClick={(event) => event.stopPropagation()}>
        <button className="linkish" onClick={() => app.openSession(session.id, true)}>
          Play
        </button>
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
          Delete
        </button>
        {showRetry ? (
          <button
            className="linkish retry-btn"
            disabled={retrying}
            onClick={() => onRetry(session.id)}
          >
            {retrying ? 'RETRYING...' : 'RETRY TX'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function HomeScreen() {
  const app = useApp();
  const capLabel = `${formatBytes(app.usedBytes)} / ${formatBytes(app.capBytes)}`;
  const [retryingSession, setRetryingSession] = useState<string | null>(null);
  const screenshot = readScreenshotMode();
  const liveTile = isHomeTileLiveScreenshot(screenshot);
  const [liveTileDone, setLiveTileDone] = useState(false);
  const homePreview = isHomePartialCoverageScreenshot(screenshot)
    ? homePartialCoveragePreview()
    : isHomeAfterStopStaleScreenshot(screenshot)
      ? homeAfterStopStalePreview()
      : isHomeAfterStopScreenshot(screenshot) || liveTile
        ? liveTile && !liveTileDone
          ? homeAfterStopStalePreview()
          : homeAfterStopPreview()
        : null;
  const sessions = homePreview ? [homePreview.session] : app.sessions;

  useEffect(() => {
    if (!liveTile) return undefined;
    const sessionId = homeAfterStopStalePreview().session.id;
    const stop = subscribeSessionTranscription(sessionId, (event) => {
      if (event.type === 'transcription-finished' || event.type === 'snip-complete') {
        setLiveTileDone(true);
      }
    });
    const timer = window.setTimeout(() => {
      emitTranscriptionEvent({ type: 'transcription-finished', sessionId });
    }, 2500);
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [liveTile]);

  async function handleRetry(sessionId: string) {
    if (!app.settings.groqApiKey || !app.settings.keyValid) return;
    setRetryingSession(sessionId);
    try {
      const outcome = await transcribeSession(
        sessionId,
        app.settings.groqApiKey,
        () => {},
        { retryFailedOnly: true, onTranscriptWritten: () => app.enforceCap({ force: true }) }
      );
      const listed = await sessionStore.getSession(sessionId);
      const snipsResult = await sessionStore.getSnipsForSession(sessionId);
      const transcriptsResult = await sessionStore.getTranscriptsForSession(sessionId);
      const coverage = sessionTranscriptionCoverage(
        (listed || { duration: 0 }) as SessionRecord,
        (snipsResult.snips || []) as SnipRecord[],
        (transcriptsResult.transcripts || []) as TranscriptRecord[],
        coverageExtrasForSession(sessionId)
      );
      const tailNote = uncoveredTailCopy(coverage);
      if (outcome.stopReason) {
        app.showToast(`Transcription failed: ${outcome.stopReason}`, 'error');
      } else if (outcome.failed > 0) {
        app.showToast(
          `Transcription failed: ${outcome.failed} snip${outcome.failed === 1 ? '' : 's'} failed`,
          'warning'
        );
        if (tailNote) app.showToast(tailNote, 'warning');
      } else if (tailNote) {
        app.showToast(tailNote, 'warning');
      } else if (coverage.status === 'ready') {
        app.showToast('Transcription completed!', 'success');
      } else if (outcome.empty) {
        app.showToast('No speech detected. Transcription skipped.', 'warning');
      }
      await app.refresh();
    } catch (error) {
      app.showToast(
        `Transcription failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error'
      );
    } finally {
      setRetryingSession(null);
    }
  }

  return (
    <>
      <header className="header">
        <h1>Web Whisper</h1>
        <div className="header-actions">
          <div className="data-chip" aria-label="Storage usage">
            <span className="label">DATA</span>
            <span className="value">{capLabel}</span>
          </div>
          {app.settings.developerModeEnabled ? (
            <button
              className="icon-btn"
              aria-label="Developer console"
              onClick={() => app.setDeveloperOpen(true)}
            >
              🐞
            </button>
          ) : null}
          <button className="settings-btn" onClick={() => app.setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <main className="scroll">
        {!app.settings.onboardingDismissed && !homePreview ? (
          <section className="card">
            <div className="card-head">
              <h3>Transcription setup is insanely easy.</h3>
              <button
                className="dismiss"
                onClick={() => app.updateSetting('onboardingDismissed', true)}
              >
                Dismiss
              </button>
            </div>
            <p style={{ marginTop: 10 }}>
              Groq is a separate service (not this app). Their free account takes about a
              minute to set up, and this app auto-checks your key after you paste it.
            </p>
            <div className="callout">
              This uses one of the most amazing AI models. It is a crazy amount of value for
              free.
            </div>
            <ol className="steps">
              <li>Create a free Groq account at console.groq.com</li>
              <li>Open Settings and paste your API key</li>
              <li>We auto-check your key and enable transcription</li>
            </ol>
            <div className="row-actions">
              <button className="linkish" onClick={() => app.setSettingsOpen(true)}>
                Open Settings
              </button>
              <a className="linkish" href={GROQ_CONSOLE} target="_blank" rel="noreferrer">
                Get Groq API key
              </a>
            </div>
          </section>
        ) : null}

        <section className="card">
          <p className="kicker">CAPTURE</p>
          <button className="cta" onClick={() => void app.startRecording()}>
            Start recording
          </button>
          <p className="status-line">
            Recorder idle — tap start to begin a durable session.
          </p>
        </section>

        {sessions.length === 0 ? (
          <section className="card empty-sessions" aria-label="Recording sessions" />
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onRetry={handleRetry}
              retrying={retryingSession === session.id}
              preview={
                homePreview && homePreview.session.id === session.id
                  ? {
                      snips: homePreview.snips,
                      transcripts: homePreview.transcripts,
                      snippet: homePreview.snippet,
                    }
                  : undefined
              }
            />
          ))
        )}
      </main>
    </>
  );
}
