import './InputBar.css'

export default function InputBar({ value, onChange, onSend, loading }) {
  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="input-bar-wrapper">
      <div className="input-bar">
        <textarea
          className="input-textarea"
          rows={1}
          placeholder="Ask me anything..."
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className={`send-btn ${loading ? 'loading' : ''}`}
          onClick={onSend}
          disabled={loading || !value.trim()}
          aria-label="Send"
        >
          {loading
            ? <span className="send-spinner" />
            : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )
          }
        </button>
      </div>
      <p className="input-hint">Enter to send · Shift+Enter for new line · Eye-tracking active</p>
    </div>
  )
}
