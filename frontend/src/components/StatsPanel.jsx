import './StatsPanel.css'

function RewardBar({ reward }) {
  if (reward === null) return <div className="reward-empty">Waiting for first response…</div>

  const pct     = Math.round(((reward + 1) / 2) * 100)
  const color   = reward >= 0.5 ? 'var(--success)' : reward >= 0 ? 'var(--warning)' : 'var(--danger)'
  const label   = reward >= 0.5 ? 'Great comprehension' : reward >= 0 ? 'Minor confusion' : 'Needs simplification'

  return (
    <div className="reward-section">
      <div className="reward-row">
        <span className="reward-score" style={{ color }}>{reward.toFixed(2)}</span>
        <span className="reward-label">{label}</span>
      </div>
      <div className="reward-track">
        <div className="reward-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function ComplexityMeter({ score }) {
  return (
    <div className="meter-section">
      <div className="meter-label-row">
        <span>Complexity</span>
        <span className="meter-value">{score} / 10</span>
      </div>
      <div className="meter-track">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="meter-pip"
            style={{
              background: i < score
                ? `hsl(${220 - i * 14}, 80%, 65%)`
                : 'var(--border)'
            }}
          />
        ))}
      </div>
    </div>
  )
}

const FORMAT_LABELS = {
  bullets: '● Bullet points',
  prose:   '¶ Prose',
}

export default function StatsPanel({ reward, profile }) {
  return (
    <aside className="stats-panel">
      <div className="stats-header">
        <span className="stats-title">Reading Profile</span>
        <span className="stats-live">● LIVE</span>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">Last Response Reward</div>
        <RewardBar reward={reward} />
      </div>

      <div className="stats-section">
        <div className="stats-section-title">Cognitive Load</div>
        <ComplexityMeter score={profile.complexity_score} />
      </div>

      <div className="stats-section">
        <div className="stats-section-title">Preferred Format</div>
        <div className="format-badge">
          {FORMAT_LABELS[profile.preferred_format] ?? profile.preferred_format}
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">Heatmap Legend</div>
        <div className="legend">
          <div className="legend-item">
            <div className="legend-dot" style={{ background: 'rgba(129,201,149,0.5)' }} />
            <span>Read cleanly</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: 'rgba(253,214,99,0.6)' }} />
            <span>Re-read</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: 'rgba(242,139,130,0.7)' }} />
            <span>Confusion detected</span>
          </div>
        </div>
      </div>

      <div className="stats-section memory-section">
        <div className="stats-section-title">Memory Layers Active</div>
        <div className="memory-layers">
          {['Sensory', 'Working', 'Episodic', 'Semantic', 'Procedural', 'Prospective'].map(layer => (
            <div key={layer} className="memory-pill">
              <span className="memory-dot" />
              {layer}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
