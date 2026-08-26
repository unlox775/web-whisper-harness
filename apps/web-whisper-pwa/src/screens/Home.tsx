import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as sessionStore from '@session-store'
import './Home.css'

interface Session {
  id: string
  createdAt: string
  duration: number
  chunkCount: number
  sizeBytes: number
  hasVolumeProfile: boolean
  hasSnips: boolean
  hasTranscript: boolean
}

interface StorageStats {
  usedBytes: number
  capBytes: number
  sessionCount: number
  chunkCount: number
}

export default function Home() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('onboarding_dismissed') !== 'true'
  })
  const [developerMode] = useState(() => {
    return localStorage.getItem('developer_mode') === 'true'
  })

  useEffect(() => {
    sessionStore.init()
    loadSessions()
    loadStats()
  }, [])

  async function loadSessions() {
    const result = await sessionStore.listSessions({ limit: 100, offset: 0 })
    if ('sessions' in result) {
      setSessions(result.sessions)
    }
  }

  async function loadStats() {
    const result = await sessionStore.getStorageStats()
    if ('usedBytes' in result) {
      setStats(result)
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i]
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  async function handleStartRecording() {
    const result = await sessionStore.createSession()
    if ('id' in result) {
      navigate(`/record/${result.id}`)
    }
  }

  function handleOpenSession(sessionId: string) {
    navigate(`/session/${sessionId}`)
  }

  function dismissOnboarding() {
    localStorage.setItem('onboarding_dismissed', 'true')
    setShowOnboarding(false)
  }

  return (
    <div className="home">
      <header className="home-header">
        <h1 className="home-title">Web Whisper</h1>
        <div className="home-header-actions">
          {stats && (
            <div className="storage-chip">
              <span className="storage-label">DATA</span>
              <span className="storage-value">
                {formatBytes(stats.usedBytes)} / {formatBytes(stats.capBytes)}
              </span>
            </div>
          )}
          {developerMode && (
            <button className="icon-button" onClick={() => navigate('/developer')} aria-label="Developer Console">
              🐞
            </button>
          )}
          <button className="text-button" onClick={() => navigate('/settings')}>
            Settings
          </button>
        </div>
      </header>

      <main className="home-main">
        {showOnboarding && (
          <div className="onboarding-card card">
            <button className="dismiss-button" onClick={dismissOnboarding} aria-label="Dismiss">
              ×
            </button>
            <h2>Transcription setup is insanely easy.</h2>
            <p>
              Groq is a separate service (not this app). Their free account takes about a minute to set up,
              and this app auto-checks your key after you paste it. Recording works out of the box without transcription.
            </p>
            <div className="highlight-box">
              <p>
                This uses one of the most amazing AI models. It is a crazy amount of value for free.
              </p>
            </div>
            <ol>
              <li>Create a free Groq account at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer">console.groq.com</a></li>
              <li>Open Settings (top right), paste your API key</li>
              <li>We auto-check the key and enable transcription</li>
            </ol>
            <div className="onboarding-actions">
              <button className="link-button" onClick={() => navigate('/settings')}>
                Open Settings
              </button>
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="link-button">
                Get Groq API key
              </a>
            </div>
          </div>
        )}

        <div className="capture-card card">
          <h3 className="card-label">CAPTURE</h3>
          <button className="start-recording-button" onClick={handleStartRecording}>
            Start recording
          </button>
          <p className="status-text">Recorder idle — tap start to begin a durable session.</p>
        </div>

        <div className="sessions-card card">
          {sessions.length === 0 ? (
            <div className="empty-sessions"></div>
          ) : (
            <div className="sessions-list">
              {sessions.map(session => (
                <button
                  key={session.id}
                  className="session-card"
                  onClick={() => handleOpenSession(session.id)}
                >
                  <div className="session-header">
                    <span className="session-time">
                      {new Date(session.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="session-meta">
                    <span>{formatDuration(session.duration)}</span>
                    <span>{formatBytes(session.sizeBytes)}</span>
                    <span>{session.chunkCount} chunks</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
