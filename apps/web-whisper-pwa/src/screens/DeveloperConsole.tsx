import { useEffect, useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { formatBytes, jsonReplacer } from '../format';
import { useApp } from '../context';
import { isolationDemosHref } from '../isolationDemos';

const TABLES = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'chunks', label: 'Chunks' },
  { id: 'volume-profiles', label: 'Volume Profiles' },
  { id: 'snips', label: 'Snips' },
  { id: 'transcripts', label: 'Transcripts' },
] as const;

export function DeveloperConsole() {
  const app = useApp();
  const [tab, setTab] = useState<'indexeddb' | 'logs'>('indexeddb');
  const [table, setTable] = useState<(typeof TABLES)[number]['id']>('sessions');
  const [records, setRecords] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showStorage, setShowStorage] = useState(false);
  const [orphans, setOrphans] = useState(0);

  async function loadTable(name = table) {
    const dump = await sessionStore.dumpStore(name);
    setRecords(dump.records || []);
  }

  useEffect(() => {
    void loadTable(table);
  }, [table]);

  async function exportJson() {
    const blob = new Blob([JSON.stringify(records, jsonReplacer, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `web-whisper-${table}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="overlay" onClick={() => app.setDeveloperOpen(false)}>
      <section className="sheet tall" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <h2>Developer Console</h2>
          <div className="sheet-head-actions">
            <a
              className="text-btn isolation-demos-head-link"
              href={isolationDemosHref()}
              target="_blank"
              rel="noreferrer"
            >
              Isolation Demos
            </a>
            <button className="text-btn" onClick={() => app.setDeveloperOpen(false)}>
              Close
            </button>
          </div>
        </div>
        <div className="iso-demos-block iso-demos-block-console">
          <a
            className="cta-outline isolation-demos-link"
            href={isolationDemosHref()}
            target="_blank"
            rel="noreferrer"
          >
            Isolation Demos
          </a>
        </div>
        <div className="tabs">
          <button
            className={`tab ${tab === 'indexeddb' ? 'active' : ''}`}
            onClick={() => setTab('indexeddb')}
          >
            IndexedDB
          </button>
          <button
            className={`tab ${tab === 'logs' ? 'active' : ''}`}
            onClick={() => setTab('logs')}
          >
            Logs
          </button>
        </div>
        <div className="sheet-body">
          {tab === 'logs' ? (
            <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>
              Logging not yet implemented. This tab is a placeholder for structured per-session
              logs.
            </p>
          ) : (
            <>
              <div className="pills">
                {TABLES.map((item) => (
                  <button
                    key={item.id}
                    className={`pill ${table === item.id ? 'active' : ''}`}
                    onClick={() => setTable(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="tiny">
                {records.length} {table}
              </p>
              <div className="dev-list">
                {records.map((record, index) => {
                  const id = String(record.id || record.snipId || record.sessionId || index);
                  return (
                    <div className="record-row" key={id}>
                      <div className="tiny">{id}</div>
                      <button
                        className="linkish"
                        onClick={() => setOpenId(openId === id ? null : id)}
                      >
                        {openId === id ? 'Hide Details ▲' : 'View Details'}
                      </button>
                      {openId === id ? (
                        <pre className="json">{JSON.stringify(record, jsonReplacer, 2)}</pre>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="action-bar">
                <button className="cta-outline" onClick={() => void exportJson()}>
                  Export Table as JSON
                </button>
                <button
                  className="cta-outline danger"
                  onClick={() =>
                    app.askConfirm({
                      title: 'Delete all session data?',
                      body: 'This cannot be undone.',
                      confirmLabel: 'Delete',
                      onConfirm: async () => {
                        await sessionStore.clearAll();
                        await app.refresh();
                        await loadTable();
                      },
                    })
                  }
                >
                  Clear All Data
                </button>
              </div>
              <p className="kicker" style={{ marginTop: 20 }}>
                STORAGE
              </p>
              <button className="linkish" onClick={() => setShowStorage((value) => !value)}>
                {showStorage ? 'Hide Storage Inspector ▼' : 'Show Storage Inspector ▶'}
              </button>
              {showStorage ? (
                <>
                  <p>
                    Using {formatBytes(app.usedBytes)} of {formatBytes(app.capBytes)} device
                    storage
                  </p>
                  <p className="tiny">Sessions: {app.sessions.length}</p>
                  <p className="tiny">
                    Chunks: {app.sessions.reduce((sum, session) => sum + session.chunkCount, 0)}
                  </p>
                  {orphans > 0 ? (
                    <p className="warning-text">
                      {orphans} orphaned records{' '}
                      <button
                        className="linkish"
                        onClick={async () => {
                          const result = await sessionStore.cleanupOrphans();
                          setOrphans(0);
                          app.showToast(
                            `Cleaned ${result.removed || 0} orphaned records`,
                            'success'
                          );
                          await app.refresh();
                        }}
                      >
                        Clean Up
                      </button>
                    </p>
                  ) : (
                    <button
                      className="linkish"
                      onClick={async () => {
                        const before = await sessionStore.cleanupOrphans();
                        setOrphans(before.removed || 0);
                        if (!before.removed) {
                          app.showToast('No orphaned records', 'success');
                        }
                      }}
                    >
                      Scan for orphans
                    </button>
                  )}
                </>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
