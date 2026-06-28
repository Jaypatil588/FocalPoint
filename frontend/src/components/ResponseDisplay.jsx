import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

function parseTextLines(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line);
      return {
        isBullet,
        text: isBullet ? line.replace(/^([-•*]\s*|\d+\.\s*)/, '').trim() : line,
      };
    });
}

function measureFont(container) {
  const style = window.getComputedStyle(container);
  return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function wrapLine(entry, maxWidth, measure) {
  const words = entry.text.split(/\s+/).filter(Boolean);
  if (!words.length || maxWidth <= 0) return [entry];

  const bulletWidth = entry.isBullet ? measure('•  ') : 0;
  const wrapped = [];
  let current = '';

  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    const width = measure(candidate) + bulletWidth;
    if (current && width > maxWidth) {
      wrapped.push({ isBullet: entry.isBullet && wrapped.length === 0, text: current });
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) wrapped.push({ isBullet: entry.isBullet && wrapped.length === 0, text: current });
  return wrapped;
}

function buildMeasuredLines(text, container, containerWidth) {
  const entries = parseTextLines(text);
  if (!container) return entries;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = measureFont(container);

  const maxWidth = containerWidth - 18;
  const measure = value => context.measureText(value).width;
  return entries.flatMap(entry => wrapLine(entry, maxWidth, measure));
}

export default function ResponseDisplay({ text, responseId, zoneLog, heatmapEnabled }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    if (!containerRef.current) return undefined;
    const updateWidth = () => setContainerWidth(containerRef.current?.clientWidth || 0);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    updateWidth();
    return () => observer.disconnect();
  }, []);

  const lines = useMemo(
    () => buildMeasuredLines(text, containerRef.current, containerWidth),
    [text, containerWidth]
  );

  const getHeatBg = (zone) => {
    if (!heatmapEnabled) return 'transparent';
    const visits = (zoneLog[zone] || []).length;
    if (visits === 0) return 'transparent';
    if (visits <= 2) return 'rgba(16, 185, 129, 0.12)';
    if (visits <= 4) return 'rgba(245, 158, 11, 0.18)';
    return 'rgba(239, 68, 68, 0.18)';
  };

  const getVisitCount = (zone) => (zoneLog[zone] || []).length;

  return (
    <div
      ref={containerRef}
      id={`response-${responseId}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem' }}
    >
      {lines.map((line, i) => {
        const zoneId = `${responseId}:line_${i}`;
        const visits = getVisitCount(zoneId);

        return (
          <div
            key={`${responseId}-${i}`}
            data-zone={zoneId}
            className="gaze-line"
            style={{
              backgroundColor: getHeatBg(zoneId),
            }}
          >
            {line.isBullet && (
              <span className="gaze-line-bullet">•</span>
            )}
            <span>{line.text}</span>

            {heatmapEnabled && visits > 0 && (
              <span
                className="gaze-line-visits"
                style={{
                  backgroundColor: visits <= 2
                    ? 'rgba(16,185,129,0.8)'
                    : visits <= 4
                      ? 'rgba(245,158,11,0.8)'
                      : 'rgba(239,68,68,0.8)',
                }}
              >
                {visits}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
