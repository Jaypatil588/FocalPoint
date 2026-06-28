import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Eye, RefreshCw, PenSquare, Menu, X, ChevronRight } from 'lucide-react';
import WebGazerController from './components/WebGazerController';
import ResponseDisplay from './components/ResponseDisplay';
import StatsPanel from './components/StatsPanel';
import { getZoneAtGaze, computeGazeEvents } from './utils/gazeUtils';
import { sendChatMessage } from './utils/api';

const INIT_MSG = {
  role: 'assistant',
  text: "Hi! I'm FocalPoint — an AI assistant that watches how you read and adapts to you over time.\n\nI track which words your eyes linger on, which paragraphs you skip, and where you re-read. Every response is shaped by that signal.\n\nCalibrate your eye tracker on the left to get started, then ask me anything.",
  responseId: 'init'
};

const genId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const loadMessages = () => {
  try {
    const raw = localStorage.getItem('fp_messages');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [INIT_MSG];
};

const loadSessions = () => {
  try {
    const raw = localStorage.getItem('fp_sessions');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState(loadMessages);
  const [sessions, setSessions] = useState(loadSessions);
  // null = new unsaved chat, otherwise the ID of the session currently loaded
  const activeSessionId = useRef(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResponseId, setLastResponseId] = useState(null);
  const [userProfile, setUserProfile] = useState({ complexity_score: 5, preferred_format: 'prose' });
  const [lastReward, setLastReward] = useState(null);

  const [trackingActive, setTrackingActive] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(null);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [useMock, setUseMock] = useState(false);
  const [gazeTick, setGazeTick] = useState(0);

  const zoneLog = useRef({});
  const smoothedGaze = useRef({ x: null, y: null });
  const readingState = useRef({ line: null, startTime: null });
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const sessionId = useRef(genId()); // stable per chat session, reset on New Chat

  // Refs so the gaze handler (captured once by WebGazer) always reads current state
  const trackingActiveRef = useRef(false);
  const loadingRef = useRef(false);
  useEffect(() => { trackingActiveRef.current = trackingActive; }, [trackingActive]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Persist current chat to localStorage
  useEffect(() => {
    localStorage.setItem('fp_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('fp_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleGazeUpdate = useCallback((x, y, timestamp) => {
    if (!trackingActiveRef.current || loadingRef.current) return;

    let alpha = 0.4;
    let sX = x, sY = y;
    if (smoothedGaze.current.x !== null) {
      const dx = x - smoothedGaze.current.x;
      const dy = y - smoothedGaze.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) alpha = 0.02;
      else if (dist < 50) alpha = 0.1;
      sX = alpha * x + (1 - alpha) * smoothedGaze.current.x;
      sY = alpha * y + (1 - alpha) * smoothedGaze.current.y;
    }
    smoothedGaze.current = { x: sX, y: sY };

    const zone = getZoneAtGaze(sX, sY);
    const currentTime = timestamp || Date.now();

    if (zone !== readingState.current.line) {
      readingState.current = { line: zone, startTime: currentTime };
    }
    if (!zone) return;

    if (!zoneLog.current[zone]) zoneLog.current[zone] = [];
    zoneLog.current[zone].push(currentTime);

    if (zone.includes('_w')) {
      const parentZone = zone.split('_w')[0];
      if (!zoneLog.current[parentZone]) zoneLog.current[parentZone] = [];
      zoneLog.current[parentZone].push(currentTime);
    }

    if (currentTime - (window.lastGazeTickTime || 0) > 100) {
      window.lastGazeTickTime = currentTime;
      setGazeTick(prev => prev + 1);
    }

    // Live gaze log
    const logContainer = document.getElementById('gaze-log-container');
    if (logContainer) {
      const entry = document.createElement('div');
      entry.style.cssText = 'font-size:0.65rem;font-family:monospace;color:#888;border-bottom:1px solid rgba(0,0,0,0.05);padding:1px 0;';
      const timeStr = new Date(currentTime).toISOString().split('T')[1].slice(0, -1);
      entry.innerText = `[${timeStr}] ${Math.round(sX)},${Math.round(sY)} ${zone ? '→ ' + zone : ''}`;
      logContainer.appendChild(entry);
      if (logContainer.childNodes.length > 50) logContainer.removeChild(logContainer.firstChild);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }, []); // stable ref — reads trackingActive/loading via refs, never re-created

  const resetZoneLog = () => {
    zoneLog.current = {};
    setGazeTick(0);
  };

  const startNewChat = () => {
    // Only save if this is a new chat (not a loaded past session) with real messages
    const realMessages = messages.filter(m => m.responseId !== 'init');
    if (activeSessionId.current === null && realMessages.length > 0) {
      const firstUser = realMessages.find(m => m.role === 'user');
      const title = firstUser ? firstUser.text.slice(0, 40) + (firstUser.text.length > 40 ? '…' : '') : 'Chat';
      const session = { id: genId(), title, messages, createdAt: Date.now() };
      setSessions(prev => [session, ...prev].slice(0, 20));
    }
    activeSessionId.current = null;
    sessionId.current = genId(); // new session ID for this chat
    setMessages([INIT_MSG]);
    setLastResponseId(null);
    setLastReward(null);
    resetZoneLog();
  };

  const loadSession = (session) => {
    // Mark that we're viewing a saved session — don't re-save on New Chat
    activeSessionId.current = session.id;
    sessionId.current = session.id; // use the saved session's ID for episode continuity
    setMessages(session.messages);
    setLastResponseId(null);
    resetZoneLog();
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const currentInput = input;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    const currentZones = Array.from(document.querySelectorAll('[data-zone]')).map(el => el.getAttribute('data-zone'));
    const gazeEvents = computeGazeEvents(currentZones, zoneLog.current);

    // If continuing from a loaded session, treat it as a new chat going forward
    activeSessionId.current = null;
    const newUserMsg = { role: 'user', text: currentInput };
    setMessages(prev => [...prev, newUserMsg]);
    resetZoneLog();

    try {
      const history = messages
        .filter(m => m.responseId !== 'init')
        .map(m => ({ role: m.role, content: m.text }));

      const data = await sendChatMessage(currentInput, lastResponseId, gazeEvents, useMock, history, sessionId.current);
      setLastResponseId(data.response_id);
      setUserProfile(data.user_profile);
      setLastReward(data.reward);
      setMessages(prev => [...prev, { role: 'assistant', text: data.text, responseId: data.response_id }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please try again.', responseId: 'error' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const currentZones = Array.from(document.querySelectorAll('[data-zone]')).map(el => el.getAttribute('data-zone'));

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#fff', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* ── LEFT SIDEBAR ── */}
      <div style={{
        width: sidebarOpen ? '280px' : '0',
        minWidth: sidebarOpen ? '280px' : '0',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        overflow: 'hidden',
        backgroundColor: '#f0f4f9',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}>
        <div style={{ width: '280px', display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Sidebar header */}
          <div style={{ padding: '1rem 1rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Eye size={14} color="#fff" />
              </div>
              <span style={{ fontWeight: 700, fontSize: '1rem', background: 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FocalPoint</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '4px', borderRadius: '6px' }}>
              <X size={16} />
            </button>
          </div>

          {/* New Chat button */}
          <div style={{ padding: '0.5rem 0.75rem' }}>
            <button
              onClick={startNewChat}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                width: '100%', padding: '0.65rem 0.9rem',
                backgroundColor: 'transparent', border: '1px solid #c4c7c5',
                borderRadius: '24px', cursor: 'pointer', fontSize: '0.875rem',
                fontWeight: 500, color: '#1f1f1f', transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e9eef6'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <PenSquare size={15} />
              New Chat
            </button>
          </div>

          {/* Past sessions */}
          {sessions.length > 0 && (
            <div style={{ padding: '0.25rem 0.75rem 0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', fontWeight: 600, padding: '0.25rem 0.5rem 0.5rem', letterSpacing: '0.03em' }}>RECENT</div>
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '0.5rem 0.75rem', borderRadius: '8px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '0.85rem', color: '#1f1f1f',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e9eef6'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  title={s.title}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: '#e0e0e0', margin: '0.25rem 0.75rem' }} />

          {/* Cognitive Matrix */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem 1rem' }}>
            <WebGazerController
              onGazeUpdate={handleGazeUpdate}
              trackingActive={trackingActive}
              setTrackingActive={setTrackingActive}
              setCalibrationProgress={setCalibrationProgress}
            />
            <div style={{ marginTop: '0.75rem' }}>
              <StatsPanel
                reward={lastReward}
                profile={userProfile}
                trackingActive={trackingActive}
                calibrationProgress={calibrationProgress}
                heatmapEnabled={heatmapEnabled}
                setHeatmapEnabled={setHeatmapEnabled}
                useMock={useMock}
                setUseMock={setUseMock}
                zoneLog={zoneLog.current}
                currentZones={currentZones}
              />
            </div>
          </div>

        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid #e0e0e0', backgroundColor: '#fff' }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: '6px', borderRadius: '8px' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f4f9'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Menu size={20} />
            </button>
          )}
          <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1f1f1f' }}>FocalPoint</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => setHeatmapEnabled(h => !h)}
              title={heatmapEnabled ? 'Hide gaze heatmap' : 'Show gaze heatmap'}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '4px 12px', borderRadius: '99px', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 600,
                border: heatmapEnabled ? '1px solid var(--accent-primary)' : '1px solid #e0e0e0',
                backgroundColor: heatmapEnabled ? 'rgba(124,58,237,0.08)' : 'transparent',
                color: heatmapEnabled ? 'var(--accent-primary)' : '#888',
                transition: 'all 0.15s',
              }}
            >
              <Eye size={13} />
              {heatmapEnabled ? 'Heatmap ON' : 'Heatmap OFF'}
            </button>
            <span style={{ fontSize: '0.75rem', color: '#888', border: '1px solid #e0e0e0', padding: '2px 8px', borderRadius: '99px' }}>AIEWF 2026</span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1rem' }}>
          <div style={{ maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {messages.map((msg, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.35rem' }}>
                {msg.role === 'user' ? (
                  <div style={{
                    backgroundColor: '#f0f4f9',
                    borderRadius: '18px 18px 4px 18px',
                    padding: '0.75rem 1.1rem',
                    fontSize: '1.125rem',
                    lineHeight: '1.6',
                    color: '#1f1f1f',
                    maxWidth: '75%',
                  }}>
                    {msg.text}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px'
                    }}>
                      <Eye size={14} color="#fff" />
                    </div>
                    <div style={{ flex: 1, fontSize: '1.125rem', lineHeight: '1.7', color: '#1f1f1f' }}>
                      <ResponseDisplay
                        text={msg.text}
                        responseId={msg.responseId || 'default'}
                        zoneLog={zoneLog.current}
                        heatmapEnabled={heatmapEnabled}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Eye size={14} color="#fff" />
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center', paddingTop: '8px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--accent-primary)',
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div style={{ padding: '0.75rem 1rem 1.25rem', backgroundColor: '#fff' }}>
          <div style={{ maxWidth: '780px', margin: '0 auto' }}>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: '0.5rem',
              border: '1px solid #c4c7c5', borderRadius: '24px',
              padding: '0.6rem 0.6rem 0.6rem 1.25rem',
              backgroundColor: '#fff',
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
              transition: 'border-color 0.2s',
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = '#c4c7c5'}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onInput={handleTextareaInput}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={trackingActive ? 'Ask anything — your gaze shapes the next response…' : 'Calibrate the eye tracker to begin…'}
                disabled={loading}
                rows={1}
                style={{
                  flex: 1, border: 'none', outline: 'none', resize: 'none',
                  fontSize: '1.125rem', lineHeight: '1.6', color: '#1f1f1f',
                  backgroundColor: 'transparent', fontFamily: 'var(--font-sans)',
                  maxHeight: '200px', overflowY: 'auto',
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  backgroundColor: input.trim() && !loading ? 'var(--accent-primary)' : '#e0e0e0',
                  color: '#fff', cursor: input.trim() && !loading ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.2s',
                }}
              >
                {loading ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#aaa', marginTop: '0.5rem' }}>
              FocalPoint adapts to your reading patterns. Eye tracking data never leaves your browser.
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 99px; }
      `}</style>
    </div>
  );
}
