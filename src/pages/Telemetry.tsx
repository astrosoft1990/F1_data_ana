import { useState, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { openF1Api } from '../api/openf1'
import type { Session, Driver, Lap, CarData } from '../types/f1'
import { formatLapTime, groupLapsByDriver } from '../utils/f1'
import SessionSelector from '../components/common/SessionSelector'
import { Card, SectionHeader } from '../components/common/StatCard'
import { Activity, Zap, Gauge, AlertCircle, Plus, X, CheckCircle2 } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const SLOT_COLORS = ['#e8002d', '#0067ff', '#ff8700', '#00d2be']
const MAX_SLOTS = 4
const RESAMPLE_STEP = 0.25   // seconds per chart point
const MAX_CHART_POINTS = 600 // prevent browser slowdown

// ─── Types ────────────────────────────────────────────────────────────────────

interface Slot {
  id: number
  driverNum: number | null
  lapNum: number | null
}

interface SlotResult {
  id: number
  data: CarData[]
  lapDuration: number
  label: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize raw CarData array into a time-indexed series (t = seconds from lap start) */
function toTimeSeries(data: CarData[]): Array<{
  t: number; speed: number; throttle: number; brake: number; gear: number; rpm: number
}> {
  if (data.length === 0) return []
  const t0 = new Date(data[0].date).getTime()
  return data.map(d => ({
    t: (new Date(d.date).getTime() - t0) / 1000,
    speed: d.speed,
    throttle: d.throttle,
    brake: d.brake ? 100 : 0,
    gear: d.n_gear,
    rpm: d.rpm,
  }))
}

type Channel = 'speed' | 'throttle' | 'brake' | 'gear' | 'rpm'

/** Linear interpolation at a given time t */
function interpolate(
  series: Array<{ t: number } & Record<Channel, number>>,
  t: number,
  channel: Channel,
): number | null {
  if (series.length === 0) return null
  if (t < series[0].t) return series[0][channel]
  if (t > series[series.length - 1].t) return null

  let lo = 0; let hi = series.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (series[mid].t <= t) lo = mid; else hi = mid
  }
  const a = series[lo]; const b = series[hi]
  const ratio = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
  return a[channel] + ratio * (b[channel] - a[channel])
}

/** Merge up to 4 time-series onto a common time grid */
function buildMergedData(
  results: Array<{ id: number; series: ReturnType<typeof toTimeSeries>; lapDuration: number }>,
): Array<Record<string, number | null>> {
  if (results.length === 0) return []

  const maxT = Math.max(...results.map(r => r.lapDuration))
  const step = Math.max(RESAMPLE_STEP, maxT / MAX_CHART_POINTS)
  const rows: Array<Record<string, number | null>> = []

  for (let t = 0; t <= maxT + step; t += step) {
    const row: Record<string, number | null> = { time: Math.round(t * 10) / 10 }
    for (const r of results) {
      const key = String(r.id)
      row[`speed_${key}`] = interpolate(r.series, t, 'speed')
      row[`throttle_${key}`] = interpolate(r.series, t, 'throttle')
      row[`brake_${key}`] = interpolate(r.series, t, 'brake')
      row[`gear_${key}`] = interpolate(r.series, t, 'gear')
      row[`rpm_${key}`] = interpolate(r.series, t, 'rpm')
    }
    rows.push(row)
  }
  return rows
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SlotCard({
  slot,
  index,
  drivers,
  lapsByDriver,
  color,
  loaded,
  loading,
  error,
  onChange,
  onRemove,
}: {
  slot: Slot
  index: number
  drivers: Driver[]
  lapsByDriver: Map<number, Lap[]>
  color: string
  loaded: boolean
  loading: boolean
  error: string | null
  onChange: (id: number, field: 'driverNum' | 'lapNum', value: number | null) => void
  onRemove: (id: number) => void
}) {
  const driverLaps = slot.driverNum
    ? (lapsByDriver.get(slot.driverNum) || [])
        .filter(l => l.lap_duration != null && l.date_start)
        .sort((a, b) => a.lap_number - b.lap_number)
    : []

  return (
    <div
      className="bg-f1-gray border rounded-xl p-3 relative"
      style={{ borderColor: loaded ? color : '#383850' }}
    >
      {/* Color stripe + status */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold text-f1-muted uppercase tracking-wider">
          轨迹 {index + 1}
        </span>
        {loading && (
          <div className="ml-auto w-4 h-4 animate-spin rounded-full border-2 border-f1-border border-t-white" />
        )}
        {loaded && !loading && (
          <CheckCircle2 className="ml-auto w-4 h-4 text-green-400" />
        )}
        {error && !loading && (
          <AlertCircle className="ml-auto w-4 h-4 text-amber-400" />
        )}
        <button
          onClick={() => onRemove(slot.id)}
          className="text-f1-muted hover:text-white transition-colors ml-1"
          title="移除此轨迹"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Driver select */}
      <div className="mb-2">
        <label className="text-xs text-f1-muted block mb-1">车手</label>
        <select
          value={slot.driverNum ?? ''}
          onChange={e => onChange(slot.id, 'driverNum', e.target.value ? Number(e.target.value) : null)}
          className="bg-f1-dark border border-f1-border text-white rounded-lg px-2 py-1.5 text-xs w-full focus:outline-none"
          style={{ borderColor: slot.driverNum ? color : undefined }}
        >
          <option value="">— 选择车手 —</option>
          {drivers.map(d => (
            <option key={d.driver_number} value={d.driver_number}>
              {d.name_acronym} #{d.driver_number}
            </option>
          ))}
        </select>
      </div>

      {/* Lap select */}
      <div>
        <label className="text-xs text-f1-muted block mb-1">
          圈次 {driverLaps.length > 0 && <span className="text-f1-muted/60">({driverLaps.length} 圈)</span>}
        </label>
        <select
          value={slot.lapNum ?? ''}
          onChange={e => onChange(slot.id, 'lapNum', e.target.value ? Number(e.target.value) : null)}
          disabled={!slot.driverNum || driverLaps.length === 0}
          className="bg-f1-dark border border-f1-border text-white rounded-lg px-2 py-1.5 text-xs w-full focus:outline-none disabled:opacity-40"
        >
          <option value="">— 选择圈次 —</option>
          {driverLaps.map(l => (
            <option key={l.lap_number} value={l.lap_number}>
              第 {l.lap_number} 圈 — {formatLapTime(l.lap_duration)}
              {l.is_pit_out_lap ? ' [出站]' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function TelTooltip({
  active, payload, label, results, channel, unit,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: number
  results: SlotResult[]
  channel: string
  unit: string
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
            <span className="text-white font-mono ml-auto">
              {typeof p.value === 'number' ? p.value.toFixed(channel === 'gear' ? 0 : 0) : '--'}{unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Chart block ──────────────────────────────────────────────────────────────

function TelChart({
  title, subtitle, channel, unit, domain, results, mergedData, step,
}: {
  title: string
  subtitle: string
  channel: string
  unit: string
  domain?: [number | 'auto', number | 'auto']
  results: SlotResult[]
  mergedData: Array<Record<string, number | null>>
  step?: 'stepAfter' | 'monotone'
}) {
  const tooltipRenderer = useCallback(
    (props: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: number }) =>
      TelTooltip({ ...props, results, channel, unit }),
    [results, channel, unit]
  )

  return (
    <Card className="p-4">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="h-44">
        <ResponsiveContainer>
          <LineChart data={mergedData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
            <XAxis dataKey="time" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
            <YAxis stroke="#8888aa" tick={{ fontSize: 10 }} domain={domain ?? ['auto', 'auto']} unit={unit} width={40} />
            <Tooltip content={tooltipRenderer as any} />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value: string) => {
                const id = Number(value.split('_')[1])
                return results.find(r => r.id === id)?.label ?? value
              }}
            />
            {results.map(r => (
              <Line
                key={r.id}
                type={step ?? 'monotone'}
                dataKey={`${channel}_${r.id}`}
                stroke={SLOT_COLORS[r.id]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Telemetry() {
  const [session, setSession] = useState<Session | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [laps, setLaps] = useState<Lap[]>([])
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  // Slot state
  const [slots, setSlots] = useState<Slot[]>([
    { id: 0, driverNum: null, lapNum: null },
    { id: 1, driverNum: null, lapNum: null },
  ])
  const nextId = useMemo(() => Math.max(...slots.map(s => s.id), -1) + 1, [slots])

  // Per-slot telemetry results
  const [results, setResults] = useState<SlotResult[]>([])
  const [slotLoading, setSlotLoading] = useState<Set<number>>(new Set())
  const [slotErrors, setSlotErrors] = useState<Map<number, string>>(new Map())

  const lapsByDriver = useMemo(() => groupLapsByDriver(laps), [laps])

  // ── Session load ────────────────────────────────────────────────────────────
  const loadSession = useCallback(async (s: Session) => {
    setSession(s)
    setSessionLoading(true)
    setSessionError(null)
    setResults([])
    setSlotErrors(new Map())

    try {
      const [driverList, lapData] = await Promise.all([
        openF1Api.getDrivers(s.session_key),
        openF1Api.getLaps(s.session_key),
      ])
      setDrivers(driverList)
      setLaps(lapData)

      // Auto-fill first two slots with top 2 drivers + a mid-race lap
      const grouped = groupLapsByDriver(lapData)
      const validDrivers = driverList.slice(0, 4)

      setSlots(validDrivers.slice(0, 2).map((d, i) => {
        const driverLaps = (grouped.get(d.driver_number) || [])
          .filter(l => l.lap_duration != null && !l.is_pit_out_lap && l.date_start)
          .sort((a, b) => a.lap_number - b.lap_number)
        const goodLap = driverLaps.find(l => l.lap_number >= 3) ?? driverLaps[0]
        return { id: i, driverNum: d.driver_number, lapNum: goodLap?.lap_number ?? null }
      }))
    } catch (e: unknown) {
      setSessionError(`加载失败: ${e instanceof Error ? e.message : '请检查网络'}`)
    } finally {
      setSessionLoading(false)
    }
  }, [])

  // ── Slot management ─────────────────────────────────────────────────────────
  const handleSlotChange = useCallback((id: number, field: 'driverNum' | 'lapNum', value: number | null) => {
    setSlots(prev => prev.map(s => {
      if (s.id !== id) return s
      if (field === 'driverNum') return { ...s, driverNum: value, lapNum: null }
      return { ...s, [field]: value }
    }))
    // Clear this slot's result when config changes
    setResults(prev => prev.filter(r => r.id !== id))
    setSlotErrors(prev => { const m = new Map(prev); m.delete(id); return m })
  }, [])

  const addSlot = useCallback(() => {
    if (slots.length >= MAX_SLOTS) return
    setSlots(prev => [...prev, { id: nextId, driverNum: null, lapNum: null }])
  }, [slots.length, nextId])

  const removeSlot = useCallback((id: number) => {
    setSlots(prev => prev.filter(s => s.id !== id))
    setResults(prev => prev.filter(r => r.id !== id))
    setSlotErrors(prev => { const m = new Map(prev); m.delete(id); return m })
  }, [])

  // ── Load telemetry for all configured slots ─────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!session) return

    const toLoad = slots.filter(s => s.driverNum != null && s.lapNum != null)
    if (toLoad.length === 0) return

    // Only reload slots that don't have results yet or had errors
    const needLoad = toLoad.filter(s =>
      !results.find(r => r.id === s.id) || slotErrors.has(s.id)
    )
    if (needLoad.length === 0) return

    setSlotLoading(new Set(needLoad.map(s => s.id)))
    setSlotErrors(prev => {
      const m = new Map(prev)
      needLoad.forEach(s => m.delete(s.id))
      return m
    })

    const fetches = needLoad.map(async (slot) => {
      const lap = lapsByDriver.get(slot.driverNum!)?.find(l => l.lap_number === slot.lapNum)
      if (!lap?.date_start) {
        return { id: slot.id, error: `第 ${slot.lapNum} 圈无时间戳数据` }
      }

      try {
        const data = await openF1Api.getCarDataForLap(session.session_key, slot.driverNum!, lap)
        if (data.length === 0) {
          return { id: slot.id, error: `未找到遥测数据（OpenF1 仅保存近期数据）` }
        }
        const driver = drivers.find(d => d.driver_number === slot.driverNum)
        return {
          id: slot.id,
          data,
          lapDuration: lap.lap_duration ?? 120,
          label: `${driver?.name_acronym ?? `#${slot.driverNum}`} L${slot.lapNum}`,
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return {
          id: slot.id,
          error: msg.includes('timeout') ? '请求超时，请重试' : `加载失败: ${msg}`,
        }
      }
    })

    const settled = await Promise.all(fetches)

    setSlotLoading(new Set())
    setResults(prev => {
      const next = prev.filter(r => !needLoad.find(s => s.id === r.id))
      for (const res of settled) {
        if ('data' in res) next.push(res as SlotResult)
      }
      return next
    })
    setSlotErrors(prev => {
      const m = new Map(prev)
      for (const res of settled) {
        if ('error' in res) m.set(res.id, res.error as string)
      }
      return m
    })
  }, [session, slots, results, slotErrors, lapsByDriver, drivers])

  // ── Build merged chart data ──────────────────────────────────────────────────
  const mergedData = useMemo(() => {
    if (results.length === 0) return []
    const withSeries = results.map(r => ({
      ...r,
      series: toTimeSeries(r.data),
    }))
    return buildMergedData(withSeries)
  }, [results])

  // ── Stats per slot ────────────────────────────────────────────────────────────
  const stats = useMemo(() => results.map(r => {
    const series = toTimeSeries(r.data)
    const speeds = series.map(d => d.speed).filter(v => v > 0)
    const throttles = series.map(d => d.throttle)
    const brakes = series.map(d => d.brake)
    return {
      id: r.id,
      label: r.label,
      maxSpeed: speeds.length ? Math.max(...speeds) : 0,
      avgSpeed: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0,
      fullThrottlePct: throttles.length ? Math.round(throttles.filter(v => v > 90).length / throttles.length * 100) : 0,
      brakePct: brakes.length ? Math.round(brakes.filter(v => v > 0).length / brakes.length * 100) : 0,
    }
  }), [results])

  const readyToLoad = slots.some(s => s.driverNum && s.lapNum)
  const hasResults = results.length > 0
  const anyLoading = slotLoading.size > 0

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="w-5 h-5 text-green-400" />
        <h1 className="text-xl font-bold text-white">遥测数据对比</h1>
        <span className="text-xs text-f1-muted bg-f1-card border border-f1-border px-2 py-0.5 rounded-full">
          最多 {MAX_SLOTS} 条轨迹 · 跨圈次自由对比
        </span>
      </div>

      {/* Session selector */}
      <SessionSelector onSelect={loadSession} selectedKey={session?.session_key} />

      {sessionLoading && (
        <div className="bg-f1-card border border-f1-border rounded-xl p-5 flex items-center gap-3 text-f1-muted text-sm">
          <div className="w-5 h-5 animate-spin rounded-full border-2 border-f1-border border-t-green-400" />
          加载会话数据...
        </div>
      )}
      {sessionError && (
        <div className="bg-f1-card border border-red-900/50 rounded-xl p-4 text-red-400 text-sm">{sessionError}</div>
      )}

      {/* Slot configurator */}
      {session && !sessionLoading && drivers.length > 0 && (
        <div className="space-y-3">
          <div className={`grid gap-3 ${slots.length === 1 ? 'grid-cols-1' : slots.length === 2 ? 'grid-cols-2' : slots.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
            {slots.map((slot, index) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                index={index}
                drivers={drivers}
                lapsByDriver={lapsByDriver}
                color={SLOT_COLORS[slot.id % SLOT_COLORS.length]}
                loaded={results.some(r => r.id === slot.id)}
                loading={slotLoading.has(slot.id)}
                error={slotErrors.get(slot.id) ?? null}
                onChange={handleSlotChange}
                onRemove={removeSlot}
              />
            ))}

            {/* Add slot button */}
            {slots.length < MAX_SLOTS && (
              <button
                onClick={addSlot}
                className="border-2 border-dashed border-f1-border rounded-xl p-3 flex flex-col items-center justify-center gap-2 text-f1-muted hover:border-f1-muted hover:text-white transition-colors min-h-[140px]"
              >
                <Plus className="w-6 h-6" />
                <span className="text-xs">添加轨迹</span>
              </button>
            )}
          </div>

          {/* Load button */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={loadAll}
              disabled={!readyToLoad || anyLoading}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {anyLoading ? (
                <><div className="w-4 h-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  加载中 ({slotLoading.size} / {slots.filter(s => s.driverNum && s.lapNum).length})...</>
              ) : (
                <><Zap className="w-4 h-4" />
                  {hasResults ? '重新加载未完成的轨迹' : '加载遥测对比数据'}</>
              )}
            </button>

            {hasResults && !anyLoading && (
              <button
                onClick={() => { setResults([]); setSlotErrors(new Map()) }}
                className="text-xs text-f1-muted hover:text-white border border-f1-border px-3 py-2 rounded-lg transition-colors"
              >
                清除结果
              </button>
            )}

            <p className="text-xs text-f1-muted flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              每条轨迹单独从 OpenF1 获取，加载约 3–10 秒
            </p>
          </div>

          {/* Per-slot errors */}
          {Array.from(slotErrors.entries()).map(([id, err]) => (
            <div key={id} className="flex items-start gap-2 bg-amber-900/20 border border-amber-900/40 rounded-lg px-3 py-2 text-xs">
              <div className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: SLOT_COLORS[id % SLOT_COLORS.length] }} />
              <span className="text-amber-300">轨迹 {slots.findIndex(s => s.id === id) + 1}：{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {hasResults && mergedData.length > 0 && (
        <div className="space-y-4">
          {/* Stats table */}
          <Card className="p-4 overflow-x-auto">
            <SectionHeader title="圈次数据摘要" subtitle="各轨迹关键指标对比" />
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-f1-border">
                  {['轨迹', '最高速度', '平均速度', '全油门占比', '刹车占比'].map(h => (
                    <th key={h} className="text-left text-f1-muted font-medium py-2 pr-4 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.id} className="border-b border-f1-border/40">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SLOT_COLORS[s.id % SLOT_COLORS.length] }} />
                        <span className="text-white font-medium">{s.label}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-mono text-white">{s.maxSpeed} km/h</td>
                    <td className="py-2 pr-4 font-mono text-white">{s.avgSpeed} km/h</td>
                    <td className="py-2 pr-4 text-white">{s.fullThrottlePct}%</td>
                    <td className="py-2 text-white">{s.brakePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <TelChart
            title="速度曲线" subtitle="km/h · 横轴为圈内时间（秒）"
            channel="speed" unit=" km/h" domain={[0, 380]}
            results={results} mergedData={mergedData}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TelChart
              title="油门开度" subtitle="0–100%"
              channel="throttle" unit="%" domain={[0, 100]}
              results={results} mergedData={mergedData}
            />
            <TelChart
              title="刹车状态" subtitle="踩下=100%"
              channel="brake" unit="%" domain={[0, 100]}
              results={results} mergedData={mergedData}
            />
            <TelChart
              title="档位" subtitle="1–8 档"
              channel="gear" unit="" domain={[0, 9]}
              results={results} mergedData={mergedData}
              step="stepAfter"
            />
            <TelChart
              title="发动机转速 (RPM)" subtitle=""
              channel="rpm" unit="" domain={[0, 16000]}
              results={results} mergedData={mergedData}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!session && !sessionLoading && (
        <div className="bg-f1-card border border-f1-border rounded-xl p-10 text-center">
          <Gauge className="w-12 h-12 text-f1-muted mx-auto mb-3" />
          <p className="text-white font-medium mb-1">选择赛事会话开始遥测对比</p>
          <p className="text-f1-muted text-sm">最多支持 4 条轨迹叠加，每条轨迹可自由选择车手和圈次</p>
        </div>
      )}
    </div>
  )
}
