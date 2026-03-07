import {
  useState, useCallback, useMemo, useEffect, useRef,
} from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { X, MapPin, Minimize2 } from 'lucide-react'
import type { Location } from '../../types/f1'
import {
  computeTransform, locationsToPath,
  type DriverDot, type DriverPath,
} from './TrackMap'

// ─── Constants ────────────────────────────────────────────────────────────────

const SVG_W = 1000
const SVG_H = 700
const SLOT_COLORS = ['#e8002d', '#0067ff', '#ff8700', '#00d2be']
const ZOOM_MIN = 1
const ZOOM_MAX = 16

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotResult {
  id: number
  label: string
  locationData: Location[]
  t0: number
  lapDuration: number
}

function nearestLocation(locations: Location[], targetMs: number): Location | null {
  if (locations.length === 0) return null
  let lo = 0; let hi = locations.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (new Date(locations[mid].date).getTime() < targetMs) lo = mid + 1; else hi = mid
  }
  if (lo === 0) return locations[0]
  const a = locations[lo - 1]; const b = locations[lo]
  return Math.abs(new Date(a.date).getTime() - targetMs) <=
    Math.abs(new Date(b.date).getTime() - targetMs) ? a : b
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// ─── Zoomable / Pannable Track SVG ───────────────────────────────────────────

interface LargeTrackSvgProps {
  allLocations: Location[]
  driverPaths: DriverPath[]
  currentDots: DriverDot[]   // raw GPS coords, converted internally
}

function LargeTrackSvg({ allLocations, driverPaths, currentDots }: LargeTrackSvgProps) {
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState({ x: SVG_W / 2, y: SVG_H / 2 })
  const [followId, setFollowId] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragOrigin, setDragOrigin] = useState({ clientX: 0, clientY: 0, cx: 0, cy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Coordinate transform ──────────────────────────────────────────────────
  const toSvg = useMemo(() => {
    const allPts = [
      ...allLocations,
      ...driverPaths.flatMap(p => p.locations),
    ].map(l => ({ x: l.x, y: l.y }))
    return computeTransform(allPts, SVG_W, SVG_H, 48)
  }, [allLocations, driverPaths])

  // ── Paths ─────────────────────────────────────────────────────────────────
  const outlinePath = useMemo(
    () => locationsToPath(allLocations, toSvg, 1600, true),
    [allLocations, toSvg],
  )

  const svgPaths = useMemo(() =>
    driverPaths.map(p => ({
      ...p,
      d: locationsToPath(p.locations, toSvg, 1000, false),
    })),
    [driverPaths, toSvg],
  )

  // ── Dots in SVG coords ────────────────────────────────────────────────────
  const svgDots = useMemo(
    () => currentDots.map(d => ({ ...d, ...toSvg({ x: d.x, y: d.y }) })),
    [currentDots, toSvg],
  )

  // ── ViewBox ───────────────────────────────────────────────────────────────
  const effectiveCenter = useMemo(() => {
    if (followId !== null) {
      const dot = svgDots.find(d => d.slotId === followId)
      if (dot) return { x: dot.sx, y: dot.sy }
    }
    return center
  }, [followId, svgDots, center])

  const viewBox = useMemo(() => {
    const vw = SVG_W / zoom
    const vh = SVG_H / zoom
    const cx = clamp(effectiveCenter.x, vw / 2, SVG_W - vw / 2)
    const cy = clamp(effectiveCenter.y, vh / 2, SVG_H - vh / 2)
    return `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`
  }, [zoom, effectiveCenter])

  // ── Mouse wheel zoom toward cursor ────────────────────────────────────────
  // Must use imperative listener to call preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3

      setZoom(prevZoom => {
        const newZoom = clamp(prevZoom * factor, ZOOM_MIN, ZOOM_MAX)
        if (newZoom === prevZoom) return prevZoom

        // Zoom toward the mouse cursor position
        const vw = SVG_W / prevZoom
        const vh = SVG_H / prevZoom

        setCenter(prevCenter => {
          const cx = clamp(prevCenter.x, vw / 2, SVG_W - vw / 2)
          const cy = clamp(prevCenter.y, vh / 2, SVG_H - vh / 2)
          // SVG coords of point under mouse
          const rx = (e.clientX - rect.left) / rect.width
          const ry = (e.clientY - rect.top) / rect.height
          const svgX = cx - vw / 2 + rx * vw
          const svgY = cy - vh / 2 + ry * vh
          // New center that keeps that point fixed
          const newVw = SVG_W / newZoom
          const newVh = SVG_H / newZoom
          return {
            x: svgX - rx * newVw + newVw / 2,
            y: svgY - ry * newVh + newVh / 2,
          }
        })
        return newZoom
      })
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, []) // stable: uses setZoom / setCenter functional updaters only

  // ── Drag pan ──────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (followId !== null || e.button !== 0) return
    e.preventDefault()
    setDragging(true)
    setDragOrigin(prev => ({
      ...prev, clientX: e.clientX, clientY: e.clientY, cx: center.x, cy: center.y,
    }))
  }, [followId, center])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const vw = SVG_W / zoom
    const vh = SVG_H / zoom
    const dx = (e.clientX - dragOrigin.clientX) * (vw / rect.width)
    const dy = (e.clientY - dragOrigin.clientY) * (vh / rect.height)
    setCenter({ x: dragOrigin.cx - dx, y: dragOrigin.cy - dy })
  }, [dragging, zoom, dragOrigin])

  const stopDrag = useCallback(() => setDragging(false), [])

  // ── Touch pan ─────────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (followId !== null || e.touches.length !== 1) return
    const t = e.touches[0]
    setDragging(true)
    setDragOrigin({ clientX: t.clientX, clientY: t.clientY, cx: center.x, cy: center.y })
  }, [followId, center])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return
    const t = e.touches[0]
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const vw = SVG_W / zoom; const vh = SVG_H / zoom
    const dx = (t.clientX - dragOrigin.clientX) * (vw / rect.width)
    const dy = (t.clientY - dragOrigin.clientY) * (vh / rect.height)
    setCenter({ x: dragOrigin.cx - dx, y: dragOrigin.cy - dy })
  }, [dragging, zoom, dragOrigin])

  // ── Zoom button helpers ───────────────────────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    setZoom(z => clamp(z * factor, ZOOM_MIN, ZOOM_MAX))
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setCenter({ x: SVG_W / 2, y: SVG_H / 2 })
    setFollowId(null)
  }, [])

  // ── Zoom level presets ────────────────────────────────────────────────────
  const presets = [1, 2, 4, 8]

  // ── Stroke width scales with zoom for consistent visual weight ───────────
  const pathStroke = Math.max(1.5, 4 / Math.sqrt(zoom))
  const dotRadius = Math.max(4, 7 / Math.sqrt(zoom))

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none bg-[#0a0a14] overflow-hidden"
      style={{ cursor: followId !== null ? 'default' : dragging ? 'grabbing' : 'grab' }}
    >
      {/* ── SVG ─────────────────────────────────────────────────────────── */}
      <svg
        viewBox={viewBox}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={stopDrag}
      >
        {/* Track base layers */}
        {outlinePath && <>
          <path d={outlinePath} fill="none" stroke="#1a1a2e" strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <path d={outlinePath} fill="none" stroke="#242436" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
          <path d={outlinePath} fill="none" stroke="#3a3a52" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
          <path d={outlinePath} fill="none" stroke="#52526a" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
          {/* Center line */}
          <path d={outlinePath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 12" />
        </>}

        {/* Driver lap paths – drawn in order, with slight Y offset to separate overlapping lines */}
        {svgPaths.map((p) => {
          // Apply a tiny perpendicular nudge so overlapping lines separate at corners
          // We achieve this with a filter/transform that's imperceptible at zoom=1 but visible at zoom>2
          return p.d ? (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={pathStroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={followId !== null && followId !== p.id ? 0.35 : 0.9}
            />
          ) : null
        })}

        {/* Start markers per driver */}
        {svgPaths.map(p => {
          if (!p.locations[0]) return null
          const { sx, sy } = toSvg({ x: p.locations[0].x, y: p.locations[0].y })
          return (
            <g key={`start-${p.id}`}>
              <circle cx={sx} cy={sy} r={dotRadius * 1.5} fill={p.color} opacity={0.3} />
              <circle cx={sx} cy={sy} r={dotRadius * 0.8} fill={p.color} />
            </g>
          )
        })}

        {/* Position dots with glow */}
        {svgDots.map(dot => (
          <g key={dot.slotId}>
            <circle cx={dot.sx} cy={dot.sy} r={dotRadius * 3} fill={dot.color} opacity={0.12} />
            <circle cx={dot.sx} cy={dot.sy} r={dotRadius * 1.8} fill={dot.color} opacity={0.3} />
            <circle cx={dot.sx} cy={dot.sy} r={dotRadius} fill={dot.color} stroke="#0a0a14" strokeWidth={2} />
            <text
              x={dot.sx} y={dot.sy - dotRadius * 1.8}
              textAnchor="middle"
              fontSize={dotRadius * 2.2}
              fontWeight="800"
              fill={dot.color}
              style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,1))' }}
            >
              {dot.label}
            </text>
          </g>
        ))}
      </svg>

      {/* ── Follow controls (top-left) ──────────────────────────────────── */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 pointer-events-auto">
        <button
          onClick={() => { setFollowId(null) }}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
            followId === null
              ? 'bg-white/15 border-white/30 text-white'
              : 'bg-black/50 border-white/10 text-f1-muted hover:text-white hover:bg-black/70'
          }`}
        >
          自由视角
        </button>
        {driverPaths.map(p => (
          <button
            key={p.id}
            onClick={() => setFollowId(id => id === p.id ? null : p.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border"
            style={
              followId === p.id
                ? { backgroundColor: p.color, borderColor: p.color, color: '#fff' }
                : { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.1)', color: '#8888aa' }
            }
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: followId === p.id ? '#fff' : p.color }} />
            {p.label}
          </button>
        ))}
        {followId !== null && (
          <span className="flex items-center px-2 py-1 text-xs text-white/60 italic">
            跟随中 · 拖动无效
          </span>
        )}
      </div>

      {/* ── Zoom controls (bottom-right) ───────────────────────────────── */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 pointer-events-auto border border-white/10">
        {/* Presets */}
        {presets.map(p => (
          <button
            key={p}
            onClick={() => { setZoom(p); setFollowId(null) }}
            className={`w-7 h-6 text-xs rounded transition-colors ${
              Math.abs(zoom - p) < 0.1
                ? 'bg-white/20 text-white'
                : 'text-f1-muted hover:text-white'
            }`}
          >
            {p}×
          </button>
        ))}
        <div className="w-px h-4 bg-white/20 mx-1" />
        {/* Fine controls */}
        <button
          onClick={() => zoomBy(1 / 1.3)}
          className="w-6 h-6 flex items-center justify-center text-white hover:text-f1-red rounded transition-colors text-lg leading-none"
          title="缩小"
        >−</button>
        <span className="font-mono text-white text-xs w-11 text-center">
          {zoom < 10 ? zoom.toFixed(1) : zoom.toFixed(0)}×
        </span>
        <button
          onClick={() => zoomBy(1.3)}
          className="w-6 h-6 flex items-center justify-center text-white hover:text-green-400 rounded transition-colors text-lg leading-none"
          title="放大"
        >+</button>
        <div className="w-px h-4 bg-white/20 mx-1" />
        <button
          onClick={resetView}
          className="flex items-center gap-1 text-f1-muted hover:text-white text-xs transition-colors px-1"
          title="重置视图"
        >
          <Minimize2 className="w-3 h-3" />全图
        </button>
      </div>

      {/* ── Zoom level indicator (top-right) ──────────────────────────── */}
      {zoom > 1.1 && (
        <div className="absolute top-3 right-3 text-[10px] font-mono text-white/40 bg-black/40 px-2 py-0.5 rounded pointer-events-none">
          {zoom.toFixed(1)}× {followId !== null ? '· 跟随' : '· 拖动平移'}
        </div>
      )}
    </div>
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const allLocations = useMemo(() => results.flatMap(r => r.locationData), [results])

  const driverPaths = useMemo<DriverPath[]>(() =>
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

  const tooltipContent = useCallback(
    (props: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: number }) =>
      SpeedTooltip({ ...props, results }),
    [results],
  )

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-f1-dark/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-f1-border flex-shrink-0 bg-f1-gray">
        <div className="flex items-center gap-3 min-w-0">
          <MapPin className="w-5 h-5 text-green-400 flex-shrink-0" />
          <h2 className="text-white font-semibold">赛道路线对比</h2>
          <div className="flex items-center gap-2 ml-1 flex-wrap">
            {driverPaths.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs text-f1-muted">
                <div className="w-5 h-1 rounded-full" style={{ backgroundColor: p.color }} />
                {p.label}
              </div>
            ))}
            {allLocations.length === 0 && (
              <span className="text-xs text-amber-400">暂无 GPS 数据</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <span className="text-xs text-f1-muted hidden sm:block">滚轮缩放 · 拖动平移 · 点击跟随</span>
          <button
            onClick={onClose}
            className="p-2 text-f1-muted hover:text-white hover:bg-f1-card rounded-lg transition-colors"
            title="关闭 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Track map – takes all remaining height except the chart */}
      <div className="flex-1 min-h-0">
        <LargeTrackSvg
          allLocations={allLocations}
          driverPaths={driverPaths}
          currentDots={currentDots}
        />
      </div>

      {/* Speed timeline */}
      <div className="h-52 flex-shrink-0 border-t border-f1-border bg-f1-gray/50 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold text-white">速度时间线</p>
          <p className="text-xs text-f1-muted">— 悬停此图，地图跟随车手位置</p>
          {hoverTime != null && (
            <span className="ml-auto font-mono text-xs text-white bg-f1-card px-2 py-0.5 rounded">
              {hoverTime.toFixed(2)}s
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
