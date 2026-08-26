import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { captureEngine, type CaptureHandle } from '../lib/capture-engine'
import './Record.css'

export default function Record() {
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [duration, setDuration] = useState(0)
  const [chunksEncoded, setChunksEncoded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<CaptureHandle | null>(null)
  const [developerMode] = useState(() => localStorage.getItem('developer_mode') === 'true')

  useEffect(() => {
    if (!sessionId) {
      navigate('/')
      return
    }

    startCapture()

    return () => {
      if (handleRef.current) {
        handleRef.current.stop()
      }
    }
  }, [sessionId])

  async function startCapture() {
    try {
      const handle = await captureEngine.startCapture(sessionId!)
      handleRef.current = handle

      handle.on('chunkEncoded', (_data: any) => {
        setChunksEncoded(prev => prev + 1)
      })

      handle.on('captureError', (data: any) => {
        setError(data.reason)
      })

      const interval = setInterval(() => {
        if (handleRef.current) {
          const status = handleRef.current.getStatus()
          setDuration(status.currentDuration)
        }
      }, 100)

      return () => clearInterval(interval)
    } catch (error: any) {
      if (error.message === 'permission_denied') {
        setError('Microphone permission denied. Please allow microphone access in your browser settings.')
      } else {
        setError('Failed to start recording: ' + error.message)
      }
    }
  }

  async function handleStop() {
    if (!handleRef.current) return

    const result = await handleRef.current.stop()
    
    if (result.hasAudio) {
      navigate(`/session/${result.sessionId}`)
    } else {
      navigate('/')
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (error) {
    return (
      <div className="record">
        <div className="record-error">
          <h2>Recording Error</h2>
          <p>{error}</p>
          <button className="primary-button" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="record">
      <div className="record-container">
        <div className="recording-indicator">
          <div className="pulse-dot"></div>
          <span>Recording</span>
        </div>

        <div className="duration-display">
          {formatDuration(duration)}
        </div>

        {developerMode && (
          <div className="developer-info">
            <div className="info-row">
              <span>Chunks:</span>
              <span>{chunksEncoded}</span>
            </div>
            <div className="info-row">
              <span>Status:</span>
              <span>Active</span>
            </div>
          </div>
        )}

        <button className="stop-button" onClick={handleStop}>
          Stop Recording
        </button>
      </div>
    </div>
  )
}
