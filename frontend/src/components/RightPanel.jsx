import React, { useEffect, useRef } from 'react';
import { Video, Eye, Terminal, Wifi, WifiOff } from 'lucide-react';
import GazeMirror from './GazeMirror';
import SystemPromptPanel from './SystemPromptPanel';

export default function RightPanel({
  trackingActive,
  messages,
  currentWordId,
  heatmapEnabled,
  systemPrompt,
  userProfile,
  gazeTick,
}) {
  const videoSlotRef = useRef(null);

  // Move the WebGazer video feed into our video window when it appears
  useEffect(() => {
    const moveVideo = () => {
      const vid = document.getElementById('webgazerVideoFeed');
      if (vid && videoSlotRef.current && !videoSlotRef.current.contains(vid)) {
        // Keep original parent reference for cleanup
        vid._originalParent = vid.parentElement;

        // Restyle for our panel
        vid.style.position = 'relative';
        vid.style.top = 'auto';
        vid.style.bottom = 'auto';
        vid.style.left = 'auto';
        vid.style.right = 'auto';
        vid.style.width = '100%';
        vid.style.height = '100%';
        vid.style.borderRadius = '0';
        vid.style.border = 'none';
        vid.style.zIndex = 'auto';
        vid.style.transform = 'scaleX(-1)';
        vid.style.objectFit = 'cover';

        videoSlotRef.current.appendChild(vid);
      }
    };

    // Try immediately then poll until it appears
    moveVideo();
    const interval = setInterval(moveVideo, 500);
    return () => clearInterval(interval);
  }, [trackingActive]);

  return (
    <div className="right-panel">

      {/* ── Window 1: Webcam / Eye Tracking ── */}
      <div className="panel-window">
        <div className="panel-header">
          <Video size={10} color="var(--panel-muted)" />
          <span className="panel-title">Eye Tracking</span>
          <span className={`panel-badge ${trackingActive ? 'badge-live' : 'badge-off'}`}>
            {trackingActive ? 'LIVE' : 'OFF'}
          </span>
        </div>
        <div className="panel-body" style={{ background: '#0d1117' }}>
          {/* Video feed injected here by useEffect */}
          <div
            ref={videoSlotRef}
            style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
          >
            {!trackingActive && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '8px', color: 'var(--panel-muted)',
              }}>
                <WifiOff size={24} strokeWidth={1.5} />
                <span style={{ fontSize: '0.65rem' }}>Calibrate to begin</span>
              </div>
            )}
          </div>
          {/* Overlay: gaze dot indicator */}
          {trackingActive && (
            <div style={{
              position: 'absolute', bottom: 6, right: 6,
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: '99px',
              pointerEvents: 'none',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--panel-green)',
                animation: 'pulse-green 2s infinite',
                boxShadow: '0 0 0 0 rgba(30,142,62,0.5)',
              }} />
              <span style={{ fontSize: '0.58rem', color: 'var(--panel-green)', fontWeight: 600 }}>TRACKING</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Window 2: Word Highlight Mirror ── */}
      <div className="panel-window">
        <div className="panel-header">
          <Eye size={10} color="var(--panel-muted)" />
          <span className="panel-title">Gaze Mirror</span>
          {currentWordId && (
            <span className="panel-badge badge-info" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentWordId}
            </span>
          )}
        </div>
        <div className="panel-body">
          <GazeMirror
            messages={messages}
            currentWordId={currentWordId}
            heatmapEnabled={heatmapEnabled}
            gazeTick={gazeTick}
          />
        </div>
      </div>

      {/* ── Window 3: RSI System Prompt ── */}
      <div className="panel-window">
        <div className="panel-header">
          <Terminal size={10} color="var(--panel-muted)" />
          <span className="panel-title">Adaptive Prompt</span>
          <span className="panel-badge badge-info">RSI</span>
        </div>
        <div className="panel-body">
          <SystemPromptPanel
            systemPrompt={systemPrompt}
            userProfile={userProfile}
          />
        </div>
      </div>

    </div>
  );
}
