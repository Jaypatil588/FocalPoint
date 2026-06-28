import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Eye, RefreshCw, SquarePen as PenSquare, Menu, X, Sparkles, MessageSquare, Settings, ChevronDown } from 'lucide-react';
import WebGazerController from './components/WebGazerController';
import ResponseDisplay from './components/ResponseDisplay';
import RightPanel from './components/RightPanel';
import { getZoneAtGaze, computeGazeEvents } from './utils/gazeUtils';
import { sendChatMessage } from './utils/api';
import {
  loadSessionsFromDB, saveSessionToDB, loadProfileFromDB,
  saveProfileToDB, deleteSessionFromDB,
} from './lib/supabase';

const INIT_MSG = {
  role: 'assistant',
  text: "Hi! I'm FocalPoint — an AI assistant that watches how you read and adapts to you over time.\n\nI track which words your eyes linger on, which paragraphs you skip, and where you re-read. Every response is shaped by that signal.\n\nCalibrate your eye tracker on the right panel to get started, then ask me anything.",
  responseId: 'init',
};

const SUGGESTIONS = [
  'Explain how neural networks learn',
  'What is the difference between RAM and storage?',
  'Summarise the history of the internet',
  'How does eye tracking technology work?',
];

const genId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState([INIT_MSG]);
  const [sessions, setSessions] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResponseId, setLastResponseId] = useState(null);
  const [userProfile, setUserProfile] = useState({ complexity_score: 5, preferred_format: 'prose' });
  const [lastReward, setLastReward] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [useMock, setUseMock] = useState(false);

  const [trackingActive, setTrackingActive] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(null);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [currentWordId, setCurrentWordId] = useState(null);
  const [gazeTick, setGazeTick] = useState(0);

  const activeSessionId = useRef(null);
  const sessionId = useRef(genId());
  const zoneLog = useRef({});
  const smoothedGaze = useRef({ x: null, y: null });
  const readingState = useRef({ line: null, startTime: null });
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const trackingActiveRef = useRef(false);
  const loadingRef = useRef(false);
  const dbLoaded = useRef(false);

  useEffect(() => { trackingActiveRef.current = trackingActive; }, [trackingActive]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Load sessions and profile from Supabase on mount
  useEffect(() => {
    if (dbLoaded.current) return;
    dbLoaded.current = true;
    (async () => {
      const [dbSessions, dbProfile] = await Promise.all([
        loadSessionsFromDB(),
        loadProfileFromDB(),
      ]);
      if (dbSessions.length) setSessions(dbSessions);
      if (dbProfile) {
        setUserProfile({
          complexity_score: dbProfile.complexity_score,
          preferred_format: dbProfile.preferred_format,
        });
      }
    })();
  }, []);

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

    // Update the currently-fixated word for the right panel
    if (zone && zone.includes('_w')) {
      setCurrentWordId(zone);
    } else if (!zone) {
      setCurrentWordId(null);
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
  }, []);

  const resetZoneLog = () => {
    zoneLog.current = {};
    setGazeTick(0);
    setCurrentWordId(null);
  };

  const startNewChat = async () => {
    const realMessages = messages.filter(m => m.responseId !== 'init');
    if (activeSessionId.current === null && realMessages.length > 0) {
      const firstUser = realMessages.find(m => m.role === 'user');
      const title = firstUser
        ? firstUser.text.slice(0, 40) + (firstUser.text.length > 40 ? '…' : '')
        : 'Chat';
      const session = { id: sessionId.current, title, messages };
      setSessions(prev => [session, ...prev].slice(0, 20));
      await saveSessionToDB(session);
    }
    activeSessionId.current = null;
    sessionId.current = genId();
    setMessages([INIT_MSG]);
    setLastResponseId(null);
    setLastReward(null);
    setSystemPrompt('');
    resetZoneLog();
  };

  const loadSession = (session) => {
    activeSessionId.current = session.id;
    sessionId.current = session.id;
    setMessages(session.messages);
    setLastResponseId(null);
    resetZoneLog();
  };

  const deleteSession = async (e, sessionId_) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== sessionId_));
    await deleteSessionFromDB(sessionId_);
    if (activeSessionId.current === sessionId_) {
      activeSessionId.current = null;
      sessionId.current = genId();
      setMessages([INIT_MSG]);
    }
  };

  const handleSend = async (text_) => {
    const text = text_ || input;
    if (!text.trim() || loading) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    const currentZones = Array.from(document.querySelectorAll('[data-zone]'))
      .map(el => el.getAttribute('data-zone'));
    const gazeEvents = computeGazeEvents(currentZones, zoneLog.current);

    activeSessionId.current = null;
    const newUserMsg = { role: 'user', text };
    setMessages(prev => [...prev, newUserMsg]);
    resetZoneLog();

    try {
      const history = messages
        .filter(m => m.responseId !== 'init')
        .map(m => ({ role: m.role, content: m.text }));

      const data = await sendChatMessage(
        text, lastResponseId, gazeEvents, useMock, history, sessionId.current
      );
      setLastResponseId(data.response_id);
      setUserProfile(data.user_profile);
      setLastReward(data.reward);
      setSystemPrompt(data.system_prompt || '');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: data.text, responseId: data.response_id },
      ]);

      // Persist updated profile
      await saveProfileToDB({
        complexity_score: data.user_profile.complexity_score,
        preferred_format: data.user_profile.preferred_format,
      });
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong. Please try again.', responseId: 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const isEmptyState = messages.length === 1 && messages[0].responseId === 'init';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-app)' }}>

      {/* ── SIDEBAR ── */}
      <div className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-inner">

          {/* Top: hamburger + logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', height: '56px', flexShrink: 0 }}>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}>
              <Menu size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-teal) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Eye size={14} color="#fff" />
              </div>
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>FocalPoint</span>
            </div>
          </div>

          {/* New chat button */}
          <div style={{ padding: '4px 12px 8px' }}>
            <button className="new-chat-btn" onClick={startNewChat}>
              <PenSquare size={16} />
              New chat
            </button>
          </div>

          {/* Session history */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
            {sessions.length > 0 && (
              <>
                <div style={{
                  fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)',
                  padding: '8px 8px 4px', letterSpacing: '0.01em',
                }}>Recent</div>
                {sessions.map(s => (
                  <button
                    key={s.id}
                    className={`sidebar-btn ${activeSessionId.current === s.id ? 'active' : ''}`}
                    onClick={() => loadSession(s)}
                    title={s.title}
                    style={{ position: 'relative', paddingRight: '28px' }}
                  >
                    <MessageSquare size={15} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {s.title}
                    </span>
                    <button
                      onClick={(e) => deleteSession(e, s.id)}
                      style={{
                        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: '3px', borderRadius: '4px',
                        display: 'flex', alignItems: 'center',
                        opacity: 0,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                    >
                      <X size={12} />
                    </button>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Bottom controls */}
          <div style={{
            borderTop: '1px solid var(--border-light)',
            padding: '8px 12px 12px',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            {/* WebGazer controls */}
            <WebGazerController
              onGazeUpdate={handleGazeUpdate}
              trackingActive={trackingActive}
              setTrackingActive={setTrackingActive}
              setCalibrationProgress={setCalibrationProgress}
              compact
            />

            {/* Mock toggle */}
            <button
              onClick={() => setUseMock(m => !m)}
              className="sidebar-btn"
              style={{
                fontSize: '0.8rem',
                background: useMock ? 'var(--accent-glow)' : 'transparent',
                color: useMock ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${useMock ? 'var(--accent)' : 'transparent'}`,
                borderRadius: 'var(--radius-pill)',
              }}
            >
              <Settings size={14} />
              {useMock ? 'Simulator ON' : 'Use Simulator'}
            </button>

            {/* Heatmap toggle */}
            <button
              onClick={() => setHeatmapEnabled(h => !h)}
              className="sidebar-btn"
              style={{
                fontSize: '0.8rem',
                background: heatmapEnabled ? 'rgba(8,145,178,0.08)' : 'transparent',
                color: heatmapEnabled ? 'var(--accent-teal)' : 'var(--text-muted)',
                border: `1px solid ${heatmapEnabled ? 'var(--accent-teal)' : 'transparent'}`,
                borderRadius: 'var(--radius-pill)',
              }}
            >
              <Eye size={14} />
              {heatmapEnabled ? 'Heatmap ON' : 'Heatmap OFF'}
            </button>

            {/* Calibration progress */}
            {calibrationProgress !== null && (
              <div style={{ padding: '4px 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                  <span>Calibrating…</span>
                  <span>{Math.round(calibrationProgress)}%</span>
                </div>
                <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${calibrationProgress}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── MAIN CHAT AREA ── */}
      <div className="chat-area">

        {/* Top bar */}
        <div className="topbar">
          {!sidebarOpen && (
            <button className="icon-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
          )}
          <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {isEmptyState ? 'FocalPoint' : sessions.find(s => s.id === activeSessionId.current)?.title || 'FocalPoint'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '0.72rem', color: 'var(--text-muted)',
              border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '99px',
            }}>AIEWF 2026</span>
            {lastReward !== null && (
              <span style={{
                fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: '99px',
                background: lastReward > 0.5
                  ? 'rgba(30,142,62,0.1)' : lastReward >= 0
                    ? 'rgba(249,171,0,0.1)' : 'rgba(217,48,37,0.1)',
                color: lastReward > 0.5 ? 'var(--success)' : lastReward >= 0 ? 'var(--warning)' : 'var(--danger)',
                border: `1px solid ${lastReward > 0.5 ? 'rgba(30,142,62,0.3)' : lastReward >= 0 ? 'rgba(249,171,0,0.3)' : 'rgba(217,48,37,0.3)'}`,
              }}>
                Reward {lastReward >= 0 ? '+' : ''}{lastReward.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Messages / Empty state */}
        <div className="chat-messages">
          {isEmptyState ? (
            <div className="empty-state" style={{ height: '100%' }}>
              <div>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-teal) 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 4px 24px var(--accent-glow)',
                }}>
                  <Eye size={26} color="#fff" />
                </div>
                <div className="empty-title">Hello, there.</div>
                <div style={{ marginTop: '8px', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
                  How can I help you today?
                </div>
              </div>
              <div className="suggestion-chips">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="chip" onClick={() => handleSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-messages-inner">
              {messages.filter(m => m.responseId !== 'init').map((msg, index) => (
                <div
                  key={index}
                  className="animate-fade-up"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: '4px',
                    animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
                    animationFillMode: 'both',
                  }}
                >
                  {msg.role === 'user' ? (
                    <div className="user-bubble">{msg.text}</div>
                  ) : (
                    <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                      <div className="ai-avatar">
                        <Eye size={15} color="#fff" />
                      </div>
                      <div className="ai-response-text">
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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div className="ai-avatar">
                    <Eye size={15} color="#fff" />
                  </div>
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center', paddingTop: '10px' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="thinking-dot" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="input-bar-wrap">
          <div className="input-bar">
            <textarea
              ref={textareaRef}
              value={input}
              onInput={handleTextareaInput}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={trackingActive
                ? 'Ask anything — your gaze shapes the response…'
                : 'Ask FocalPoint anything…'}
              disabled={loading}
              rows={1}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className={`send-btn ${input.trim() && !loading ? 'active' : 'inactive'}`}
            >
              {loading
                ? <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                : <Send size={16} color={input.trim() ? '#fff' : 'var(--text-muted)'} />
              }
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            FocalPoint adapts to your reading patterns. Eye tracking data never leaves your browser.
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <RightPanel
        trackingActive={trackingActive}
        messages={messages}
        currentWordId={currentWordId}
        heatmapEnabled={heatmapEnabled}
        systemPrompt={systemPrompt}
        userProfile={userProfile}
        gazeTick={gazeTick}
      />

      <style>{`
        @keyframes pulse-green {
          0%,100% { box-shadow: 0 0 0 0 rgba(30,142,62,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(30,142,62,0); }
        }
      `}</style>
    </div>
  );
}
