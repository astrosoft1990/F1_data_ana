import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { X, MapPin } from 'lucide-react'
import type { Location } from '../../types/f1'
import {
  computeTransform, locationsToPath,
  type DriverDot, type DriverPath,
} from './TrackMap'

// ─── Slot result (subset of the full type) ────────────────────────────────────

interface SlotResult {
  id: number
  label: string
  locationData: Location[]
  t0: number
  lapDuration: number
}

const SLOT_COLORS = ['#e8002d', '#0067ff', '#ff8700', '#00d2be']

// ─── nearestLocation (binary search) ─────────────────────────────────────────

function nearestLocation(locations: Location[], targetMs: number): Location | null {
  if (locations.length === 0) return null
  let lo = 0; let hi = locations.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (new Date(locations[mid].date).getTime() < targetMs) lo = mid + 1; else hi = mid
  }
  if (lo === 0) return locations[0]
  const a = locations[lo - 1]; const b = locations[lo]
  const ams = new Date(a.date).getTime(); const bms = new Date(b.date).getTime()
  return Math.abs(ams - targetMs) <= Math.abs(bms - targetMs) ? a : b
}

// ─── Large track SVG ──────────────────────────────────────────────────────────

function LargeTrackSvg({
  allLocations, paths, currentDots,
}: {
  allLocations: Location[]
  paths: DriverPath[]
  currentDots: DriverDot[]
}) {
  const PAD = 32
  // viewBox is 1000×700; SVG scales via preserveAspectRatio
  const W = 1000; const H = 700

  const toSvg = useMemo(() => {
    const allPts = [
      ...allLocations,
      ...paths.flatMap(p => p.locations),
    ].map(l => ({ x: l.x, y: l.y }))
    return computeTransform(allPts, W, H, PAD)
  }, [allLocations, paths])

  const outlinePath = useMemo(
    () => locationsToPath(allLocations, toSvg, 1500, true),
    [allLocations, toSvg],
  )

  const driverSvgPaths = useMemo(() =>
    paths.map(p => ({
      ...p,
      svgPath: locationsToPath(p.locations, toSvg, 800, false),
    })),
    [paths, toSvg],
  )

  const dots = useMemo(
    () => currentDots.map(d => ({ ...d, ...toSvg({ x: d.x, y: d.y }) })),
    [currentDots, toSvg],
  )

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Track base outline */}
      {outlinePath && <>
        <path d={outlinePath} fill="none" stroke="#2a2a3e" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
        <path d={outlinePath} fill="none" stroke="#3a3a52" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
        <path d={outlinePath} fill="none" stroke="#52526a" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      </>}

      {/* Driver lap paths */}
      {driverSvgPaths.map(p => p.svgPath && (
        <path
          key={p.id}
          d={p.svgPath}
          fill="none"
          stroke={p.color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      ))}

      {/* Start/finish triangle markers */}
      {driverSvgPaths.map(p => {
        if (!p.locations[0]) return null
        const { sx, sy } = toSvg({ x: p.locations[0].x, y: p.locations[0].y })
        return (
          <g key={`start-${p.id}`}>
            <circle cx={sx} cy={sy} r={6} fill={p.color} opacity={0.6} />
          </g>
        )
      })}

      {/* Position dots with glow */}
      {dots.map(dot => (
        <g key={dot.slotId}>
          <circle cx={dot.sx} cy={dot.sy} r={16} fill={dot.color} opacity={0.15} />
          <circle cx={dot.sx} cy={dot.sy} r={9} fill={dot.color} opacity={0.35} />
          <circle cx={dot.sx} cy={dot.sy} r={6} fill={dot.color} stroke="#0a0a14" strokeWidth={2} />
          <text
            x={dot.sx} y={dot.sy - 14}
            textAnchor="middle"
            fontSize={14} fontWeight="800"
            fill={dot.color}
            style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.9))' }}
          >
            {dot.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function SpeedTooltip({
  active, payload, label, results,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: number
  results: SlotResult[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-f1-card border border-f1-border rounded-lg p-2 text-xs shadow-xl min-w-[140px]">
      <p className="text-f1-muted mb-1.5">{label}s</p>
      {payload.filter(p => p.value != null).map(p => {
        const id = Number(p.dataKey.split('_')[1])
        const res = results.find(r => r.id === id)
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-f1-muted truncate max-w-[80px]">{res?.label}</span>
            <span className="text-white font-mono ml-auto">{Math.round(p.value)} km/h</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface TrackMapModalProps {
  results: SlotResult[]
  mergedData: Array<Record<string, number | null>>
  onClose: () => void
}

export default function TrackMapModal({ results, mergedData, onClose }: TrackMapModalProps) {
  const [hoverTime, setHoverTime] = useState<number | null>(null)

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // All locations combined (for track outline bounds)
  const allLocations = useMemo(
    () => results.flatMap(r => r.locationData),
    [results],
  )

  // Per-driver paths
  const paths = useMemo<DriverPath[]>(() =>
    results
      .filter(r => r.locationData.length > 0)
      .map(r => ({
        id: r.id,
        color: SLOT_COLORS[r.id % SLOT_COLORS.length],
        label: r.label.split(' ')[0],
        locations: r.locationData,
      })),
    [results],
  )

  // Current position dots based on hover time
  const currentDots = useMemo<DriverDot[]>(() => {
    if (hoverTime == null) return []
    return results.flatMap(r => {
      if (r.locationData.length === 0) return []
      const loc = nearestLocation(r.locationData, r.t0 + hoverTime * 1000)
      if (!loc) return []
      return [{
        slotId: r.id,
        color: SLOT_COLORS[r.id % SLOT_COLORS.length],
        label: r.label.split(' ')[0],
        x: loc.x, y: loc.y,
      }]
    })
  }, [hoverTime, results])

  const hasLocations = allLocations.length > 0

  const tooltipContent = useCallback(
    (props: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: number }) =>
      SpeedTooltip({ ...props, results }),
    [results],
  )

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-f1-dark/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-f1-border flex-shrink-0 bg-f1-gray">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-green-400" />
          <h2 className="text-white font-semibold">赛道路线对比</h2>
          <div className="flex items-center gap-2 ml-2">
            {results.filter(r => r.locationData.length > 0).map(r => (
              <div key={r.id} className="flex items-center gap-1.5 text-xs text-f1-muted">
                <div className="w-3 h-1.5 rounded-full" style={{ backgroundColor: SLOT_COLORS[r.id % SLOT_COLORS.length] }} />
                {r.label}
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-f1-muted hover:text-white hover:bg-f1-card rounded-lg transition-colors"
          title="关闭 (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Track map */}
      <div className="flex-1 min-h-0 relative bg-f1-dark p-4 pb-2">
        {!hasLocations ? (
          <div className="w-full h-full flex items-center justify-center text-f1-muted text-sm">
            暂无 GPS 位置数据
          </div>
        ) : (
          <LargeTrackSvg
            allLocations={allLocations}
            paths={paths}
            currentDots={currentDots}
          />
        )}

        {/* Hover time badge */}
        {hoverTime != null && (
          <div className="absolute top-6 right-6 bg-f1-card border border-f1-border rounded-lg px-3 py-1.5 text-xs font-mono text-white shadow-xl">
            {hoverTime.toFixed(2)}s
          </div>
        )}

        {/* Legend for path start */}
        <div className="absolute bottom-4 left-6 flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px] text-f1-muted">
            <div className="w-2 h-2 rounded-full bg-f1-muted/60" />
            起点
          </div>
        </div>
      </div>

      {/* Speed timeline chart */}
      <div className="h-52 flex-shrink-0 border-t border-f1-border px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold text-white">速度时间线</p>
          <p className="text-xs text-f1-muted">— 悬停查看赛道位置</p>
          {hoverTime != null && (
            <span className="ml-auto text-xs text-f1-muted">
              圈内 <span className="font-mono text-white">{hoverTime.toFixed(2)}s</span>
            </span>
          )}
        </div>
        <div style={{ height: 'calc(100% - 28px)' }}>
          <ResponsiveContainer>
            <LineChart
              data={mergedData}
              margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              onMouseMove={e => setHoverTime(e?.activeLabel as number ?? null)}
              onMouseLeave={() => setHoverTime(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
              <XAxis dataKey="time" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
              <YAxis stroke="#8888aa" tick={{ fontSize: 10 }} unit=" km/h" domain={[0, 380]} width={44} />
              <Tooltip
                content={tooltipContent as any}
                cursor={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1, strokeDasharray: '4 3' }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px' }}
                formatter={(value: string) => {
                  const id = Number(value.split('_')[1])
                  return results.find(r => r.id === id)?.label ?? value
                }}
              />
              {results.map(r => (
                <Line
                  key={r.id}
                  type="monotone"
                  dataKey={`speed_${r.id}`}
                  stroke={SLOT_COLORS[r.id % SLOT_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
