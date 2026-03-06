import { useMemo } from 'react'
import type { Location } from '../../types/f1'
import { Maximize2 } from 'lucide-react'

// ─── Shared types (also used by TrackMapModal) ────────────────────────────────

export interface DriverDot { slotId: number; color: string; label: string; x: number; y: number }
export interface DriverPath { id: number; color: string; label: string; locations: Location[] }

interface TrackPoint { x: number; y: number }

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Downsample an array to at most maxPoints elements */
export function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = arr.length / maxPoints
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.floor(i * step)])
}

/**
 * Compute an (x,y) → SVG coordinate transform from a set of reference points.
 * Y axis is flipped (map Y increases upward, SVG Y increases downward).
 */
export function computeTransform(
  points: TrackPoint[],
  svgW: number,
  svgH: number,
  padding: number,
): (p: TrackPoint) => { sx: number; sy: number } {
  if (points.length === 0) return () => ({ sx: 0, sy: 0 })

  const minX = Math.min(...points.map(p => p.x))
  const maxX = Math.max(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y))
  const maxY = Math.max(...points.map(p => p.y))

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const scale = Math.min((svgW - 2 * padding) / rangeX, (svgH - 2 * padding) / rangeY)

  const offsetX = (svgW - rangeX * scale) / 2 - minX * scale
  const offsetY = (svgH - rangeY * scale) / 2 + maxY * scale

  return (p: TrackPoint) => ({
    sx: Math.round((p.x * scale + offsetX) * 10) / 10,
    sy: Math.round((-p.y * scale + offsetY) * 10) / 10,
  })
}

/** Convert a list of locations to an SVG path string */
export function locationsToPath(
  locations: Location[],
  toSvg: (p: TrackPoint) => { sx: number; sy: number },
  maxPoints = 800,
  close = false,
): string {
  if (locations.length === 0) return ''
  const sampled = downsample(locations, maxPoints)
  const d = sampled.map((l, i) => {
    const { sx, sy } = toSvg({ x: l.x, y: l.y })
    return `${i === 0 ? 'M' : 'L'}${sx},${sy}`
  }).join(' ')
  return close ? d + ' Z' : d
}

// ─── Small TrackMap (inline card) ────────────────────────────────────────────

interface TrackMapProps {
  allLocations: Location[]
  currentDots: DriverDot[]
  paths?: DriverPath[]
  width?: number
  height?: number
  onExpand?: () => void
}

export default function TrackMap({
  allLocations, currentDots, paths, width = 280, height = 200, onExpand,
}: TrackMapProps) {
  const PAD = 14

  const toSvg = useMemo(() => {
    const allPts = [
      ...allLocations,
      ...(paths?.flatMap(p => p.locations) ?? []),
    ].map(l => ({ x: l.x, y: l.y }))
    return computeTransform(allPts, width, height, PAD)
  }, [allLocations, paths, width, height])

  const outlinePath = useMemo(
    () => locationsToPath(allLocations, toSvg, 1000, true),
    [allLocations, toSvg],
  )

  const driverPaths = useMemo(() =>
    (paths ?? []).map(p => ({
      ...p,
      svgPath: locationsToPath(p.locations, toSvg, 500, false),
    })),
    [paths, toSvg],
  )

  const dots = useMemo(
    () => currentDots.map(d => ({ ...d, ...toSvg({ x: d.x, y: d.y }) })),
    [currentDots, toSvg],
  )

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
    <div
      className="relative bg-f1-dark border border-f1-border rounded-xl overflow-hidden group"
      style={{ width, height }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Track outline */}
        {outlinePath && <>
          <path d={outlinePath} fill="none" stroke="#383850" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <path d={outlinePath} fill="none" stroke="#52525e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </>}

        {/* Driver lap paths */}
        {driverPaths.map(p => p.svgPath && (
          <path
            key={p.id}
            d={p.svgPath}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
          />
        ))}

        {/* Position dots */}
        {dots.map(dot => (
          <g key={dot.slotId}>
            <circle cx={dot.sx} cy={dot.sy} r={8} fill={dot.color} opacity={0.25} />
            <circle cx={dot.sx} cy={dot.sy} r={5} fill={dot.color} stroke="#15151e" strokeWidth={1.5} />
            <text x={dot.sx} y={dot.sy - 9} textAnchor="middle" fontSize={8} fontWeight="700" fill={dot.color}>
              {dot.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Expand button */}
      {onExpand && (
        <button
          onClick={onExpand}
          className="absolute top-2 right-2 p-1.5 bg-f1-gray/80 border border-f1-border rounded-lg text-f1-muted hover:text-white hover:bg-f1-card transition-colors opacity-0 group-hover:opacity-100"
          title="展开地图"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="absolute bottom-1.5 left-2 text-f1-muted/60 text-[9px] font-mono">
        GPS POSITION
      </div>
    </div>
  )
}
