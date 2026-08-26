import { useState, useEffect } from 'react'
import { theme } from '../theme'
import { sessionStore } from '../packages/sessionStore'
import { formatTimestamp, formatDuration, formatBytes } from '../utils/format'
import { setSetting, type Settings } from '../utils/settings'
import type { Session } from '../packages/types'
import type { Screen } from '../App'
import SettingsModal from '../components/SettingsModal'
import DeveloperConsole from '../components/DeveloperConsole'

interface HomeProps {
  navigate: (screen: Screen, sessionId?: string) => void
  startRecording: (sessionId: string) => void
  settings: Settings
  updateSettings: () => void
}

export default function Home({ navigate, startRecording, settings, updateSettings }: HomeProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [storageUsage, setStorageUsage] = useState({ usedBytes: 0, capBytes: 200 * 1024 * 1024 })
  const [showSettings, setShowSettings] = useState(false)
  const [showDevConsole, setShowDevConsole] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState(settings.onboardingDismissed)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
    loadStorage()
  }, [])

  const loadSessions = async () => {
    const list = await sessionStore.listSessions()
    setSessions(list)
  }

  const loadStorage = async () => {
    const usage = await sessionStore.getStorageUsage()
    setStorageUsage(usage)
  }

  const handleStartRecording = async () => {
    try {
      const { sessionId } = await sessionStore.createSession()
      startRecording(sessionId)
    } catch (error) {
      alert('Failed to start recording: ' + (error as Error).message)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (deleteConfirm === sessionId) {
      await sessionStore.deleteSession(sessionId)
      setDeleteConfirm(null)
      loadSessions()
      loadStorage()
    } else {
      setDeleteConfirm(sessionId)
    }
  }

  const handleDismissOnboarding = () => {
    setSetting('onboardingDismissed', true)
    setOnboardingDismissed(true)
    updateSettings()
  }

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
        justifyContent: 'space-between',
        borderBottom: `1px solid ${theme.colors.border}`,
        zIndex: 10,
      }}>
        <h1 style={{
          margin: 0,
          fontSize: theme.typography.sizes.xl,
          fontWeight: theme.typography.weights.semibold,
        }}>
          Web Whisper
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <div style={{
            backgroundColor: theme.colors.bgCard,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            borderRadius: theme.borderRadius.button,
            fontSize: theme.typography.sizes.sm,
            color: theme.colors.textSecondary,
          }}>
            {formatBytes(storageUsage.usedBytes)} / {formatBytes(storageUsage.capBytes)}
          </div>
          {settings.developerModeEnabled && (
            <button
              onClick={() => setShowDevConsole(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: theme.spacing.sm,
              }}
              aria-label="Developer Console"
            >
              🐞
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.accentPrimary,
              fontSize: theme.typography.sizes.base,
              fontWeight: theme.typography.weights.medium,
              cursor: 'pointer',
              padding: theme.spacing.sm,
            }}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: theme.spacing.lg }}>
        {/* Onboarding Card */}
        {!onboardingDismissed && (
          <div style={{
            backgroundColor: theme.colors.bgCard,
            borderRadius: theme.borderRadius.card,
            border: `1px solid ${theme.colors.border}`,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
              <h2 style={{
                margin: 0,
                fontSize: theme.typography.sizes.lg,
                fontWeight: theme.typography.weights.semibold,
              }}>
                Transcription setup is insanely easy.
              </h2>
              <button
                onClick={handleDismissOnboarding}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.sizes.sm,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Dismiss
              </button>
            </div>
            <p style={{ 
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
              marginTop: theme.spacing.md,
            }}>
              Groq is a separate service (not this app). Their free account takes about a minute to set up, and this app auto-checks your key after you paste it.
            </p>
            <div style={{
              backgroundColor: 'rgba(34, 211, 238, 0.1)',
              border: `1px solid ${theme.colors.accentPrimary}`,
              borderRadius: theme.borderRadius.input,
              padding: theme.spacing.md,
              margin: `${theme.spacing.lg} 0`,
            }}>
              <p style={{ 
                fontSize: theme.typography.sizes.sm,
                margin: 0,
                lineHeight: 1.5,
              }}>
                This uses one of the most amazing AI models. It is a crazy amount of value for free.
              </p>
            </div>
            <ol style={{
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textSecondary,
              lineHeight: 1.8,
              paddingLeft: theme.spacing.lg,
              margin: `${theme.spacing.md} 0`,
            }}>
              <li>Create a free Groq account at console.groq.com</li>
              <li>Open Settings and paste your API key</li>
              <li>We auto-check your key and enable transcription</li>
            </ol>
            <div style={{ display: 'flex', gap: theme.spacing.lg, marginTop: theme.spacing.lg }}>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.colors.accentPrimary,
                  fontSize: theme.typography.sizes.sm,
                  fontWeight: theme.typography.weights.medium,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Open Settings
              </button>
              <a
                href="https://console.groq.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: theme.colors.accentPrimary,
                  fontSize: theme.typography.sizes.sm,
                  fontWeight: theme.typography.weights.medium,
                  textDecoration: 'underline',
                }}
              >
                Get Groq API key
              </a>
            </div>
          </div>
        )}

        {/* CAPTURE Card */}
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
            CAPTURE
          </div>
          <button
            onClick={handleStartRecording}
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
            Start recording
          </button>
          <div style={{
            fontSize: theme.typography.sizes.sm,
            color: theme.colors.textSecondary,
            textAlign: 'center',
            marginTop: theme.spacing.md,
          }}>
            Recorder idle — tap start to begin a durable session.
          </div>
        </div>

        {/* Session List */}
        <div style={{
          backgroundColor: theme.colors.bgCard,
          borderRadius: theme.borderRadius.card,
          border: `1px solid ${theme.colors.border}`,
          minHeight: '200px',
        }}>
          {sessions.length === 0 ? (
            <div style={{ padding: theme.spacing.xxl, textAlign: 'center', color: theme.colors.textSecondary }}>
              {/* Empty state - no text per spec */}
            </div>
          ) : (
            <div style={{ padding: theme.spacing.md }}>
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  style={{
                    backgroundColor: theme.colors.bgCard,
                    borderRadius: theme.borderRadius.card,
                    border: `1px solid ${theme.colors.border}`,
                    padding: theme.spacing.lg,
                    marginBottom: theme.spacing.md,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (!target.closest('button')) {
                      navigate('sessionDetail', session.sessionId)
                    }
                  }}
                >
                  <div style={{
                    fontSize: theme.typography.sizes.md,
                    fontWeight: theme.typography.weights.semibold,
                    marginBottom: theme.spacing.sm,
                  }}>
                    {formatTimestamp(session.timestamp)}
                  </div>
                  <div style={{
                    fontSize: theme.typography.sizes.sm,
                    color: theme.colors.textSecondary,
                    marginBottom: theme.spacing.md,
                  }}>
                    {formatDuration(session.duration)}
                  </div>
                  <div style={{ display: 'flex', gap: theme.spacing.lg, justifyContent: 'space-between' }}>
                    <button
                      onClick={() => navigate('sessionDetail', session.sessionId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: theme.colors.accentPrimary,
                        fontSize: theme.typography.sizes.base,
                        fontWeight: theme.typography.weights.medium,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Play
                    </button>
                    <button
                      onClick={() => handleDeleteSession(session.sessionId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: deleteConfirm === session.sessionId ? theme.colors.error : theme.colors.textSecondary,
                        fontSize: theme.typography.sizes.base,
                        fontWeight: theme.typography.weights.medium,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {deleteConfirm === session.sessionId ? 'Confirm Delete?' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => {
            setShowSettings(false)
            updateSettings()
            loadStorage()
          }}
        />
      )}
      {showDevConsole && (
        <DeveloperConsole onClose={() => setShowDevConsole(false)} />
      )}
    </div>
  )
}
