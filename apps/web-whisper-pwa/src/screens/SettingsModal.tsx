import { useEffect, useState } from 'react';
import { validateKey } from '@web-whisper/transcription-client';
import { useApp } from '../context';

const GROQ_CONSOLE = 'https://console.groq.com/keys';
const GROQ_PRICING = 'https://groq.com/pricing';
const GROQ_DOCS = 'https://console.groq.com/docs/quickstart';

export function SettingsModal() {
  const app = useApp();
  const [apiKey, setApiKey] = useState(app.settings.groqApiKey);
  const [cap, setCap] = useState(String(app.settings.storageCapMb));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setApiKey(app.settings.groqApiKey);
    setCap(String(app.settings.storageCapMb));
  }, [app.settings.groqApiKey, app.settings.storageCapMb]);

  async function checkKey(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      app.persistKey('', false, 'Missing');
      return;
    }
    setBusy(true);
    try {
      const result = await validateKey(trimmed);
      if (result.valid) {
        app.persistKey(trimmed, true, 'Valid');
      } else {
        app.persistKey('', false, result.reason || 'Invalid');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={() => app.setSettingsOpen(false)}>
      <section className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <h2>Settings</h2>
          <button className="text-btn" onClick={() => app.setSettingsOpen(false)}>
            Close
          </button>
        </div>
        <div className="sheet-body">
          <section className="section">
            <div className="section-head">
              <h3>Transcription</h3>
              {app.settings.keyValid ? (
                <button
                  className="chip enabled"
                  onClick={() => {
                    setApiKey('');
                    app.persistKey('', false, 'Missing');
                  }}
                >
                  ENABLE
                </button>
              ) : (
                <span className="chip disabled">DISABLED</span>
              )}
            </div>
            <p>
              Groq is a separate service (not this app). Their free account takes about a
              minute to set up, and this app auto-checks your key after you paste it.{' '}
              <a href={GROQ_DOCS} target="_blank" rel="noreferrer">
                It&apos;s easy to set up.
              </a>
            </p>
            <ol className="steps">
              <li>Create a free Groq account at console.groq.com</li>
              <li>Paste the key here</li>
              <li>Transcription turns on after validation</li>
            </ol>
            <label className="field">
              Groq API key
              <input
                type="password"
                placeholder="gsk_..."
                value={apiKey}
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
                onBlur={() => void checkKey(apiKey)}
              />
            </label>
            <div className="key-row">
              <span className="tiny">
                Key status: {busy ? 'Checking' : app.settings.keyStatus}
              </span>
              <button className="recheck" onClick={() => void checkKey(apiKey)} disabled={busy}>
                Recheck key
              </button>
            </div>
            <p className="help">
              Need a key?{' '}
              <a href={GROQ_CONSOLE} target="_blank" rel="noreferrer">
                Create one in Groq Console
              </a>
              . Groq is a separate service with its own pricing.{' '}
              <a href={GROQ_PRICING} target="_blank" rel="noreferrer">
                See Groq pricing
              </a>
              .
            </p>
          </section>

          <section className="section">
            <h3>App</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={app.settings.developerModeEnabled}
                onChange={(event) =>
                  app.updateSetting('developerModeEnabled', event.target.checked)
                }
              />
              Enable developer mode
            </label>
            <label className="field">
              Storage cap (MB)
              <input
                className="narrow"
                type="number"
                min={1}
                value={cap}
                onChange={(event) => setCap(event.target.value)}
                onBlur={() => {
                  const next = Math.max(1, Number(cap) || 200);
                  setCap(String(next));
                  app.updateSetting('storageCapMb', next);
                }}
              />
            </label>
            <p className="help">
              Maximum storage for session data. Old sessions will be deleted when this
              limit is reached.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
