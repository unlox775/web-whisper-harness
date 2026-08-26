import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sessionStore, type Session, type Chunk } from '../lib/session-store'
import './DeveloperConsole.css'

export default function DeveloperConsole() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'sessions' | 'chunks'>('sessions')
  const [sessions, setSessions] = useState<Session[]>([])
  const [allChunks, setAllChunks] = useState<Chunk[]>([])
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const sessionsResult = await sessionStore.listSessions({ limit: 1000 })
    if ('sessions' in sessionsResult) {
      setSessions(sessionsResult.sessions)
    }

    const statsResult = await sessionStore.getStorageStats()
    if ('usedBytes' in statsResult) {
      setStats(statsResult)
    }

    const chunksArray: Chunk[] = []
    if ('sessions' in sessionsResult) {
      for (const session of sessionsResult.sessions) {
        const chunksResult = await sessionStore.getChunksForSession(session.id)
        if ('chunks' in chunksResult) {
          chunksArray.push(...chunksResult.chunks)
        }
      }
    }
    setAllChunks(chunksArray)
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i]
  }

  return (
    <div className="developer-console">
      <header className="console-header">
        <button className="back-button" onClick={() => navigate('/')} aria-label="Back">
          ← Home
        </button>
        <h1>Developer Console</h1>
      </header>

      <div className="console-tabs">
        <button
          className={`tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
        <button
          className={`tab ${activeTab === 'chunks' ? 'active' : ''}`}
          onClick={() => setActiveTab('chunks')}
        >
          Chunks
        </button>
      </div>

      <main className="console-main">
        {stats && (
          <div className="stats-card card">
            <h3>Storage Stats</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Used</span>
                <span className="stat-value">{formatBytes(stats.usedBytes)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Cap</span>
                <span className="stat-value">{formatBytes(stats.capBytes)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Sessions</span>
                <span className="stat-value">{stats.sessionCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Chunks</span>
                <span className="stat-value">{stats.chunkCount}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="table-card card">
            <h3>Sessions Table ({sessions.length} records)</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Created</th>
                    <th>Duration</th>
                    <th>Chunks</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(session => (
                    <tr key={session.id}>
                      <td className="mono">{session.id}</td>
                      <td>{new Date(session.createdAt).toLocaleString()}</td>
                      <td>{Math.round(session.duration)}s</td>
                      <td>{session.chunkCount}</td>
                      <td>{formatBytes(session.sizeBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'chunks' && (
          <div className="table-card card">
            <h3>Chunks Table ({allChunks.length} records)</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Session</th>
                    <th>Seq</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {allChunks.map(chunk => (
                    <tr key={chunk.id}>
                      <td className="mono">{chunk.id}</td>
                      <td className="mono truncate">{chunk.sessionId}</td>
                      <td>{chunk.seq}</td>
                      <td>{Math.round(chunk.startTime * 10) / 10}s</td>
                      <td>{Math.round(chunk.endTime * 10) / 10}s</td>
                      <td>{formatBytes(chunk.sizeBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
