import { useState, useEffect, useRef } from 'react'
import { theme } from '../theme'
import * as sessionStore from '@web-whisper/session-store'
import * as playbackEngine from '@web-whisper/playback-engine'
import * as volumeAnalyzer from '@web-whisper/volume-analyzer'
import * as transcriptionClient from '@web-whisper/transcription-client'
import type { Session, Chunk, Snip, Transcript } from '@web-whisper/session-store'
import type { PlaybackHandle } from '@web-whisper/playback-engine'
import { formatDuration, formatTimestamp, formatBytes } from '../utils/format'
import type { Screen } from '../App'
import type { Settings } from '../utils/settings'

interface SessionDetailProps {
  sessionId: string
  navigate: (screen: Screen) => void
  settings: Settings
  updateSettings: () => void
}

export default function SessionDetail({ sessionId, navigate, settings }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [snips, setSnips] = useState<Snip[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState({ current: 0, total: 0 })
  const [showChunks, setShowChunks] = useState(false)
  const [showSnips, setShowSnips] = useState(false)
  const [playbackRef] = useState<{ current: PlaybackHandle | null }>({ current: null })

  useEffect(() => {
    loadSession()
    return () => {
      if (playbackRef.current) {
        playbackRef.current.destroy()
      }
    }
  }, [sessionId])

  const loadSession = async () => {
    const s = await sessionStore.getSession(sessionId)
    if (s) {
      setSession(s)
      const c = await sessionStore.getChunksForSession(sessionId)
      setChunks(c)
      const sn = await sessionStore.getSnipsForSession(sessionId)
      setSnips(sn)
      const t = await sessionStore.getTranscriptsForSession(sessionId)
      setTranscripts(t)
    }
  }

  const handlePlay = async () => {
    if (playing) {
      playbackRef.current?.pause()
      setPlaying(false)
    } else {
      if (!playbackRef.current) {
        const controller = await playbackEngine.playSession(sessionId)
        playbackRef.current = controller
        
        controller.onTimeUpdate((time) => {
          setCurrentTime(time)
        })
        
        controller.onEnded(() => {
          setPlaying(false)
          setCurrentTime(0)
        })
        
        setDuration(controller.getDuration())
      }
      
      playbackRef.current.play()
      setPlaying(true)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    playbackRef.current?.seek(newTime)
  }

  const handleTranscribe = async () => {
    if (!settings.groqApiKey) {
      alert('Please add a Groq API key in Settings')
      return
    }

    setTranscribing(true)
    setTranscriptionProgress({ current: 0, total: 0 })

    try {
      // First, analyze volume and create snips if not already done
      let snipList = snips
      if (snipList.length === 0) {
        // Analyze volume and propose snips
        await volumeAnalyzer.analyzeVolume(sessionId)
        const result = await volumeAnalyzer.proposeSnips(sessionId)
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to propose snips')
        }
        
        snipList = await sessionStore.getSnipsForSession(sessionId)
        setSnips(snipList)
      }

      setTranscriptionProgress({ current: 0, total: snipList.length })

      // Transcribe each snip
      for (let i = 0; i < snipList.length; i++) {
        const snip = snipList[i]
        setTranscriptionProgress({ current: i, total: snipList.length })
        
        try {
          const result = await transcriptionClient.transcribeAudio(new Blob(), settings.groqApiKey)
          if (result.text) {
            await sessionStore.writeTranscript(snip.snipId, result.text, result.language)
          }
        } catch (error) {
          console.error('Failed to transcribe snip:', error)
        }
      }

      // Reload transcripts
      const t = await sessionStore.getTranscriptsForSession(sessionId)
      setTranscripts(t)
    } catch (error) {
      alert('Transcription failed: ' + (error as Error).message)
    } finally {
      setTranscribing(false)
      setTranscriptionProgress({ current: 0, total: 0 })
    }
  }

  const handleCopyTranscript = async () => {
    const fullText = transcripts.map(t => t.text).join(' ')
    try {
      await navigator.clipboard.writeText(fullText)
      alert('Copied!')
    } catch (error) {
      alert('Failed to copy: ' + (error as Error).message)
    }
  }

  const handleDelete = async () => {
    if (confirm('Delete this session? This cannot be undone.')) {
      await sessionStore.deleteSession(sessionId)
      navigate('home')
    }
  }

  if (!session) {
    return <div style={{ padding: theme.spacing.lg }}>Loading...</div>
  }

  const transcriptionEnabled = settings.groqApiKey && settings.groqApiKey.trim() !== ''
  const hasTranscripts = transcripts.length > 0

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '32px' }}>
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        backgroundColor: theme.colors.bgPrimary,
        padding: `max(${theme.spacing.lg}, env(safe-area-inset-top)) ${theme.spacing.lg} ${theme.spacing.lg}`,
        display: 'flex',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.colors.border}`,
        zIndex: 10,
      }}>
        <button
          onClick={() => navigate('home')}
          style={{
            background: 'none',
            border: 'none',
            color: theme.colors.accentPrimary,
            fontSize: theme.typography.sizes.md,
            fontWeight: theme.typography.weights.medium,
            cursor: 'pointer',
            padding: 0,
            marginRight: theme.spacing.md,
          }}
        >
          ← Sessions
        </button>
        <h1 style={{
          margin: 0,
          fontSize: theme.typography.sizes.lg,
          fontWeight: theme.typography.weights.semibold,
        }}>
          {formatTimestamp(session.timestamp)}
        </h1>
      </div>

      {/* Main Content */}
      <div style={{ padding: theme.spacing.lg }}>
        {/* Metadata */}
        <div style={{
          backgroundColor: theme.colors.bgCard,
          borderRadius: theme.borderRadius.card,
          border: `1px solid ${theme.colors.border}`,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
        }}>
          <div style={{ marginBottom: theme.spacing.sm }}>
            <span style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Duration: </span>
            <span style={{ fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.semibold }}>
              {formatDuration(session.duration)}
            </span>
          </div>
          {session.status === 'no-audio' && (
            <div style={{ color: theme.colors.error, fontSize: theme.typography.sizes.sm }}>
              Status: Completed without playable audio
            </div>
          )}
        </div>

        {/* Playback */}
        <div style={{
          backgroundColor: theme.colors.bgCard,
          borderRadius: theme.borderRadius.card,
          border: `1px solid ${theme.colors.border}`,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
        }}>
          <div style={{
            fontSize: theme.typography.sizes.xs,
            color: theme.colors.textSecondary,
            fontWeight: theme.typography.weights.semibold,
            letterSpacing: '0.05em',
            marginBottom: theme.spacing.md,
          }}>
            PLAYBACK
          </div>
          {session.hasAudio ? (
            <>
              {!playing && !playbackRef.current ? (
                <button
                  onClick={handlePlay}
                  style={{
                    width: '100%',
                    background: `linear-gradient(90deg, ${theme.colors.accentPrimary} 0%, #3b82f6 100%)`,
                    border: 'none',
                    borderRadius: theme.borderRadius.button,
                    padding: '14px 24px',
                    fontSize: theme.typography.sizes.md,
                    fontWeight: theme.typography.weights.semibold,
                    color: theme.colors.textPrimary,
                    cursor: 'pointer',
                    minHeight: theme.touchTarget.min,
                  }}
                >
                  Play Session
                </button>
              ) : (
                <div>
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    value={currentTime}
                    onChange={handleSeek}
                    style={{
                      width: '100%',
                      marginBottom: theme.spacing.sm,
                    }}
                  />
                  <div style={{
                    fontSize: theme.typography.sizes.sm,
                    color: theme.colors.textSecondary,
                    marginBottom: theme.spacing.md,
                  }}>
                    {formatDuration(currentTime)} / {formatDuration(duration)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: theme.spacing.lg }}>
                    <button
                      onClick={() => playbackRef.current?.seek(Math.max(0, currentTime - 15))}
                      style={{
                        background: 'none',
                        border: `1px solid ${theme.colors.textSecondary}`,
                        borderRadius: '50%',
                        width: '44px',
                        height: '44px',
                        color: theme.colors.textSecondary,
                        cursor: 'pointer',
                      }}
                    >
                      ‹15
                    </button>
                    <button
                      onClick={handlePlay}
                      style={{
                        background: theme.colors.accentPrimary,
                        border: 'none',
                        borderRadius: '50%',
                        width: '48px',
                        height: '48px',
                        color: theme.colors.textPrimary,
                        fontSize: '24px',
                        cursor: 'pointer',
                      }}
                    >
                      {playing ? '⏸' : '▶'}
                    </button>
                    <button
                      onClick={() => playbackRef.current?.seek(Math.min(duration, currentTime + 15))}
                      style={{
                        background: 'none',
                        border: `1px solid ${theme.colors.textSecondary}`,
                        borderRadius: '50%',
                        width: '44px',
                        height: '44px',
                        color: theme.colors.textSecondary,
                        cursor: 'pointer',
                      }}
                    >
                      15›
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>
              This session has no playable audio.
            </div>
          )}
        </div>

        {/* Transcription */}
        <div style={{
          backgroundColor: theme.colors.bgCard,
          borderRadius: theme.borderRadius.card,
          border: `1px solid ${theme.colors.border}`,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
        }}>
          <div style={{
            fontSize: theme.typography.sizes.xs,
            color: theme.colors.textSecondary,
            fontWeight: theme.typography.weights.semibold,
            letterSpacing: '0.05em',
            marginBottom: theme.spacing.md,
          }}>
            TRANSCRIPTION
          </div>
          {!transcriptionEnabled ? (
            <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
              Transcription disabled. Add API key in Settings.
            </div>
          ) : hasTranscripts ? (
            <div>
              <div style={{
                fontSize: theme.typography.sizes.base,
                lineHeight: 1.5,
                marginBottom: theme.spacing.lg,
                maxHeight: '50vh',
                overflowY: 'auto',
              }}>
                {transcripts.map((t) => (
                  <p key={t.transcriptId} style={{ margin: `${theme.spacing.md} 0` }}>
                    {t.text}
                  </p>
                ))}
              </div>
              <button
                onClick={handleCopyTranscript}
                style={{
                  width: '100%',
                  background: 'none',
                  border: `1px solid ${theme.colors.accentPrimary}`,
                  borderRadius: theme.borderRadius.button,
                  padding: '12px 24px',
                  fontSize: theme.typography.sizes.base,
                  fontWeight: theme.typography.weights.medium,
                  color: theme.colors.textPrimary,
                  cursor: 'pointer',
                  minHeight: theme.touchTarget.min,
                }}
              >
                Copy Transcript
              </button>
            </div>
          ) : transcribing ? (
            <div>
              <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
                Transcribing... {transcriptionProgress.current} / {transcriptionProgress.total} snips
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: theme.colors.bgPrimary,
                borderRadius: '4px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(transcriptionProgress.current / transcriptionProgress.total) * 100}%`,
                  height: '100%',
                  backgroundColor: theme.colors.accentPrimary,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ) : (
            <button
              onClick={handleTranscribe}
              style={{
                width: '100%',
                background: `linear-gradient(90deg, ${theme.colors.accentPrimary} 0%, #3b82f6 100%)`,
                border: 'none',
                borderRadius: theme.borderRadius.button,
                padding: '14px 24px',
                fontSize: theme.typography.sizes.md,
                fontWeight: theme.typography.weights.semibold,
                color: theme.colors.textPrimary,
                cursor: 'pointer',
                minHeight: theme.touchTarget.min,
              }}
            >
              Transcribe Session
            </button>
          )}
        </div>

        {/* Developer Mode - Chunks */}
        {settings.developerModeEnabled && (
          <div style={{
            backgroundColor: theme.colors.bgCard,
            borderRadius: theme.borderRadius.card,
            border: `1px solid ${theme.colors.border}`,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
          }}>
            <button
              onClick={() => setShowChunks(!showChunks)}
              style={{
                background: 'none',
                border: 'none',
                color: theme.colors.textSecondary,
                fontSize: theme.typography.sizes.xs,
                fontWeight: theme.typography.weights.semibold,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                padding: 0,
                marginBottom: theme.spacing.md,
              }}
            >
              CHUNKS (Developer Mode) {showChunks ? '▼' : '▶'}
            </button>
            {showChunks && (
              <div style={{ fontSize: theme.typography.sizes.sm }}>
                {chunks.map((chunk) => (
                  <div key={chunk.chunkId} style={{
                    padding: theme.spacing.sm,
                    borderBottom: `1px solid ${theme.colors.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.xs }}>
                        {chunk.chunkId}
                      </div>
                      <div>
                        {formatDuration(chunk.startTime)} · {chunk.duration.toFixed(2)}s · {formatBytes(chunk.byteSize)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Developer Mode - Snips */}
        {settings.developerModeEnabled && snips.length > 0 && (
          <div style={{
            backgroundColor: theme.colors.bgCard,
            borderRadius: theme.borderRadius.card,
            border: `1px solid ${theme.colors.border}`,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
          }}>
            <button
              onClick={() => setShowSnips(!showSnips)}
              style={{
                background: 'none',
                border: 'none',
                color: theme.colors.textSecondary,
                fontSize: theme.typography.sizes.xs,
                fontWeight: theme.typography.weights.semibold,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                padding: 0,
                marginBottom: theme.spacing.md,
              }}
            >
              SNIPS (Developer Mode) {showSnips ? '▼' : '▶'}
            </button>
            {showSnips && (
              <div style={{ fontSize: theme.typography.sizes.sm }}>
                {snips.map((snip) => {
                  const transcript = transcripts.find(t => t.snipId === snip.snipId)
                  return (
                    <div key={snip.snipId} style={{
                      padding: theme.spacing.sm,
                      borderBottom: `1px solid ${theme.colors.border}`,
                    }}>
                      <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.xs }}>
                        {snip.snipId}
                      </div>
                      <div>
                        {formatDuration(snip.startTime)} – {formatDuration(snip.endTime)} · {formatDuration(snip.duration)}
                      </div>
                      {transcript && (
                        <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.xs, marginTop: theme.spacing.xs }}>
                          {transcript.text.substring(0, 50)}...
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: theme.spacing.lg,
        }}>
          <button
            onClick={handleDelete}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.error,
              fontSize: theme.typography.sizes.base,
              fontWeight: theme.typography.weights.medium,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Delete Session
          </button>
        </div>
      </div>
    </div>
  )
}
