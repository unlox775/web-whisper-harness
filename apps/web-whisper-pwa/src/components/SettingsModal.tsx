import { useState, useEffect } from 'react'
import { theme } from '../theme'
import { transcriptionClient } from '../packages/transcriptionClient'
import { setSetting, type Settings } from '../utils/settings'

interface SettingsModalProps {
  settings: Settings
  onClose: () => void
}

export default function SettingsModal({ settings, onClose }: SettingsModalProps) {
  const [groqApiKey, setGroqApiKey] = useState(settings.groqApiKey)
  const [storageCapMB, setStorageCapMB] = useState(settings.storageCapMB)
  const [developerMode, setDeveloperMode] = useState(settings.developerModeEnabled)
  const [keyStatus, setKeyStatus] = useState<'missing' | 'valid' | 'invalid'>('missing')
  const [validating, setValidating] = useState(false)

  useEffect(() => {
    if (groqApiKey) {
      validateKey(groqApiKey)
    }
  }, [])

  const validateKey = async (key: string) => {
    if (!key || key.trim() === '') {
      setKeyStatus('missing')
      return
    }

    setValidating(true)
    try {
      const result = await transcriptionClient.validateKey(key)
      setKeyStatus(result.valid ? 'valid' : 'invalid')
    } catch (error) {
      setKeyStatus('invalid')
    } finally {
      setValidating(false)
    }
  }

  const handleKeyBlur = async () => {
    await validateKey(groqApiKey)
    if (keyStatus === 'valid') {
      setSetting('groqApiKey', groqApiKey)
    }
  }

  const handleRecheck = async () => {
    await validateKey(groqApiKey)
  }

  const handleStorageCapChange = (value: string) => {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num > 0) {
      setStorageCapMB(num)
    }
  }

  const handleStorageCapBlur = () => {
    setSetting('storageCapMB', storageCapMB)
  }

  const handleDeveloperModeChange = (checked: boolean) => {
    setDeveloperMode(checked)
    setSetting('developerModeEnabled', checked)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'flex-end',
      zIndex: 1000,
    }}>
      <div style={{
        width: '100%',
        maxHeight: '90vh',
        backgroundColor: theme.colors.bgCard,
        borderRadius: `${theme.borderRadius.card} ${theme.borderRadius.card} 0 0`,
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky',
          top: 0,
          backgroundColor: theme.colors.bgCard,
          padding: theme.spacing.lg,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          <h2 style={{
            margin: 0,
            fontSize: theme.typography.sizes.xl,
            fontWeight: theme.typography.weights.semibold,
          }}>
            Settings
          </h2>
          <button
            onClick={onClose}
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
            Close
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: theme.spacing.lg }}>
          {/* Transcription Section */}
          <div style={{ marginBottom: theme.spacing.xxl }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: theme.spacing.md,
            }}>
              <h3 style={{
                margin: 0,
                fontSize: theme.typography.sizes.lg,
                fontWeight: theme.typography.weights.semibold,
              }}>
                Transcription
              </h3>
              <div style={{
                backgroundColor: keyStatus === 'valid' ? theme.colors.accentPrimary : theme.colors.textSecondary,
                color: theme.colors.textPrimary,
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                borderRadius: theme.borderRadius.button,
                fontSize: theme.typography.sizes.xs,
                fontWeight: theme.typography.weights.semibold,
              }}>
                {keyStatus === 'valid' ? 'ENABLE' : 'DISABLED'}
              </div>
            </div>

            <p style={{
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
            }}>
              Groq is a separate service (not this app). Their free account takes about a minute to set up, and this app auto-checks your key after you paste it. <a
                href="https://console.groq.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.colors.accentPrimary, textDecoration: 'underline' }}
              >
                It's easy to set up.
              </a>
            </p>

            <ol style={{
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textSecondary,
              lineHeight: 1.8,
              paddingLeft: theme.spacing.lg,
              margin: `${theme.spacing.md} 0`,
            }}>
              <li>Create a free Groq account at console.groq.com</li>
              <li>Paste the key here</li>
              <li>Transcription turns on after validation</li>
            </ol>

            <div style={{ marginTop: theme.spacing.lg }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.sizes.sm,
                color: theme.colors.textSecondary,
                marginBottom: theme.spacing.sm,
              }}>
                Groq API key
              </label>
              <input
                type="password"
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                onBlur={handleKeyBlur}
                placeholder="gsk-..."
                style={{
                  width: '100%',
                  backgroundColor: theme.colors.bgPrimary,
                  color: theme.colors.textPrimary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.input,
                  padding: theme.spacing.md,
                  fontSize: theme.typography.sizes.base,
                  fontFamily: 'monospace',
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: theme.spacing.sm,
              }}>
                <span style={{
                  fontSize: theme.typography.sizes.xs,
                  color: keyStatus === 'valid' ? theme.colors.success : keyStatus === 'invalid' ? theme.colors.error : theme.colors.textSecondary,
                }}>
                  Key status: {keyStatus === 'missing' ? 'Missing' : keyStatus === 'valid' ? 'Valid' : 'Invalid'}
                </span>
                <button
                  onClick={handleRecheck}
                  disabled={validating}
                  style={{
                    backgroundColor: theme.colors.bgPrimary,
                    color: theme.colors.textPrimary,
                    border: 'none',
                    borderRadius: theme.borderRadius.button,
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    fontSize: theme.typography.sizes.xs,
                    cursor: validating ? 'not-allowed' : 'pointer',
                    opacity: validating ? 0.5 : 1,
                  }}
                >
                  {validating ? 'Checking...' : 'Recheck key'}
                </button>
              </div>
            </div>

            <p style={{
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
              marginTop: theme.spacing.lg,
            }}>
              Need a key? <a
                href="https://console.groq.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.colors.accentPrimary, textDecoration: 'underline' }}
              >
                Create one in Groq Console
              </a>. Groq is a separate service with its own pricing. <a
                href="https://groq.com/pricing"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.colors.accentPrimary, textDecoration: 'underline' }}
              >
                See Groq pricing
              </a>.
            </p>
          </div>

          {/* App Section */}
          <div>
            <h3 style={{
              margin: 0,
              fontSize: theme.typography.sizes.lg,
              fontWeight: theme.typography.weights.semibold,
              marginBottom: theme.spacing.lg,
            }}>
              App
            </h3>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.lg,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={developerMode}
                onChange={(e) => handleDeveloperModeChange(e.target.checked)}
                style={{
                  width: '20px',
                  height: '20px',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: theme.typography.sizes.base }}>
                Enable developer mode
              </span>
            </label>

            <div>
              <label style={{
                display: 'block',
                fontSize: theme.typography.sizes.sm,
                color: theme.colors.textSecondary,
                marginBottom: theme.spacing.sm,
              }}>
                Storage cap (MB)
              </label>
              <input
                type="number"
                value={storageCapMB}
                onChange={(e) => handleStorageCapChange(e.target.value)}
                onBlur={handleStorageCapBlur}
                style={{
                  width: '120px',
                  backgroundColor: theme.colors.bgPrimary,
                  color: theme.colors.textPrimary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.input,
                  padding: theme.spacing.md,
                  fontSize: theme.typography.sizes.base,
                }}
              />
              <p style={{
                fontSize: theme.typography.sizes.xs,
                color: theme.colors.textSecondary,
                marginTop: theme.spacing.sm,
              }}>
                Maximum storage for session data. Old sessions will be deleted when this limit is reached.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
