import './ResponseDisplay.css'

function getHeatColor(zone, zoneLog) {
  const visits = (zoneLog.current[zone] || []).length
  if (visits === 0)  return 'transparent'
  if (visits <= 2)   return 'rgba(129, 201, 149, 0.12)'   // green  — read cleanly
  if (visits <= 4)   return 'rgba(253, 214, 99,  0.18)'   // yellow — re-read
  return                    'rgba(242, 139, 130, 0.25)'   // red    — confusion
}

export default function ResponseDisplay({ text, responseId, zoneLog, gazeTick }) {
  const paragraphs = text
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)

  return (
    <div className="response-display">
      {paragraphs.map((para, i) => {
        const zone = `zone_${i}`
        return (
          <p
            key={`${responseId}-${i}`}
            id={zone}
            data-zone={zone}
            className="response-zone"
            style={{ background: getHeatColor(zone, zoneLog) }}
          >
            {para}
          </p>
        )
      })}
    </div>
  )
}
