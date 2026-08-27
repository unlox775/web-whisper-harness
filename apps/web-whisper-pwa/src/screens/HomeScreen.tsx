import { formatBytes, formatDuration, formatTimestamp } from '../format';
import { useApp } from '../context';

const GROQ_CONSOLE = 'https://console.groq.com/keys';

export function HomeScreen() {
  const app = useApp();
  const capLabel = `${formatBytes(app.usedBytes)} / ${formatBytes(app.capBytes)}`;

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

        {app.sessions.length === 0 ? (
          <section className="card empty-sessions" aria-label="Recording sessions" />
        ) : (
          app.sessions.map((session) => (
            <article
              key={session.id}
              className="card session-card"
              onClick={() => app.openSession(session.id)}
            >
              <div className="session-title">{formatTimestamp(session.createdAt)}</div>
              <div className="session-meta">
                {formatDuration(session.duration)}
                {session.hasTranscript ? ' · transcribed' : ''}
                {session.chunkCount === 0 ? ' · no playable audio' : ''}
              </div>
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
              </div>
            </article>
          ))
        )}
      </main>
    </>
  );
}
