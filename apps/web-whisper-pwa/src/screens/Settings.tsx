import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { transcriptionClient } from '../lib/transcription-client'
import './Settings.css'

export default function Settings() {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('groq_api_key') || '')
  const [keyStatus, setKeyStatus] = useState<'valid' | 'invalid' | 'checking' | 'unknown'>('unknown')
  const [keyMessage, setKeyMessage] = useState('')
  const [developerMode, setDeveloperMode] = useState(() => localStorage.getItem('developer_mode') === 'true')
  const [storageCap, setStorageCap] = useState(() => localStorage.getItem('storage_cap_mb') || '200')

  useEffect(() => {
    if (apiKey) {
      const status = localStorage.getItem('groq_key_status')
      if (status === 'valid') {
        setKeyStatus('valid')
        setKeyMessage('Key is valid')
      } else if (status === 'invalid') {
        setKeyStatus('invalid')
        setKeyMessage(localStorage.getItem('groq_key_message') || 'Key is invalid')
      }
    }
  }, [])

  async function handleValidateKey() {
    if (!apiKey) {
      setKeyStatus('invalid')
      setKeyMessage('Please enter an API key')
      return
    }

    setKeyStatus('checking')
    setKeyMessage('Validating...')

    const result = await transcriptionClient.validateKey(apiKey)
    
    if (result.valid) {
      setKeyStatus('valid')
      setKeyMessage('Key is valid')
      localStorage.setItem('groq_api_key', apiKey)
      localStorage.setItem('groq_key_status', 'valid')
    } else {
      setKeyStatus('invalid')
      setKeyMessage(result.reason || 'Validation failed')
      localStorage.setItem('groq_key_status', 'invalid')
      localStorage.setItem('groq_key_message', result.reason || 'Validation failed')
    }
  }

  function handleApiKeyChange(value: string) {
    setApiKey(value)
    if (keyStatus !== 'unknown' && keyStatus !== 'checking') {
      setKeyStatus('unknown')
      setKeyMessage('')
    }
  }

  function handleDeveloperModeChange(checked: boolean) {
    setDeveloperMode(checked)
    localStorage.setItem('developer_mode', checked ? 'true' : 'false')
  }

  function handleStorageCapChange(value: string) {
    const num = parseInt(value) || 200
    setStorageCap(String(num))
    localStorage.setItem('storage_cap_mb', String(num))
  }

  const transcriptionEnabled = keyStatus === 'valid'

  return (
    <div className="settings">
      <header className="settings-header">
        <h1>Settings</h1>
        <button className="close-button" onClick={() => navigate('/')}>
          Close
        </button>
      </header>

      <main className="settings-main">
        <section className="settings-section">
          <div className="section-header">
            <h2>Transcription</h2>
            <div className={`status-chip ${transcriptionEnabled ? 'enabled' : 'disabled'}`}>
              {transcriptionEnabled ? 'ENABLE' : 'DISABLED'}
            </div>
          </div>

          <p className="help-text">
            Groq is a separate service (not this app). Their free account takes about a minute to set up,
            and this app auto-checks your key after you paste it.{' '}
            <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer">
              It's easy to set up.
            </a>
          </p>

          <ol className="setup-steps">
            <li>Create a free Groq account at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer">console.groq.com</a></li>
            <li>Paste the key here and click "Recheck key"</li>
            <li>Transcription turns on automatically when the key is valid</li>
          </ol>

          <div className="form-field">
            <label htmlFor="api-key">Groq API key</label>
            <input
              id="api-key"
              type="text"
              placeholder="gsk_..."
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              className="text-input"
            />
            <div className="field-footer">
              <span className={`key-status ${keyStatus}`}>
                {keyStatus === 'checking' && 'Checking...'}
                {keyStatus === 'valid' && '✓ ' + keyMessage}
                {keyStatus === 'invalid' && '✗ ' + keyMessage}
                {keyStatus === 'unknown' && 'Key status: Not checked'}
              </span>
              <button className="secondary-button" onClick={handleValidateKey} disabled={keyStatus === 'checking'}>
                Recheck key
              </button>
            </div>
          </div>

          <p className="help-text">
            Need a key?{' '}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
              Create one in Groq Console
            </a>.
            Groq is a separate service with its own pricing.{' '}
            <a href="https://groq.com/pricing" target="_blank" rel="noopener noreferrer">
              See Groq pricing
            </a>.
          </p>
        </section>

        <section className="settings-section">
          <h2>App</h2>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={developerMode}
                onChange={(e) => handleDeveloperModeChange(e.target.checked)}
              />
              <span>Enable developer mode</span>
            </label>
            <p className="field-help">
              Shows chunk lists, detailed logs, and diagnostic tools
            </p>
          </div>

          <div className="form-field">
            <label htmlFor="storage-cap">Storage cap (MB)</label>
            <input
              id="storage-cap"
              type="number"
              min="50"
              max="5000"
              value={storageCap}
              onChange={(e) => handleStorageCapChange(e.target.value)}
              className="number-input"
            />
            <p className="field-help">
              Old sessions are automatically deleted when storage exceeds this limit
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
