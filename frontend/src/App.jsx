import { useState, useRef, useEffect } from 'react'
import ChatWindow from './components/ChatWindow'
import InputBar from './components/InputBar'
import StatsPanel from './components/StatsPanel'
import './App.css'

function App() {
  const [messages, setMessages]             = useState([])
  const [input, setInput]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [lastResponseId, setLastResponseId] = useState(null)
  const [userProfile, setUserProfile]       = useState({ complexity_score: 5, preferred_format: 'prose' })
  const [lastReward, setLastReward]         = useState(null)
  const [gazeTick, setGazeTick]             = useState(0)

  const zoneLog    = useRef({})
  const gazerReady = useRef(false)

  // Expose internals for teammate's WebGazer integration
  useEffect(() => {
    window.focalpoint = { zoneLog, gazerReady, setGazeTick }
  }, [])

  function resetZoneLog() {
    zoneLog.current = {}
  }

  function computeGazeEvents() {
    const zones = Array.from(document.querySelectorAll('[data-zone]'))
      .map(el => el.getAttribute('data-zone'))

    return zones.map(zone => {
      const timestamps = zoneLog.current[zone] || []
      const visits     = timestamps.length

      if (visits === 0) return { zone, visits: 0, flag: 'skipped' }
      if (visits >= 3) {
        const span = timestamps[timestamps.length - 1] - timestamps[0]
        if (span < 5000) return { zone, visits, flag: 'confusion' }
      }
      if (visits >= 2) {
        const span = timestamps[timestamps.length - 1] - timestamps[0]
        if (span < 500) return { zone, visits, flag: 'skim' }
      }
      return { zone, visits, flag: 'smooth' }
    })
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const messageText = input.trim()
    setInput('')
    setLoading(true)

    const gazeEvents = computeGazeEvents()
    setMessages(prev => [...prev, { role: 'user', text: messageText }])

    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:              'demo_user',
          message:              messageText,
          previous_response_id: lastResponseId,
          gaze_events:          gazeEvents,
        }),
      })
      const data = await res.json()

      setLastResponseId(data.response_id)
      setUserProfile(data.user_profile)
      setLastReward(data.reward)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: data.text, responseId: data.response_id },
      ])
      resetZoneLog()
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: '⚠️ Backend not reachable on port 8000.', responseId: 'err' },
      ])
    }

    setLoading(false)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">◎</span>
          <span className="logo-text">FocalPoint</span>
        </div>
        <span className="header-tag">Continual Learning · AIEWF 2026</span>
      </header>

      <main className="main">
        <div className="chat-area">
          <ChatWindow
            messages={messages}
            loading={loading}
            zoneLog={zoneLog}
            gazeTick={gazeTick}
          />
          <InputBar
            value={input}
            onChange={setInput}
            onSend={sendMessage}
            loading={loading}
          />
        </div>

        <StatsPanel reward={lastReward} profile={userProfile} />
      </main>
    </div>
  )
}

export default App
