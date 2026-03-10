import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Lap } from '../types/f1'
import { useSearchParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell
} from 'recharts'
import { openF1Api } from '../api/openf1'
import type { Session, Driver, Position, Pit, Stint, Weather } from '../types/f1'
import { formatLapTime, getDriverColor, getTireColor, getTireLetter, groupLapsByDriver, getSessionFastestLap, isValidLap } from '../utils/f1'
import SessionSelector from '../components/common/SessionSelector'
import DriverSelector from '../components/common/DriverSelector'
import { LoadingCard, ErrorCard } from '../components/common/LoadingSpinner'
import { Card, SectionHeader } from '../components/common/StatCard'
import { BoxPlotChart, BoxStatsTable, computeBoxStats } from '../components/charts/BoxPlot'
import { Flag, Wind, Thermometer, Droplets, BarChart2 } from 'lucide-react'

const TABS = [
  { id: 'laps', label: '圈速分析' },
  { id: 'boxplot', label: '圈速统计' },
  { id: 'positions', label: '排位变化' },
  { id: 'pitstops', label: '进站分析' },
  { id: 'weather', label: '天气数据' },
]

function LapTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-f1-card border border-f1-border rounded-lg p-3 shadow-xl min-w-[160px]">
      <p className="text-f1-muted text-xs mb-2">第 {label} 圈</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 text-sm">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="text-white font-mono">{formatLapTime(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function RaceAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [session, setSession] = useState<Session | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [laps, setLaps] = useState<Lap[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [pits, setPits] = useState<Pit[]>([])
  const [stints, setStints] = useState<Stint[]>([])
  const [weather, setWeather] = useState<Weather[]>([])
  const [selectedDrivers, setSelectedDrivers] = useState<number[]>([])
  const [activeTab, setActiveTab] = useState('laps')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Manual lap time range filter (seconds)
  const [filterMin, setFilterMin] = useState<string>('')
  const [filterMax, setFilterMax] = useState<string>('')

  const loadSession = useCallback(async (s: Session) => {
    setSession(s)
    setLoading(true)
    setError(null)
    setSearchParams({ session: String(s.session_key) })

    try {
      const [driverList, lapData, posData, pitData, stintData, weatherData] = await Promise.all([
        openF1Api.getDrivers(s.session_key),
        openF1Api.getLaps(s.session_key),
        openF1Api.getPositions(s.session_key),
        openF1Api.getPitStops(s.session_key),
        openF1Api.getStints(s.session_key),
        openF1Api.getWeather(s.session_key),
      ])
      setDrivers(driverList)
      setLaps(lapData)
      setPositions(posData)
      setPits(pitData)
      setStints(stintData)
      setWeather(weatherData)
      setSelectedDrivers(driverList.slice(0, 5).map(d => d.driver_number))
    } catch {
      setError('加载数据失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const sessionKey = searchParams.get('session')
    if (sessionKey && !session) {
      openF1Api.getSessions({ session_key: Number(sessionKey) }).then(([s]) => {
        if (s) loadSession(s)
      })
    }
  }, [])

  const lapsByDriver = useMemo(() => groupLapsByDriver(laps), [laps])
  const maxLaps = useMemo(() => Math.max(...Array.from(lapsByDriver.values()).map(ls => ls.length), 0), [lapsByDriver])

  // Session-wide fastest clean lap – used as the 1.2× outlier threshold
  const sessionFastest = useMemo(() => getSessionFastestLap(laps), [laps])

  // Manual filter bounds (parsed from string inputs)
  const manualMin = filterMin ? parseFloat(filterMin) : null
  const manualMax = filterMax ? parseFloat(filterMax) : null

  // Helper: passes both automatic (isValidLap) and manual range filter
  const passesAllFilters = useCallback((lap: Lap) => {
    if (!isValidLap(lap, sessionFastest)) return false
    if (manualMin != null && lap.lap_duration! < manualMin) return false
    if (manualMax != null && lap.lap_duration! > manualMax) return false
    return true
  }, [sessionFastest, manualMin, manualMax])

  // ── Lap chart data ──────────────────────────────────────────────────────────
  const lapChartData = useMemo(() => Array.from({ length: maxLaps }, (_, i) => {
    const lap = i + 1
    const point: Record<string, number | string> = { lap }
    for (const driverNum of selectedDrivers) {
      const driver = drivers.find(d => d.driver_number === driverNum)
      const driverLap = lapsByDriver.get(driverNum)?.find(l => l.lap_number === lap)
      if (driver && driverLap && passesAllFilters(driverLap)) {
        point[driver.name_acronym] = driverLap.lap_duration!
      }
    }
    return point
  }), [maxLaps, selectedDrivers, drivers, lapsByDriver, passesAllFilters])

  // ── Position chart using real API data ──────────────────────────────────────
  const positionChartData = useMemo(() =>
    buildPositionChartFromAPI(positions, laps, selectedDrivers, drivers),
    [positions, laps, selectedDrivers, drivers]
  )

  // ── Box plot stats (all drivers, valid laps only: no pit-out, no >1.2× fastest) ─
  const boxStats = useMemo(() => {
    return drivers.map((driver, i) => {
      const validLaps = (lapsByDriver.get(driver.driver_number) || [])
        .filter(l => isValidLap(l, sessionFastest))
        .map(l => l.lap_duration!)
      if (validLaps.length < 2) return null
      return computeBoxStats(
        driver.name_acronym,
        driver.team_name,
        getDriverColor(driver, i),
        validLaps,
      )
    }).filter(Boolean) as ReturnType<typeof computeBoxStats>[]
  }, [drivers, lapsByDriver, sessionFastest])

  const filteredPits = pits.filter(p => selectedDrivers.includes(p.driver_number))
  const weatherSampled = weather.filter((_, i) => i % Math.max(1, Math.floor(weather.length / 60)) === 0)

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Flag className="w-5 h-5 text-f1-red" />
        <h1 className="text-xl font-bold text-white">赛事分析</h1>
      </div>

      <SessionSelector onSelect={loadSession} selectedKey={session?.session_key} />

      {session && (
        <div className="bg-f1-card border border-f1-border rounded-xl px-4 py-3">
          <p className="text-xs text-f1-muted mb-2">选择车手 (最多5位)</p>
          {loading ? (
            <div className="h-8 flex items-center gap-2 text-f1-muted text-sm">
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-f1-border border-t-f1-red" />
              加载中...
            </div>
          ) : (
            <DriverSelector
              drivers={drivers}
              selected={selectedDrivers}
              onChange={setSelectedDrivers}
              max={5}
            />
          )}
        </div>
      )}

      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} onRetry={() => session && loadSession(session)} />}

      {!loading && !error && session && laps.length > 0 && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-f1-gray border border-f1-border rounded-xl p-1 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-f1-red text-white' : 'text-f1-muted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Lap Analysis ─────────────────────────────────────────────────── */}
          {activeTab === 'laps' && (
            <Card className="p-5">
              <SectionHeader
                title="逐圈圈速"
                subtitle={`${session.meeting_name} · ${session.session_name} · 已过滤进站圈及 >1.2× 最快圈`}
                actions={
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-f1-muted">圈速范围(秒)</span>
                    <input
                      type="number"
                      value={filterMin}
                      onChange={e => setFilterMin(e.target.value)}
                      placeholder={sessionFastest ? sessionFastest.toFixed(1) : '最小'}
                      className="w-20 bg-f1-gray border border-f1-border text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                    />
                    <span className="text-f1-muted">—</span>
                    <input
                      type="number"
                      value={filterMax}
                      onChange={e => setFilterMax(e.target.value)}
                      placeholder={sessionFastest ? (sessionFastest * 1.2).toFixed(1) : '最大'}
                      className="w-20 bg-f1-gray border border-f1-border text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                    />
                    {(filterMin || filterMax) && (
                      <button
                        onClick={() => { setFilterMin(''); setFilterMax('') }}
                        className="text-f1-muted hover:text-white transition-colors px-1"
                        title="清除筛选"
                      >✕ 清除</button>
                    )}
                  </div>
                }
              />
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={lapChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis dataKey="lap" stroke="#8888aa" tick={{ fontSize: 11 }}
                      label={{ value: '圈数', position: 'insideBottomRight', offset: -5, fill: '#8888aa', fontSize: 11 }} />
                    <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} tickFormatter={v => formatLapTime(v)}
                      domain={['auto', 'auto']} width={80} />
                    <Tooltip content={<LapTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                    {selectedDrivers.map((driverNum, i) => {
                      const driver = drivers.find(d => d.driver_number === driverNum)
                      if (!driver) return null
                      return (
                        <Line key={driverNum} type="monotone" dataKey={driver.name_acronym}
                          stroke={getDriverColor(driver, i)} strokeWidth={2} dot={false}
                          connectNulls={false} activeDot={{ r: 4 }} />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Fastest lap table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-f1-border">
                      {['车手', '最快圈速', '圈数', 'S1', 'S2', 'S3'].map(h => (
                        <th key={h} className="text-left text-f1-muted font-medium py-2 pr-4 text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDrivers.map((driverNum, i) => {
                      const driver = drivers.find(d => d.driver_number === driverNum)
                      const driverLaps = lapsByDriver.get(driverNum) || []
                      const valid = driverLaps.filter(l => passesAllFilters(l))
                      const fastest = valid.reduce<Lap | null>((f, l) =>
                        !f || l.lap_duration! < f.lap_duration! ? l : f, null)
                      if (!driver || !fastest) return null
                      return (
                        <tr key={driverNum} className="border-b border-f1-border/50 hover:bg-f1-gray/50">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getDriverColor(driver, i) }} />
                              <span className="font-medium text-white">{driver.name_acronym}</span>
                              <span className="text-f1-muted text-xs">{driver.team_name}</span>
                            </div>
                          </td>
                          <td className="py-2 pr-4 font-mono text-white">{formatLapTime(fastest.lap_duration)}</td>
                          <td className="py-2 pr-4 text-f1-muted">{fastest.lap_number}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-f1-muted">{fastest.duration_sector_1?.toFixed(3) ?? '--'}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-f1-muted">{fastest.duration_sector_2?.toFixed(3) ?? '--'}</td>
                          <td className="py-2 font-mono text-xs text-f1-muted">{fastest.duration_sector_3?.toFixed(3) ?? '--'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Box Plot Statistics ───────────────────────────────────────────── */}
          {activeTab === 'boxplot' && (
            <Card className="p-5">
              <SectionHeader
                title="圈速分布箱线图"
                subtitle="全场车手 · 已剔除进站圈及 >1.2× 最快圈 · ◆ 均值  — 中位数  ○ 异常值"
                actions={
                  <div className="flex items-center gap-1 text-xs text-f1-muted">
                    <BarChart2 className="w-4 h-4" />
                    {boxStats.length} 位车手
                  </div>
                }
              />
              {boxStats.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-f1-muted text-sm">
                  暂无足够圈速数据生成箱线图（需要至少2圈有效数据）
                </div>
              ) : (
                <>
                  <BoxPlotChart
                    data={boxStats}
                    colWidth={Math.max(52, Math.min(80, Math.floor(760 / boxStats.length)))}
                  />
                  <div className="mt-6 pt-4 border-t border-f1-border">
                    <p className="text-sm font-semibold text-white mb-3">统计数据明细</p>
                    <BoxStatsTable data={boxStats} />
                  </div>
                </>
              )}
            </Card>
          )}

          {/* ── Position Changes (real API data) ─────────────────────────────── */}
          {activeTab === 'positions' && (
            <Card className="p-5">
              <SectionHeader
                title="排位变化"
                subtitle={positions.length > 0 ? '实时位置数据（来自 OpenF1 /position API）' : '暂无位置数据'}
              />
              {positionChartData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer>
                    <LineChart data={positionChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                      <XAxis dataKey="lap" stroke="#8888aa" tick={{ fontSize: 11 }}
                        label={{ value: '圈数', position: 'insideBottomRight', offset: -5, fill: '#8888aa', fontSize: 11 }} />
                      <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} reversed
                        domain={[1, drivers.length || 20]}
                        label={{ value: '排位', angle: -90, position: 'insideLeft', fill: '#8888aa', fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="bg-f1-card border border-f1-border rounded-lg p-3 shadow-xl">
                              <p className="text-f1-muted text-xs mb-2">第 {label} 圈结束</p>
                              {[...payload]
                                .filter(p => p.value != null)
                                .sort((a, b) => (a.value as number) - (b.value as number))
                                .map(p => (
                                  <div key={p.dataKey} className="flex items-center gap-3 text-sm">
                                    <span className="w-6 text-center font-bold" style={{ color: p.color }}>
                                      P{p.value}
                                    </span>
                                    <span style={{ color: p.color }}>{p.name}</span>
                                  </div>
                                ))}
                            </div>
                          )
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                      {selectedDrivers.map((driverNum, i) => {
                        const driver = drivers.find(d => d.driver_number === driverNum)
                        if (!driver) return null
                        return (
                          <Line key={driverNum} type="stepAfter" dataKey={driver.name_acronym}
                            stroke={getDriverColor(driver, i)} strokeWidth={2}
                            dot={false} connectNulls />
                        )
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-f1-muted text-sm">
                  {positions.length === 0
                    ? '暂无排位数据（正式比赛才有实时排位记录）'
                    : '处理排位数据中...'}
                </div>
              )}
            </Card>
          )}

          {/* ── Pit Stops ────────────────────────────────────────────────────── */}
          {activeTab === 'pitstops' && (
            <div className="space-y-4">
              <Card className="p-5">
                <SectionHeader title="进站时间" subtitle="每次进站消耗时间" />
                {filteredPits.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-f1-muted text-sm">暂无进站数据</div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart
                        data={filteredPits.map(p => ({
                          label: `${drivers.find(d => d.driver_number === p.driver_number)?.name_acronym || p.driver_number} L${p.lap_number}`,
                          duration: p.pit_duration,
                          driverNum: p.driver_number,
                        }))}
                        margin={{ top: 5, right: 20, left: 10, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                        <XAxis dataKey="label" stroke="#8888aa" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                        <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit="s" />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]
                          return (
                            <div className="bg-f1-card border border-f1-border rounded-lg p-3">
                              <p className="text-f1-muted text-xs">{d.payload.label}</p>
                              <p className="text-white font-bold">{Number(d.value).toFixed(3)}s</p>
                            </div>
                          )
                        }} />
                        <Bar dataKey="duration" radius={[4, 4, 0, 0]}>
                          {filteredPits.map((p, i) => {
                            const dIdx = selectedDrivers.indexOf(p.driver_number)
                            const driver = drivers.find(d => d.driver_number === p.driver_number)
                            return <Cell key={i} fill={getDriverColor(driver, dIdx)} />
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Stint visualization */}
              <Card className="p-5">
                <SectionHeader title="胎策时间线" subtitle="各阶段轮胎使用情况" />
                <div className="space-y-3 mt-2">
                  {selectedDrivers.map((driverNum, i) => {
                    const driver = drivers.find(d => d.driver_number === driverNum)
                    const driverStints = stints.filter(s => s.driver_number === driverNum)
                    if (!driver || driverStints.length === 0) return null
                    return (
                      <div key={driverNum} className="flex items-center gap-3">
                        <div className="w-10 text-right">
                          <span className="text-xs font-bold" style={{ color: getDriverColor(driver, i) }}>
                            {driver.name_acronym}
                          </span>
                        </div>
                        <div className="flex-1 flex gap-0.5 h-8">
                          {driverStints.map(stint => {
                            const stintLaps = (stint.lap_end || maxLaps) - stint.lap_start + 1
                            return (
                              <div
                                key={stint.stint_number}
                                title={`${stint.compound} | L${stint.lap_start}–${stint.lap_end ?? '?'} | ${stintLaps}圈`}
                                className="flex items-center justify-center rounded text-xs font-bold cursor-help hover:opacity-80 transition-opacity"
                                style={{
                                  width: `${(stintLaps / maxLaps) * 100}%`,
                                  backgroundColor: getTireColor(stint.compound),
                                  color: stint.compound === 'HARD' ? '#000' : '#fff',
                                  minWidth: '16px',
                                }}
                              >
                                {stintLaps > 3 ? getTireLetter(stint.compound) : ''}
                              </div>
                            )
                          })}
                        </div>
                        <div className="text-xs text-f1-muted w-8">{maxLaps}圈</div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center flex-wrap gap-4 mt-4 pt-4 border-t border-f1-border">
                  {['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'].map(c => (
                    <div key={c} className="flex items-center gap-1.5 text-xs text-f1-muted">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getTireColor(c) }} />
                      {c === 'SOFT' ? '软' : c === 'MEDIUM' ? '中' : c === 'HARD' ? '硬' : c === 'INTERMEDIATE' ? '中雨' : '全雨'}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── Weather ───────────────────────────────────────────────────────── */}
          {activeTab === 'weather' && weather.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: '赛道温度', value: `${weather[weather.length - 1]?.track_temperature?.toFixed(1)}°C`, icon: <Thermometer className="w-4 h-4" /> },
                  { label: '气温', value: `${weather[weather.length - 1]?.air_temperature?.toFixed(1)}°C`, icon: <Wind className="w-4 h-4" /> },
                  { label: '湿度', value: `${weather[weather.length - 1]?.humidity?.toFixed(0)}%`, icon: <Droplets className="w-4 h-4" /> },
                  { label: '降雨', value: weather[weather.length - 1]?.rainfall ? '有降雨' : '无降雨', icon: <Droplets className="w-4 h-4" /> },
                ].map(stat => (
                  <Card key={stat.label} className="p-4">
                    <div className="flex items-center gap-2 text-f1-muted mb-1">
                      {stat.icon}
                      <span className="text-xs">{stat.label}</span>
                    </div>
                    <p className="text-xl font-bold text-white">{stat.value}</p>
                  </Card>
                ))}
              </div>

              <Card className="p-5">
                <SectionHeader title="温度变化" subtitle="赛道温度与气温" />
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={weatherSampled} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                      <XAxis dataKey="date" stroke="#8888aa" tick={{ fontSize: 10 }}
                        tickFormatter={v => new Date(v).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} />
                      <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit="°C" />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="bg-f1-card border border-f1-border rounded-lg p-3">
                            <p className="text-f1-muted text-xs mb-1">
                              {new Date(label as string).toLocaleTimeString('zh-CN')}
                            </p>
                            {payload.map(p => (
                              <div key={p.dataKey} className="flex items-center justify-between gap-3 text-sm">
                                <span style={{ color: p.color }}>{p.name}</span>
                                <span className="text-white">{Number(p.value).toFixed(1)}°C</span>
                              </div>
                            ))}
                          </div>
                        )
                      }} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Line type="monotone" dataKey="track_temperature" name="赛道温度"
                        stroke="#e8002d" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="air_temperature" name="气温"
                        stroke="#0067ff" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}

          {!loading && !error && session && laps.length === 0 && (
            <div className="bg-f1-card border border-f1-border rounded-xl p-10 text-center">
              <p className="text-f1-muted">暂无圈速数据，请选择其他会话</p>
            </div>
          )}
        </>
      )}

      {!session && !loading && (
        <div className="bg-f1-card border border-f1-border rounded-xl p-10 text-center">
          <Flag className="w-12 h-12 text-f1-muted mx-auto mb-3" />
          <p className="text-white font-medium mb-1">选择赛事会话开始分析</p>
          <p className="text-f1-muted text-sm">从上方选择赛季、赛站和会话类型</p>
        </div>
      )}
    </div>
  )
}

// ─── Build position chart from real /position API data ────────────────────────
function buildPositionChartFromAPI(
  positions: Position[],
  laps: Lap[],
  selectedDrivers: number[],
  drivers: Driver[],
): Array<Record<string, number | string>> {
  if (positions.length === 0 || laps.length === 0) return []

  // Group positions by driver, sorted by time
  const driverPosMap = new Map<number, Position[]>()
  for (const pos of positions) {
    if (!selectedDrivers.includes(pos.driver_number)) continue
    const arr = driverPosMap.get(pos.driver_number) ?? []
    arr.push(pos)
    driverPosMap.set(pos.driver_number, arr)
  }
  for (const arr of driverPosMap.values()) {
    arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  const lapNums = [...new Set(laps.map(l => l.lap_number))].sort((a, b) => a - b)

  return lapNums.map(lapNum => {
    const row: Record<string, number | string> = { lap: lapNum }

    for (const driverNum of selectedDrivers) {
      const driver = drivers.find(d => d.driver_number === driverNum)
      if (!driver) continue

      const lap = laps.find(l => l.driver_number === driverNum && l.lap_number === lapNum)
      if (!lap?.date_start) continue

      // Sample position at end of lap
      const lapEndMs = new Date(lap.date_start).getTime() + (lap.lap_duration ?? 90) * 1000
      const posArr = driverPosMap.get(driverNum) ?? []

      // Binary search for last position at or before lap end
      let lo = 0; let hi = posArr.length - 1; let result: Position | null = null
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (new Date(posArr[mid].date).getTime() <= lapEndMs) {
          result = posArr[mid]; lo = mid + 1
        } else {
          hi = mid - 1
        }
      }

      if (result) row[driver.name_acronym] = result.position
    }
    return row
  }).filter(row => Object.keys(row).length > 1)
}
