import { useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Area
} from 'recharts'
import { openF1Api } from '../api/openf1'
import type { Session, Driver, Lap, CarData } from '../types/f1'
import { formatLapTime, getDriverColor, groupLapsByDriver } from '../utils/f1'
import SessionSelector from '../components/common/SessionSelector'
import { LoadingCard, ErrorCard } from '../components/common/LoadingSpinner'
import { Card, SectionHeader } from '../components/common/StatCard'
import { Activity, Zap, Gauge, AlertCircle } from 'lucide-react'

export default function Telemetry() {
  const [session, setSession] = useState<Session | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [laps, setLaps] = useState<Lap[]>([])
  const [selectedLap, setSelectedLap] = useState<number>(1)
  const [driver1, setDriver1] = useState<number | null>(null)
  const [driver2, setDriver2] = useState<number | null>(null)
  const [telemetry1, setTelemetry1] = useState<CarData[]>([])
  const [telemetry2, setTelemetry2] = useState<CarData[]>([])
  const [loading, setLoading] = useState(false)
  const [telLoading, setTelLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [telError, setTelError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const loadSession = useCallback(async (s: Session) => {
    setSession(s)
    setLoading(true)
    setSessionError(null)
    setTelError(null)
    setTelemetry1([])
    setTelemetry2([])
    setHasLoaded(false)
    try {
      const [driverList, lapData] = await Promise.all([
        openF1Api.getDrivers(s.session_key),
        openF1Api.getLaps(s.session_key),
      ])
      setDrivers(driverList)
      setLaps(lapData)
      if (driverList.length >= 1) setDriver1(driverList[0].driver_number)
      if (driverList.length >= 2) setDriver2(driverList[1].driver_number)
      // Auto-select a good lap (lap 3 or first valid lap)
      const validLaps = lapData.filter(l => l.lap_duration != null && !l.is_pit_out_lap && l.date_start)
      if (validLaps.length > 0) {
        const goodLap = validLaps.find(l => l.lap_number >= 3) || validLaps[0]
        setSelectedLap(goodLap.lap_number)
      }
    } catch (e: unknown) {
      setSessionError(`加载会话数据失败: ${e instanceof Error ? e.message : '请检查网络连接'}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTelemetry = useCallback(async () => {
    if (!session || !driver1) return
    setTelLoading(true)
    setTelError(null)
    setTelemetry1([])
    setTelemetry2([])
    setHasLoaded(false)

    try {
      const lapsByDriver = groupLapsByDriver(laps)
      const lap1 = lapsByDriver.get(driver1)?.find(l => l.lap_number === selectedLap)

      if (!lap1) {
        setTelError(`未找到第 ${selectedLap} 圈数据（该车手可能未完成此圈）`)
        return
      }
      if (!lap1.date_start) {
        setTelError(`第 ${selectedLap} 圈缺少时间戳，无法加载遥测数据`)
        return
      }

      const lap2 = driver2 ? lapsByDriver.get(driver2)?.find(l => l.lap_number === selectedLap) : null

      const [tel1, tel2] = await Promise.all([
        openF1Api.getCarDataForLap(session.session_key, driver1, lap1),
        driver2 && lap2?.date_start
          ? openF1Api.getCarDataForLap(session.session_key, driver2, lap2)
          : Promise.resolve([]),
      ])

      if (tel1.length === 0) {
        setTelError(`未获取到第 ${selectedLap} 圈的遥测数据。OpenF1 仅保存 2023 年后的数据，且部分会话可能暂无遥测记录。`)
        return
      }

      // Downsample: keep at most 500 points for smooth rendering
      const sampleRate = Math.max(1, Math.floor(tel1.length / 500))
      setTelemetry1(tel1.filter((_, i) => i % sampleRate === 0))

      if (tel2.length > 0) {
        const sampleRate2 = Math.max(1, Math.floor(tel2.length / 500))
        setTelemetry2(tel2.filter((_, i) => i % sampleRate2 === 0))
      }
      setHasLoaded(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('timeout') || msg.includes('ECONNABORTED')) {
        setTelError('请求超时（遥测数据量较大），请稍后重试或选择圈数更短的会话')
      } else if (msg.includes('Network') || msg.includes('ENOTFOUND')) {
        setTelError('网络连接失败，请检查网络后重试')
      } else {
        setTelError(`遥测数据加载失败: ${msg}`)
      }
      console.error('[Telemetry] Error loading car data:', e)
    } finally {
      setTelLoading(false)
    }
  }, [session, driver1, driver2, selectedLap, laps])

  const lapsByDriver = groupLapsByDriver(laps)
  const d1Driver = drivers.find(d => d.driver_number === driver1)
  const d2Driver = drivers.find(d => d.driver_number === driver2)

  const availableLaps = driver1
    ? (lapsByDriver.get(driver1) || [])
        .filter(l => l.lap_duration != null && l.date_start)
        .sort((a, b) => a.lap_number - b.lap_number)
    : []

  // Merge telemetry by normalized time offset within the lap
  const mergedTelemetry = (() => {
    if (telemetry1.length === 0) return []
    const t1Start = new Date(telemetry1[0].date).getTime()

    return telemetry1.map((t, i) => {
      const timeOffset = (new Date(t.date).getTime() - t1Start) / 1000

      const row: Record<string, number | string> = {
        time: Math.round(timeOffset * 10) / 10,
        speed1: t.speed,
        throttle1: t.throttle,
        brake1: t.brake ? 100 : 0,
        gear1: t.n_gear,
        rpm1: t.rpm,
      }

      if (telemetry2.length > 0) {
        // Match by proportional position in lap
        const t2Idx = Math.min(
          Math.round((i / (telemetry1.length - 1)) * (telemetry2.length - 1)),
          telemetry2.length - 1
        )
        const t2 = telemetry2[t2Idx]
        row.speed2 = t2.speed
        row.throttle2 = t2.throttle
        row.brake2 = t2.brake ? 100 : 0
        row.gear2 = t2.n_gear
        row.rpm2 = t2.rpm
      }
      return row
    })
  })()

  const chartProps = {
    data: mergedTelemetry,
    margin: { top: 5, right: 20, left: 10, bottom: 5 },
  }

  const TelTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: Array<{ value: number; name: string; color: string; dataKey: string }>
    label?: string | number
  }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-f1-card border border-f1-border rounded-lg p-2 text-xs shadow-xl">
        <p className="text-f1-muted mb-1">{label}s</p>
        {payload.map(p => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-f1-muted">{p.name}</span>
            <span className="text-white font-mono">{typeof p.value === 'number' ? p.value : '--'}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="w-5 h-5 text-green-400" />
        <h1 className="text-xl font-bold text-white">遥测数据分析</h1>
      </div>

      <SessionSelector onSelect={loadSession} selectedKey={session?.session_key} />

      {session && !loading && drivers.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-f1-muted block mb-1.5">车手 1</label>
              <select
                value={driver1 || ''}
                onChange={e => { setDriver1(Number(e.target.value)); setHasLoaded(false) }}
                className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
              >
                {drivers.map(d => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym} #{d.driver_number} · {d.team_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-f1-muted block mb-1.5">车手 2 <span className="text-f1-muted/60">(可选对比)</span></label>
              <select
                value={driver2 || ''}
                onChange={e => { setDriver2(e.target.value ? Number(e.target.value) : null); setHasLoaded(false) }}
                className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
              >
                <option value="">— 不对比 —</option>
                {drivers.filter(d => d.driver_number !== driver1).map(d => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym} #{d.driver_number}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-f1-muted block mb-1.5">
                圈次 <span className="text-f1-muted/60">({availableLaps.length} 圈可用)</span>
              </label>
              <select
                value={selectedLap}
                onChange={e => { setSelectedLap(Number(e.target.value)); setHasLoaded(false) }}
                className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
              >
                {availableLaps.map(l => (
                  <option key={l.lap_number} value={l.lap_number}>
                    第 {l.lap_number} 圈 — {formatLapTime(l.lap_duration)}
                    {l.is_pit_out_lap ? ' [出站圈]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={loadTelemetry}
              disabled={!driver1 || telLoading || availableLaps.length === 0}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              {telLoading ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  加载中...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  加载遥测数据
                </>
              )}
            </button>
          </div>

          {/* Tips */}
          <p className="text-xs text-f1-muted mt-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            遥测数据量较大，加载时间约 3–10 秒，建议选择正式比赛（Race）会话以获得最完整数据
          </p>
        </Card>
      )}

      {loading && <LoadingCard />}
      {sessionError && <ErrorCard message={sessionError} onRetry={() => session && loadSession(session)} />}

      {telLoading && (
        <div className="bg-f1-card border border-f1-border rounded-xl p-6 flex items-center gap-4">
          <div className="w-8 h-8 animate-spin rounded-full border-2 border-f1-border border-t-green-400 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">正在加载遥测数据...</p>
            <p className="text-f1-muted text-xs mt-1">
              从 OpenF1 API 获取第 {selectedLap} 圈数据（约 300–400 个采样点），请稍候
            </p>
          </div>
        </div>
      )}

      {!telLoading && telError && (
        <div className="bg-f1-card border border-amber-900/50 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-medium text-sm">遥测数据加载失败</p>
            <p className="text-f1-muted text-sm mt-1">{telError}</p>
            <button
              onClick={loadTelemetry}
              className="mt-3 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      )}

      {!telLoading && hasLoaded && mergedTelemetry.length > 0 && (
        <div className="space-y-4">
          {/* Lap info bar */}
          <div className="flex flex-wrap gap-3">
            {d1Driver && (
              <div className="flex items-center gap-2 bg-f1-card border border-f1-border rounded-lg px-3 py-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getDriverColor(d1Driver, 0) }} />
                <span className="text-white text-sm font-medium">{d1Driver.full_name}</span>
                <span className="text-f1-muted text-xs">第 {selectedLap} 圈</span>
                <span className="font-mono text-white text-xs bg-f1-gray px-2 py-0.5 rounded">
                  {formatLapTime(availableLaps.find(l => l.lap_number === selectedLap)?.lap_duration)}
                </span>
                <span className="text-xs text-f1-muted">{telemetry1.length} 点</span>
              </div>
            )}
            {d2Driver && telemetry2.length > 0 && (
              <div className="flex items-center gap-2 bg-f1-card border border-f1-border rounded-lg px-3 py-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getDriverColor(d2Driver, 1) }} />
                <span className="text-white text-sm font-medium">{d2Driver.full_name}</span>
                <span className="text-f1-muted text-xs">第 {selectedLap} 圈</span>
                <span className="font-mono text-white text-xs bg-f1-gray px-2 py-0.5 rounded">
                  {formatLapTime(lapsByDriver.get(driver2!)?.find(l => l.lap_number === selectedLap)?.lap_duration)}
                </span>
                <span className="text-xs text-f1-muted">{telemetry2.length} 点</span>
              </div>
            )}
          </div>

          {/* Speed Trace */}
          <Card className="p-5">
            <SectionHeader title="速度曲线" subtitle="km/h · 横轴为圈内时间(秒)" />
            <div className="h-52">
              <ResponsiveContainer>
                <LineChart {...chartProps}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                  <XAxis dataKey="time" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
                  <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit=" km/h" domain={[0, 380]} />
                  <Tooltip content={TelTooltip as any} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="speed1"
                    name={d1Driver?.name_acronym || '车手1'}
                    stroke={getDriverColor(d1Driver, 0)}
                    strokeWidth={2} dot={false} />
                  {telemetry2.length > 0 && (
                    <Line type="monotone" dataKey="speed2"
                      name={d2Driver?.name_acronym || '车手2'}
                      stroke={getDriverColor(d2Driver, 1)}
                      strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Throttle */}
            <Card className="p-5">
              <SectionHeader title="油门开度" subtitle="0–100%" />
              <div className="h-44">
                <ResponsiveContainer>
                  <ComposedChart {...chartProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis dataKey="time" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
                    <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                    <Tooltip content={TelTooltip as any} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="throttle1"
                      name={d1Driver?.name_acronym || '车手1'}
                      stroke={getDriverColor(d1Driver, 0)}
                      fill={getDriverColor(d1Driver, 0)} fillOpacity={0.2}
                      strokeWidth={1.5} dot={false} />
                    {telemetry2.length > 0 && (
                      <Area type="monotone" dataKey="throttle2"
                        name={d2Driver?.name_acronym || '车手2'}
                        stroke={getDriverColor(d2Driver, 1)}
                        fill={getDriverColor(d2Driver, 1)} fillOpacity={0.1}
                        strokeWidth={1.5} dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Brake */}
            <Card className="p-5">
              <SectionHeader title="刹车状态" subtitle="踩下=100%，松开=0%" />
              <div className="h-44">
                <ResponsiveContainer>
                  <ComposedChart {...chartProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis dataKey="time" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
                    <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                    <Tooltip content={TelTooltip as any} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="brake1"
                      name={d1Driver?.name_acronym || '车手1'}
                      stroke="#e8002d" fill="#e8002d" fillOpacity={0.35}
                      strokeWidth={1.5} dot={false} />
                    {telemetry2.length > 0 && (
                      <Area type="monotone" dataKey="brake2"
                        name={d2Driver?.name_acronym || '车手2'}
                        stroke="#ff8700" fill="#ff8700" fillOpacity={0.2}
                        strokeWidth={1.5} dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Gear */}
            <Card className="p-5">
              <SectionHeader title="档位" subtitle="1–8 档" />
              <div className="h-44">
                <ResponsiveContainer>
                  <LineChart {...chartProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis dataKey="time" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
                    <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} domain={[0, 9]} ticks={[1, 2, 3, 4, 5, 6, 7, 8]} />
                    <Tooltip content={TelTooltip as any} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="stepAfter" dataKey="gear1"
                      name={d1Driver?.name_acronym || '车手1'}
                      stroke={getDriverColor(d1Driver, 0)}
                      strokeWidth={2} dot={false} />
                    {telemetry2.length > 0 && (
                      <Line type="stepAfter" dataKey="gear2"
                        name={d2Driver?.name_acronym || '车手2'}
                        stroke={getDriverColor(d2Driver, 1)}
                        strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* RPM */}
            <Card className="p-5">
              <SectionHeader title="发动机转速 (RPM)" subtitle="引擎转速变化" />
              <div className="h-44">
                <ResponsiveContainer>
                  <LineChart {...chartProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis dataKey="time" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
                    <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} domain={[0, 16000]} />
                    <Tooltip content={TelTooltip as any} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="rpm1"
                      name={d1Driver?.name_acronym || '车手1'}
                      stroke={getDriverColor(d1Driver, 0)}
                      strokeWidth={1.5} dot={false} />
                    {telemetry2.length > 0 && (
                      <Line type="monotone" dataKey="rpm2"
                        name={d2Driver?.name_acronym || '车手2'}
                        stroke={getDriverColor(d2Driver, 1)}
                        strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(() => {
              const speeds = mergedTelemetry.map(d => d.speed1 as number)
              const throttles = mergedTelemetry.map(d => d.throttle1 as number)
              const brakes = mergedTelemetry.map(d => d.brake1 as number)
              return [
                { label: '最高速度', value: `${Math.max(...speeds)} km/h` },
                { label: '平均速度', value: `${Math.round(speeds.reduce((s, v) => s + v, 0) / speeds.length)} km/h` },
                { label: '全油门占比', value: `${Math.round(throttles.filter(v => v > 90).length / throttles.length * 100)}%` },
                { label: '刹车占比', value: `${Math.round(brakes.filter(v => v > 0).length / brakes.length * 100)}%` },
              ].map(stat => (
                <Card key={stat.label} className="p-4">
                  <p className="text-xs text-f1-muted">{stat.label}</p>
                  <p className="text-xl font-bold text-white mt-1">{stat.value}</p>
                  <p className="text-xs text-f1-muted mt-1">{d1Driver?.name_acronym}</p>
                </Card>
              ))
            })()}
          </div>
        </div>
      )}

      {!session && !loading && (
        <div className="bg-f1-card border border-f1-border rounded-xl p-10 text-center">
          <Gauge className="w-12 h-12 text-f1-muted mx-auto mb-3" />
          <p className="text-white font-medium mb-1">选择会话查看遥测数据</p>
          <p className="text-f1-muted text-sm">支持速度、油门、刹车、档位、RPM曲线，可双车手叠加对比</p>
        </div>
      )}
    </div>
  )
}
