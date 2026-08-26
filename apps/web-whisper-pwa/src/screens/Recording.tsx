import { useState, useEffect, useRef } from 'react'
import { theme } from '../theme'
import { captureEngine } from '../packages/captureEngine'
import { formatDuration } from '../utils/format'
import type { CaptureHandle } from '../packages/types'

interface RecordingProps {
  sessionId: string
  onStop: (sessionId: string) => void
  developerMode: boolean
}

export default function Recording({ sessionId, onStop, developerMode }: RecordingProps) {
  const [duration, setDuration] = useState(0)
  const [chunkCount, setChunkCount] = useState(0)
  const handleRef = useRef<CaptureHandle | null>(null)
  const intervalRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    startCapture()
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const startCapture = async () => {
    try {
      const handle = await captureEngine.startCapture(
        sessionId,
        () => {
          setChunkCount(prev => prev + 1)
        }
      )
      handleRef.current = handle
      
      // Update duration counter
      intervalRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000
        setDuration(elapsed)
      }, 100)
    } catch (error) {
      alert('Microphone permission denied or error: ' + (error as Error).message)
      onStop(sessionId)
    }
  }

  const handleStop = async () => {
    if (handleRef.current) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      try {
        await handleRef.current.stop()
        onStop(sessionId)
      } catch (error) {
        console.error('Failed to stop recording:', error)
        onStop(sessionId)
      }
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.bgPrimary,
    }}>
      {/* Recording Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xxl,
      }}>
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: theme.colors.accentPrimary,
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: theme.typography.sizes.sm,
          color: theme.colors.textSecondary,
        }}>
          Recording
        </span>
      </div>

      {/* Duration Counter */}
      <div style={{
        fontSize: theme.typography.sizes.xxl,
        fontWeight: theme.typography.weights.bold,
        marginBottom: theme.spacing.xxl,
      }}>
        {formatDuration(duration)}
      </div>

      {/* Developer Info */}
      {developerMode && (
        <div style={{
          fontSize: theme.typography.sizes.sm,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.xl,
        }}>
          {chunkCount} chunks
        </div>
      )}

      {/* Stop Button */}
      <button
        onClick={handleStop}
        style={{
          backgroundColor: theme.colors.error,
          border: 'none',
          borderRadius: theme.borderRadius.button,
          padding: '16px 48px',
          fontSize: theme.typography.sizes.md,
          fontWeight: theme.typography.weights.semibold,
          color: theme.colors.textPrimary,
          cursor: 'pointer',
          minHeight: '56px',
          minWidth: '80%',
        }}
      >
        Stop Recording
      </button>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  )
}
