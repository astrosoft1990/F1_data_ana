import { useMemo } from 'react'
import type { Location } from '../../types/f1'

interface TrackPoint { x: number; y: number }
interface DriverDot { slotId: number; color: string; label: string; x: number; y: number }

interface TrackMapProps {
  /** All location data available (used to draw the circuit outline) */
  allLocations: Location[]
  /** Current highlighted positions, one per active slot */
  currentDots: DriverDot[]
  width?: number
  height?: number
}

function normalizePath(
  points: TrackPoint[],
  svgW: number,
  svgH: number,
  padding: number,
): { path: string; toSvg: (p: TrackPoint) => { sx: number; sy: number } } {
  if (points.length === 0) return { path: '', toSvg: () => ({ sx: 0, sy: 0 }) }

  const minX = Math.min(...points.map(p => p.x))
  const maxX = Math.max(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y))
  const maxY = Math.max(...points.map(p => p.y))

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const scale = Math.min((svgW - 2 * padding) / rangeX, (svgH - 2 * padding) / rangeY)

  // Center the track
  const offsetX = (svgW - rangeX * scale) / 2 - minX * scale
  const offsetY = (svgH - rangeY * scale) / 2 + maxY * scale  // flip Y

  const toSvg = (p: TrackPoint) => ({
    sx: Math.round((p.x * scale + offsetX) * 10) / 10,
    sy: Math.round((-p.y * scale + offsetY) * 10) / 10,
  })

  const d = points.map((p, i) => {
    const { sx, sy } = toSvg(p)
    return `${i === 0 ? 'M' : 'L'}${sx},${sy}`
  }).join(' ') + ' Z'

  return { path: d, toSvg }
}

/** Downsample an array to at most maxPoints elements */
function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = arr.length / maxPoints
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.floor(i * step)])
}

export default function TrackMap({ allLocations, currentDots, width = 280, height = 200 }: TrackMapProps) {
  const PAD = 16

  const { path, toSvg } = useMemo(() => {
    if (allLocations.length === 0) return { path: '', toSvg: () => ({ sx: 0, sy: 0 }) }

    // Downsample for performance (track outline doesn't need every point)
    const sampled = downsample(allLocations, 1200)
    const points = sampled.map(l => ({ x: l.x, y: l.y }))
    return normalizePath(points, width, height, PAD)
  }, [allLocations, width, height])

  const dots = useMemo(() => currentDots.map(dot => ({
    ...dot,
    ...toSvg({ x: dot.x, y: dot.y }),
  })), [currentDots, toSvg])

  if (allLocations.length === 0) {
    return (
      <div
        className="bg-f1-dark border border-f1-border rounded-xl flex items-center justify-center text-f1-muted text-xs"
        style={{ width, height }}
      >
        加载赛道地图...
      </div>
    )
  }

  return (
    <div className="relative bg-f1-dark border border-f1-border rounded-xl overflow-hidden" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Track outline */}
        {path && (
          <path
            d={path}
            fill="none"
            stroke="#383850"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {path && (
          <path
            d={path}
            fill="none"
            stroke="#52525e"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Driver position dots */}
        {dots.map(dot => (
          <g key={dot.slotId}>
            {/* Glow */}
            <circle cx={dot.sx} cy={dot.sy} r={8} fill={dot.color} opacity={0.25} />
            {/* Dot */}
            <circle cx={dot.sx} cy={dot.sy} r={5} fill={dot.color} stroke="#15151e" strokeWidth={1.5} />
            {/* Label */}
            <text
              x={dot.sx} y={dot.sy - 9}
              textAnchor="middle" fontSize={8} fontWeight="700"
              fill={dot.color}
              style={{ textShadow: '0 0 4px #000' }}
            >
              {dot.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Corner label */}
      <div className="absolute bottom-1.5 left-2 text-f1-muted/60 text-[9px] font-mono">
        GPS POSITION
      </div>
    </div>
  )
}
