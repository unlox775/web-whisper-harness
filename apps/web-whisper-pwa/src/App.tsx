import { useState } from 'react'
import Home from './screens/Home'
import Recording from './screens/Recording'
import SessionDetail from './screens/SessionDetail'
import { getSettings } from './utils/settings'

export type Screen = 'home' | 'recording' | 'sessionDetail'

export interface AppState {
  screen: Screen
  currentSessionId: string | null
  recordingSessionId: string | null
  settings: ReturnType<typeof getSettings>
}

function App() {
  const [state, setState] = useState<AppState>({
    screen: 'home',
    currentSessionId: null,
    recordingSessionId: null,
    settings: getSettings(),
  })

  const navigate = (screen: Screen, sessionId?: string) => {
    setState(prev => ({
      ...prev,
      screen,
      currentSessionId: sessionId || null,
    }))
  }

  const startRecording = (sessionId: string) => {
    setState(prev => ({
      ...prev,
      screen: 'recording',
      recordingSessionId: sessionId,
    }))
  }

  const stopRecording = (sessionId: string) => {
    setState(prev => ({
      ...prev,
      screen: 'sessionDetail',
      currentSessionId: sessionId,
      recordingSessionId: null,
    }))
  }

  const updateSettings = () => {
    setState(prev => ({
      ...prev,
      settings: getSettings(),
    }))
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0f18',
      color: '#ffffff',
    }}>
      {state.screen === 'home' && (
        <Home 
          navigate={navigate}
          startRecording={startRecording}
          settings={state.settings}
          updateSettings={updateSettings}
        />
      )}
      {state.screen === 'recording' && state.recordingSessionId && (
        <Recording
          sessionId={state.recordingSessionId}
          onStop={stopRecording}
          developerMode={state.settings.developerModeEnabled}
        />
      )}
      {state.screen === 'sessionDetail' && state.currentSessionId && (
        <SessionDetail
          sessionId={state.currentSessionId}
          navigate={navigate}
          settings={state.settings}
          updateSettings={updateSettings}
        />
      )}
    </div>
  )
}

export default App
