import { AppProvider, useApp } from './context';
import { HomeScreen } from './screens/HomeScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { SessionDetailScreen } from './screens/SessionDetailScreen';
import { SettingsModal } from './screens/SettingsModal';
import { DeveloperConsole } from './screens/DeveloperConsole';

function Shell() {
  const app = useApp();

  if (!app.ready) {
    return (
      <div className="app-shell">
        <header className="header">
          <h1>Web Whisper</h1>
        </header>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {app.screen === 'home' ? <HomeScreen /> : null}
      {app.screen === 'recording' ? <RecordingScreen /> : null}
      {app.screen === 'session' && app.sessionId ? <SessionDetailScreen /> : null}

      {app.settingsOpen ? <SettingsModal /> : null}
      {app.developerOpen && app.settings.developerModeEnabled ? <DeveloperConsole /> : null}

      {app.permissionError ? (
        <div className="overlay">
          <div className="modal-card">
            <h3>Microphone permission denied</h3>
            <p style={{ marginTop: 10 }}>{app.permissionError}</p>
            <div className="modal-actions">
              <button className="cta" onClick={() => app.setPermissionError(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {app.confirm ? (
        <div className="overlay">
          <div className="modal-card">
            <h3>{app.confirm.title}</h3>
            <p style={{ marginTop: 10 }}>{app.confirm.body}</p>
            <div className="modal-actions">
              <button className="text-btn" onClick={() => app.askConfirm(null)}>
                Cancel
              </button>
              <button
                className="linkish danger-text"
                onClick={() => {
                  const action = app.confirm?.onConfirm;
                  app.askConfirm(null);
                  action?.();
                }}
              >
                {app.confirm.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {app.toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
