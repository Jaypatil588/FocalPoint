import React, { useState } from 'react';
import {
  PenSquare, MessageSquare, Clock, ChevronRight,
  Camera, RefreshCw, Play, CameraOff, Sparkles,
  Sliders, Server, Check, Layers, Settings,
} from 'lucide-react';
import WebGazerController from './WebGazerController';
import StatsPanel from './StatsPanel';

// Gemini exact sidebar logo — multi-colour star
function GeminiStar({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gem-g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285f4" />
          <stop offset="50%" stopColor="#9c4df4" />
          <stop offset="100%" stopColor="#f66151" />
        </linearGradient>
      </defs>
      {/* Four-point star shape matching Gemini's logo */}
      <path
        d="M14 2 C14 2 15.5 9.5 20 14 C15.5 18.5 14 26 14 26 C14 26 12.5 18.5 8 14 C12.5 9.5 14 2 14 2Z"
        fill="url(#gem-g1)"
      />
      <path
        d="M2 14 C2 14 9.5 12.5 14 8 C18.5 12.5 26 14 26 14 C26 14 18.5 15.5 14 20 C9.5 15.5 2 14 2 14Z"
        fill="url(#gem-g1)"
        opacity="0.85"
      />
    </svg>
  );
}

// Groups sessions into time buckets matching Gemini
function groupSessions(sessions) {
  const now = Date.now();
  const MS = { hour: 3600000, day: 86400000, week: 604800000 };
  const groups = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] };
  sessions.forEach(s => {
    const age = now - s.createdAt;
    if (age < MS.day) groups['Today'].push(s);
    else if (age < MS.day * 2) groups['Yesterday'].push(s);
    else if (age < MS.week) groups['Previous 7 days'].push(s);
    else groups['Older'].push(s);
  });
  return groups;
}

export default function GeminiSidebar({
  open,
  onClose,
  sessions,
  activeSessionId,
  onNewChat,
  onLoadSession,
  // eye-tracking props forwarded to sub-components
  onGazeUpdate,
  trackingActive,
  setTrackingActive,
  setCalibrationProgress,
  calibrationProgress,
  reward,
  userProfile,
  heatmapEnabled,
  setHeatmapEnabled,
  useMock,
  setUseMock,
  zoneLog,
  currentZones,
}) {
  const [expandTracker, setExpandTracker] = useState(false);
  const grouped = groupSessions(sessions);

  return (
    <aside
      aria-label="Sidebar"
      style={{
        width: open ? '280px' : '0',
        minWidth: open ? '280px' : '0',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        backgroundColor: 'var(--gemini-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
      }}
    >
      {/* Fixed-width inner so content doesn't squeeze during animation */}
      <div style={{ width: 280, display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Top row: hamburger + logo ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 8px' }}>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--gemini-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {/* Hamburger icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GeminiStar size={26} />
            <span style={{
              fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em',
              background: 'linear-gradient(90deg, #4285f4 0%, #9c4df4 50%, #f66151 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              FocalPoint
            </span>
          </div>
        </div>

        {/* ── New Chat button ── */}
        <div style={{ padding: '6px 12px 4px' }}>
          <button
            onClick={onNewChat}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 14px',
              background: 'none', border: '1px solid var(--gemini-border)',
              borderRadius: 24, cursor: 'pointer', fontSize: '0.9rem',
              fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.01em',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--gemini-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <PenSquare size={16} style={{ color: 'var(--text-secondary)' }} />
            New chat
          </button>
        </div>

        {/* ── Recents header ── */}
        {sessions.length > 0 && (
          <div style={{ padding: '10px 16px 2px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
            Recent
          </div>
        )}

        {/* ── Scrollable history ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {sessions.length === 0 && (
            <div style={{ padding: '12px 8px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              No chat history yet
            </div>
          )}

          {Object.entries(grouped).map(([label, items]) => {
            if (!items.length) return null;
            return (
              <div key={label}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', padding: '8px 8px 3px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {label}
                </div>
                {items.map(s => (
                  <button
                    key={s.id}
                    onClick={() => onLoadSession(s)}
                    className={`sidebar-item${activeSessionId === s.id ? ' active' : ''}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 10px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.875rem', color: 'var(--text-primary)',
                      textAlign: 'left', overflow: 'hidden',
                    }}
                    title={s.title}
                  >
                    <MessageSquare size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {s.title}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'var(--gemini-border-subtle)', margin: '0 8px' }} />

        {/* ── Eye Tracker accordion ── */}
        <div style={{ padding: '4px 8px' }}>
          <button
            onClick={() => setExpandTracker(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '8px 10px',
              background: 'none', border: 'none', cursor: 'pointer',
              borderRadius: 8,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--gemini-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Camera size={16} style={{ color: trackingActive ? 'var(--success)' : 'var(--text-muted)' }} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>Eye Tracker</span>
              {trackingActive && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, color: 'var(--success)',
                  background: 'rgba(52,168,83,0.12)', padding: '1px 6px',
                  borderRadius: 99, letterSpacing: '0.05em',
                }}>LIVE</span>
              )}
            </div>
            <ChevronRight
              size={14}
              style={{
                color: 'var(--text-muted)',
                transform: expandTracker ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </button>

          {expandTracker && (
            <div style={{ padding: '4px 2px 8px' }}>
              <WebGazerController
                onGazeUpdate={onGazeUpdate}
                trackingActive={trackingActive}
                setTrackingActive={setTrackingActive}
                setCalibrationProgress={setCalibrationProgress}
              />
              <div style={{ marginTop: 8 }}>
                <StatsPanel
                  reward={reward}
                  profile={userProfile}
                  trackingActive={trackingActive}
                  calibrationProgress={calibrationProgress}
                  heatmapEnabled={heatmapEnabled}
                  setHeatmapEnabled={setHeatmapEnabled}
                  useMock={useMock}
                  setUseMock={setUseMock}
                  zoneLog={zoneLog}
                  currentZones={currentZones}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom settings item ── */}
        <div style={{ padding: '4px 8px 12px' }}>
          <button
            className="sidebar-item"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 10px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', color: 'var(--text-secondary)',
            }}
          >
            <Settings size={16} />
            Settings
          </button>
        </div>
      </div>
    </aside>
  );
}
