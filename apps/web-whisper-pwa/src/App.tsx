import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './screens/Home'
import Record from './screens/Record'
import SessionDetail from './screens/SessionDetail'
import Settings from './screens/Settings'
import DeveloperConsole from './screens/DeveloperConsole'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/record/:sessionId" element={<Record />} />
        <Route path="/session/:sessionId" element={<SessionDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/developer" element={<DeveloperConsole />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
