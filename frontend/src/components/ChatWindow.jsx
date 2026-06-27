import { useEffect, useRef } from 'react'
import ResponseDisplay from './ResponseDisplay'
import './ChatWindow.css'

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">◎</div>
      <h2 className="empty-title">What would you like to know?</h2>
      <p className="empty-sub">FocalPoint watches how you read and adapts every response to your attention.</p>
      <div className="empty-chips">
        <span className="chip">Explain recursion simply</span>
        <span className="chip">How does the internet work?</span>
        <span className="chip">What is machine learning?</span>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="message ai">
      <div className="ai-avatar">◎</div>
      <div className="typing-indicator">
        <span /><span /><span />
      </div>
    </div>
  )
}

export default function ChatWindow({ messages, loading, zoneLog, gazeTick }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div className="chat-window">
      {messages.length === 0 && !loading
        ? <EmptyState />
        : (
          <div className="messages">
            {messages.map((msg, i) =>
              msg.role === 'user'
                ? (
                  <div key={i} className="message user">
                    <div className="user-bubble">{msg.text}</div>
                  </div>
                )
                : (
                  <div key={i} className="message ai">
                    <div className="ai-avatar">◎</div>
                    <ResponseDisplay
                      text={msg.text}
                      responseId={msg.responseId}
                      zoneLog={zoneLog}
                      gazeTick={gazeTick}
                    />
                  </div>
                )
            )}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )
      }
    </div>
  )
}
