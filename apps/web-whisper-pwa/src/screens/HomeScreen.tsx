import { useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { formatBytes, formatDuration, formatTimestamp } from '../format';
import { useApp } from '../context';
import { transcribeSession } from '../orchestration';
import type { SessionRecord, SnipRecord, TranscriptRecord } from '../types';
import {
  homeAfterStopPreview,
  isHomeAfterStopScreenshot,
  readScreenshotMode,
} from '../screenshotMode';

const GROQ_CONSOLE = 'https://console.groq.com/keys';

type SessionBadge = 'ready' | 'part-tx' | null;

function computeSessionBadge(
  session: SessionRecord,
  snipCount: number,
  transcriptCount: number
): SessionBadge {
  if (!session.hasSnips || snipCount === 0) return null;
  if (transcriptCount === 0) return null;
  if (transcriptCount < snipCount) return 'part-tx';
  return 'ready';
}

function SessionCard({
  session,
  onRetry,
  retrying,
  previewCounts,
}: {
  session: SessionRecord;
  onRetry: (sessionId: string) => void;
  retrying: boolean;
  previewCounts?: { snipCount: number; transcriptCount: number; snippet: string };
}) {
  const app = useApp();
  const [snipCount, setSnipCount] = useState(previewCounts?.snipCount ?? 0);
  const [transcriptCount, setTranscriptCount] = useState(previewCounts?.transcriptCount ?? 0);
  const [snippet, setSnippet] = useState(previewCounts?.snippet ?? '');

  useState(() => {
    if (previewCounts) return;
    (async () => {
      const snipsResult = await sessionStore.getSnipsForSession(session.id);
      const snips = (snipsResult.snips || []) as SnipRecord[];
      setSnipCount(snips.length);

      const transcriptsResult = await sessionStore.getTranscriptsForSession(session.id);
      const transcripts = (transcriptsResult.transcripts || []) as TranscriptRecord[];
      setTranscriptCount(transcripts.length);

      if (transcripts.length > 0) {
        const text = transcripts.map((t) => t.text).join(' ');
        setSnippet(text.length > 100 ? text.slice(0, 100) + '...' : text);
      }
    })();
  });

  const badge = computeSessionBadge(session, snipCount, transcriptCount);
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
  const homePreview = isHomeAfterStopScreenshot(readScreenshotMode())
    ? homeAfterStopPreview()
    : null;
  const sessions = homePreview ? [homePreview.session] : app.sessions;

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
      if (outcome.stopReason) {
        app.showToast(`Transcription failed: ${outcome.stopReason}`, 'error');
      } else if (outcome.failed > 0) {
        app.showToast(
          `Transcription failed: ${outcome.failed} snip${outcome.failed === 1 ? '' : 's'} failed`,
          'warning'
        );
      } else {
        app.showToast('Transcription completed!', 'success');
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
        {!app.settings.onboardingDismissed ? (
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
              previewCounts={
                homePreview && homePreview.session.id === session.id
                  ? {
                      snipCount: homePreview.snipCount,
                      transcriptCount: homePreview.transcriptCount,
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
