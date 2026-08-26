import { useState, useEffect } from 'react'
import { theme } from '../theme'
import { sessionStore } from '../packages/sessionStore'
import { formatBytes } from '../utils/format'

interface DeveloperConsoleProps {
  onClose: () => void
}

type TableName = 'sessions' | 'chunks' | 'volumeProfiles' | 'snips' | 'transcripts'

export default function DeveloperConsole({ onClose }: DeveloperConsoleProps) {
  const [activeTab, setActiveTab] = useState<'indexeddb' | 'logs'>('indexeddb')
  const [selectedTable, setSelectedTable] = useState<TableName>('sessions')
  const [data, setData] = useState<any[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [storageUsage, setStorageUsage] = useState({ usedBytes: 0, capBytes: 0 })

  useEffect(() => {
    loadData()
    loadStorage()
  }, [selectedTable])

  const loadData = async () => {
    // For simplicity, we'll load data from sessionStore
    // In production, would have direct IndexedDB access
    if (selectedTable === 'sessions') {
      const sessions = await sessionStore.listSessions()
      setData(sessions)
    } else if (selectedTable === 'chunks') {
      // Load all chunks (simplified - would paginate in production)
      const sessions = await sessionStore.listSessions()
      const allChunks = []
      for (const session of sessions) {
        const chunks = await sessionStore.getChunksForSession(session.sessionId)
        allChunks.push(...chunks)
      }
      setData(allChunks)
    }
    // Other tables would be similar
  }

  const loadStorage = async () => {
    const usage = await sessionStore.getStorageUsage()
    setStorageUsage(usage)
  }

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `web-whisper-${selectedTable}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearAll = async () => {
    if (confirm('Delete all session data? This cannot be undone.')) {
      await sessionStore.clearAll()
      loadData()
      loadStorage()
    }
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
        height: '90vh',
        backgroundColor: theme.colors.bgCard,
        borderRadius: `${theme.borderRadius.card} ${theme.borderRadius.card} 0 0`,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky',
          top: 0,
          backgroundColor: theme.colors.bgCard,
          padding: theme.spacing.lg,
          borderBottom: `1px solid ${theme.colors.border}`,
          zIndex: 10,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.spacing.md,
          }}>
            <h2 style={{
              margin: 0,
              fontSize: theme.typography.sizes.xl,
              fontWeight: theme.typography.weights.semibold,
            }}>
              Developer Console
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

          {/* Tabs */}
          <div style={{ display: 'flex', gap: theme.spacing.xl }}>
            <button
              onClick={() => setActiveTab('indexeddb')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'indexeddb' ? `2px solid ${theme.colors.accentPrimary}` : 'none',
                color: activeTab === 'indexeddb' ? theme.colors.textPrimary : theme.colors.textSecondary,
                fontSize: theme.typography.sizes.base,
                fontWeight: theme.typography.weights.medium,
                cursor: 'pointer',
                padding: `${theme.spacing.sm} 0`,
              }}
            >
              IndexedDB
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'logs' ? `2px solid ${theme.colors.accentPrimary}` : 'none',
                color: activeTab === 'logs' ? theme.colors.textPrimary : theme.colors.textSecondary,
                fontSize: theme.typography.sizes.base,
                fontWeight: theme.typography.weights.medium,
                cursor: 'pointer',
                padding: `${theme.spacing.sm} 0`,
              }}
            >
              Logs
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: theme.spacing.lg, overflowY: 'auto' }}>
          {activeTab === 'indexeddb' ? (
            <div>
              {/* Table Selector */}
              <div style={{ marginBottom: theme.spacing.lg }}>
                <select
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value as TableName)}
                  style={{
                    backgroundColor: theme.colors.bgPrimary,
                    color: theme.colors.textPrimary,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.input,
                    padding: theme.spacing.md,
                    fontSize: theme.typography.sizes.base,
                    width: '100%',
                  }}
                >
                  <option value="sessions">Sessions</option>
                  <option value="chunks">Chunks</option>
                  <option value="volumeProfiles">Volume Profiles</option>
                  <option value="snips">Snips</option>
                  <option value="transcripts">Transcripts</option>
                </select>
              </div>

              {/* Record Count */}
              <div style={{
                fontSize: theme.typography.sizes.sm,
                color: theme.colors.textSecondary,
                marginBottom: theme.spacing.lg,
              }}>
                {data.length} records
              </div>

              {/* Table Data */}
              <div style={{
                backgroundColor: theme.colors.bgPrimary,
                borderRadius: theme.borderRadius.card,
                padding: theme.spacing.md,
                maxHeight: '50vh',
                overflowY: 'auto',
              }}>
                {data.map((item) => {
                  const id = item.sessionId || item.chunkId || item.snipId || item.transcriptId
                  const isExpanded = expandedId === id

                  return (
                    <div
                      key={id}
                      style={{
                        borderBottom: `1px solid ${theme.colors.border}`,
                        padding: theme.spacing.md,
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <div>
                          <div style={{
                            fontSize: theme.typography.sizes.xs,
                            color: theme.colors.textSecondary,
                            fontFamily: 'monospace',
                          }}>
                            {id}
                          </div>
                          <div style={{
                            fontSize: theme.typography.sizes.sm,
                            marginTop: theme.spacing.xs,
                          }}>
                            {Object.keys(item).slice(0, 3).map((key) => (
                              key !== id ? `${key}: ${String(item[key]).substring(0, 20)}` : null
                            )).filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: theme.colors.accentPrimary,
                            fontSize: theme.typography.sizes.sm,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {isExpanded ? 'Hide Details ▲' : 'View Details ▼'}
                        </button>
                      </div>
                      {isExpanded && (
                        <pre style={{
                          backgroundColor: theme.colors.bgCard,
                          color: theme.colors.accentPrimary,
                          padding: theme.spacing.md,
                          borderRadius: theme.borderRadius.input,
                          fontSize: theme.typography.sizes.xs,
                          fontFamily: 'monospace',
                          marginTop: theme.spacing.md,
                          maxHeight: '200px',
                          overflowY: 'auto',
                          overflowX: 'auto',
                        }}>
                          {JSON.stringify(item, (_key, value) => {
                            // Filter out Blob objects
                            if (value instanceof Blob) return '[Blob]'
                            if (value instanceof Float32Array) return '[Float32Array]'
                            return value
                          }, 2)}
                        </pre>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Actions */}
              <div style={{
                display: 'flex',
                gap: theme.spacing.lg,
                marginTop: theme.spacing.lg,
              }}>
                <button
                  onClick={handleExport}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.colors.accentPrimary}`,
                    borderRadius: theme.borderRadius.button,
                    padding: theme.spacing.md,
                    fontSize: theme.typography.sizes.base,
                    color: theme.colors.textPrimary,
                    cursor: 'pointer',
                  }}
                >
                  Export Table as JSON
                </button>
                <button
                  onClick={handleClearAll}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.colors.error}`,
                    borderRadius: theme.borderRadius.button,
                    padding: theme.spacing.md,
                    fontSize: theme.typography.sizes.base,
                    color: theme.colors.error,
                    cursor: 'pointer',
                  }}
                >
                  Clear All Data
                </button>
              </div>

              {/* Storage Inspector */}
              <div style={{
                marginTop: theme.spacing.xxl,
                padding: theme.spacing.lg,
                backgroundColor: theme.colors.bgPrimary,
                borderRadius: theme.borderRadius.card,
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: theme.typography.sizes.md,
                  fontWeight: theme.typography.weights.semibold,
                  marginBottom: theme.spacing.md,
                }}>
                  Storage
                </h3>
                <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
                  Using {formatBytes(storageUsage.usedBytes)} of {formatBytes(storageUsage.capBytes)} device storage
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: theme.spacing.xxl,
              color: theme.colors.textSecondary,
            }}>
              Logging not yet implemented. This tab is a placeholder for structured per-session logs.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
