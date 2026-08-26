import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { sessionStore, type Session, type Chunk } from '../lib/session-store'
import { playbackEngine, type PlaybackHandle } from '../lib/playback-engine'
import './SessionDetail.css'

export default function SessionDetail() {
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const playbackHandleRef = useRef<PlaybackHandle | null>(null)
  const [developerMode] = useState(() => localStorage.getItem('developer_mode') === 'true')

  useEffect(() => {
    if (!sessionId) {
      navigate('/')
      return
    }

    loadSession()

    return () => {
      if (playbackHandleRef.current) {
        playbackHandleRef.current.stop()
      }
    }
  }, [sessionId])

  async function loadSession() {
    const result = await sessionStore.getSession(sessionId!)
    if (!result || 'error' in result) {
      navigate('/')
      return
    }
    setSession(result)

    const chunksResult = await sessionStore.getChunksForSession(sessionId!)
    if ('chunks' in chunksResult) {
      setChunks(chunksResult.chunks)
    }
  }

  async function handlePlay() {
    if (playbackState === 'paused' && playbackHandleRef.current) {
      playbackHandleRef.current.resume()
      return
    }

    const result = await playbackEngine.playSession(sessionId!)
    if ('error' in result) {
      alert('Playback failed: ' + result.error)
      return
    }

    const handle = result
    playbackHandleRef.current = handle
    setDuration(handle.duration)

    handle.on('playing', () => {
      setPlaybackState('playing')
    })

    handle.on('paused', () => {
      setPlaybackState('paused')
    })

    handle.on('timeupdate', (data: any) => {
      setCurrentTime(data.currentTime)
    })

    handle.on('ended', () => {
      setPlaybackState('idle')
      setCurrentTime(0)
      playbackHandleRef.current = null
    })

    handle.on('stopped', () => {
      setPlaybackState('idle')
      setCurrentTime(0)
      playbackHandleRef.current = null
    })

    handle.on('playbackError', (data: any) => {
      alert('Playback error: ' + data.reason)
      setPlaybackState('idle')
      playbackHandleRef.current = null
    })
  }

  function handlePause() {
    if (playbackHandleRef.current) {
      playbackHandleRef.current.pause()
    }
  }

  function handleStop() {
    if (playbackHandleRef.current) {
      playbackHandleRef.current.stop()
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this recording? This cannot be undone.')) {
      return
    }

    const result = await sessionStore.deleteSession(sessionId!)
    if ('deleted' in result) {
      navigate('/')
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i]
  }

  if (!session) {
    return (
      <div className="session-detail">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="session-detail">
      <header className="detail-header">
        <button className="back-button" onClick={() => navigate('/')} aria-label="Back">
          ← Session List
        </button>
      </header>

      <main className="detail-main">
        <div className="session-info card">
          <h2>Session Detail</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Created</span>
              <span className="info-value">{new Date(session.createdAt).toLocaleString()}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Duration</span>
              <span className="info-value">{formatDuration(session.duration)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Size</span>
              <span className="info-value">{formatBytes(session.sizeBytes)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Chunks</span>
              <span className="info-value">{session.chunkCount}</span>
            </div>
          </div>
        </div>

        <div className="playback-card card">
          <h3>Playback</h3>
          
          {playbackState !== 'idle' && (
            <div className="playback-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="time-display">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </div>
            </div>
          )}

          <div className="playback-controls">
            {playbackState === 'idle' && (
              <button className="control-button primary" onClick={handlePlay}>
                ▶ Play Session
              </button>
            )}
            {playbackState === 'playing' && (
              <>
                <button className="control-button" onClick={handlePause}>
                  ⏸ Pause
                </button>
                <button className="control-button" onClick={handleStop}>
                  ⏹ Stop
                </button>
              </>
            )}
            {playbackState === 'paused' && (
              <>
                <button className="control-button" onClick={handlePlay}>
                  ▶ Resume
                </button>
                <button className="control-button" onClick={handleStop}>
                  ⏹ Stop
                </button>
              </>
            )}
          </div>
        </div>

        {developerMode && chunks.length > 0 && (
          <div className="chunks-card card">
            <h3>Chunks ({chunks.length})</h3>
            <div className="chunks-list">
              {chunks.map(chunk => (
                <div key={chunk.id} className="chunk-item">
                  <span className="chunk-seq">#{chunk.seq}</span>
                  <span className="chunk-time">{formatDuration(chunk.startTime)} - {formatDuration(chunk.endTime)}</span>
                  <span className="chunk-size">{formatBytes(chunk.sizeBytes)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="actions-card card">
          <button className="delete-button" onClick={handleDelete}>
            Delete Session
          </button>
        </div>
      </main>
    </div>
  )
}
