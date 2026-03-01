import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell
} from 'recharts'
import { openF1Api } from '../api/openf1'
import type { Session, Driver, Lap, Position, Pit, Stint, Weather } from '../types/f1'
import { formatLapTime, getDriverColor, getTireColor, getTireLetter, groupLapsByDriver } from '../utils/f1'
import SessionSelector from '../components/common/SessionSelector'
import DriverSelector from '../components/common/DriverSelector'
import { LoadingCard, ErrorCard } from '../components/common/LoadingSpinner'
import { Card, SectionHeader } from '../components/common/StatCard'
import { Flag, Wind, Thermometer, Droplets } from 'lucide-react'

const TABS = [
  { id: 'laps', label: '圈速分析' },
  { id: 'positions', label: '排位变化' },
  { id: 'pitstops', label: '进站分析' },
  { id: 'weather', label: '天气数据' },
]

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>
  label?: string | number
}

function LapTooltip({ active, payload, label }: ChartTooltipProps) {
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
    } catch (e) {
      setError('加载数据失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load from URL
  useEffect(() => {
    const sessionKey = searchParams.get('session')
    if (sessionKey && !session) {
      openF1Api.getSessions({ session_key: Number(sessionKey) }).then(([s]) => {
        if (s) loadSession(s)
      })
    }
  }, [])

  // Lap chart data
  const lapsByDriver = groupLapsByDriver(laps)
  const maxLaps = Math.max(...Array.from(lapsByDriver.values()).map(ls => ls.length), 0)

  const lapChartData = Array.from({ length: maxLaps }, (_, i) => {
    const lap = i + 1
    const point: Record<string, number | string> = { lap }
    for (const driverNum of selectedDrivers) {
      const driver = drivers.find(d => d.driver_number === driverNum)
      const driverLap = lapsByDriver.get(driverNum)?.find(l => l.lap_number === lap)
      if (driver && driverLap?.lap_duration) {
        point[driver.name_acronym] = driverLap.lap_duration
      }
    }
    return point
  })

  // Position chart data
  const positionsByLap = new Map<number, Map<number, number>>()
  for (const pos of positions) {
    // Sample positions at intervals to reduce data points
    const lapApprox = Math.floor(positions.indexOf(pos) / (positions.length / (maxLaps || 50))) + 1
    if (!positionsByLap.has(lapApprox)) positionsByLap.set(lapApprox, new Map())
    positionsByLap.get(lapApprox)!.set(pos.driver_number, pos.position)
  }

  // Build position chart from laps (using pit data and gaps)
  const positionChartData = buildPositionChart(laps, selectedDrivers, drivers)

  // Pit stop data for selected drivers
  const filteredPits = pits.filter(p => selectedDrivers.includes(p.driver_number))

  // Weather chart data (downsample)
  const weatherSampled = weather.filter((_, i) => i % Math.max(1, Math.floor(weather.length / 60)) === 0)

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Flag className="w-5 h-5 text-f1-red" />
        <h1 className="text-xl font-bold text-white">赛事分析</h1>
      </div>

      <SessionSelector
        onSelect={loadSession}
        selectedKey={session?.session_key}
      />

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
          <div className="flex gap-1 bg-f1-gray border border-f1-border rounded-xl p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-f1-red text-white'
                    : 'text-f1-muted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Lap Analysis */}
          {activeTab === 'laps' && (
            <Card className="p-5">
              <SectionHeader
                title="圈速对比"
                subtitle={`${session.meeting_name} - ${session.session_name}`}
              />
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={lapChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis
                      dataKey="lap"
                      stroke="#8888aa"
                      tick={{ fontSize: 11 }}
                      label={{ value: '圈数', position: 'insideBottomRight', offset: -5, fill: '#8888aa', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#8888aa"
                      tick={{ fontSize: 11 }}
                      tickFormatter={v => formatLapTime(v)}
                      domain={['auto', 'auto']}
                      width={80}
                    />
                    <Tooltip content={<LapTooltip />} />
                    <Legend
                      wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }}
                    />
                    {selectedDrivers.map((driverNum, i) => {
                      const driver = drivers.find(d => d.driver_number === driverNum)
                      if (!driver) return null
                      return (
                        <Line
                          key={driverNum}
                          type="monotone"
                          dataKey={driver.name_acronym}
                          stroke={getDriverColor(driver, i)}
                          strokeWidth={2}
                          dot={false}
                          connectNulls={false}
                          activeDot={{ r: 4 }}
                        />
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
                      <th className="text-left text-f1-muted font-medium py-2 pr-4">车手</th>
                      <th className="text-left text-f1-muted font-medium py-2 pr-4">最快圈速</th>
                      <th className="text-left text-f1-muted font-medium py-2 pr-4">圈数</th>
                      <th className="text-left text-f1-muted font-medium py-2 pr-4">S1</th>
                      <th className="text-left text-f1-muted font-medium py-2 pr-4">S2</th>
                      <th className="text-left text-f1-muted font-medium py-2">S3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDrivers.map((driverNum, i) => {
                      const driver = drivers.find(d => d.driver_number === driverNum)
                      const driverLaps = lapsByDriver.get(driverNum) || []
                      const valid = driverLaps.filter(l => l.lap_duration != null && !l.is_pit_out_lap)
                      const fastest = valid.reduce((f, l) => l.lap_duration! < (f?.lap_duration || Infinity) ? l : f, valid[0])
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

          {/* Position Changes */}
          {activeTab === 'positions' && (
            <Card className="p-5">
              <SectionHeader title="排位变化" subtitle="基于圈速数据估算" />
              {positionChartData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer>
                    <LineChart data={positionChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                      <XAxis dataKey="lap" stroke="#8888aa" tick={{ fontSize: 11 }}
                        label={{ value: '圈数', position: 'insideBottomRight', offset: -5, fill: '#8888aa', fontSize: 11 }} />
                      <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} reversed domain={[1, 20]}
                        label={{ value: '排位', angle: -90, position: 'insideLeft', fill: '#8888aa', fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="bg-f1-card border border-f1-border rounded-lg p-3 shadow-xl">
                              <p className="text-f1-muted text-xs mb-2">第 {label} 圈</p>
                              {[...payload].sort((a, b) => (a.value as number) - (b.value as number)).map(p => (
                                <div key={p.dataKey} className="flex items-center gap-3 text-sm">
                                  <span className="w-5 text-center font-bold" style={{ color: p.color }}>P{p.value}</span>
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
                          <Line
                            key={driverNum}
                            type="stepAfter"
                            dataKey={driver.name_acronym}
                            stroke={getDriverColor(driver, i)}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        )
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-f1-muted text-sm">
                  暂无排位数据（仅正式比赛支持）
                </div>
              )}
            </Card>
          )}

          {/* Pit Stops */}
          {activeTab === 'pitstops' && (
            <div className="space-y-4">
              <Card className="p-5">
                <SectionHeader title="进站时间" subtitle="每次进站消耗时间" />
                {filteredPits.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-f1-muted text-sm">暂无进站数据</div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={filteredPits.map(p => ({
                        label: `${drivers.find(d => d.driver_number === p.driver_number)?.name_acronym || p.driver_number} L${p.lap_number}`,
                        duration: p.pit_duration,
                        driverNum: p.driver_number,
                      }))} margin={{ top: 5, right: 20, left: 10, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                        <XAxis dataKey="label" stroke="#8888aa" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                        <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit="s" />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0]
                            return (
                              <div className="bg-f1-card border border-f1-border rounded-lg p-3">
                                <p className="text-f1-muted text-xs">{d.payload.label}</p>
                                <p className="text-white font-bold">{d.value?.toFixed(3)}s</p>
                              </div>
                            )
                          }}
                        />
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
                            const width = `${(stintLaps / maxLaps) * 100}%`
                            return (
                              <div
                                key={stint.stint_number}
                                title={`${stint.compound} | L${stint.lap_start}-${stint.lap_end || '?'} | ${stintLaps}圈`}
                                className="flex items-center justify-center rounded text-xs font-bold cursor-help transition-opacity hover:opacity-80"
                                style={{ width, backgroundColor: getTireColor(stint.compound), color: stint.compound === 'HARD' ? '#000' : '#fff', minWidth: '20px' }}
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
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-f1-border">
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

          {/* Weather */}
          {activeTab === 'weather' && weather.length > 0 && (
            <div className="space-y-4">
              {/* Current weather summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: '赛道温度', value: `${weather[weather.length - 1]?.track_temperature?.toFixed(1)}°C`, icon: <Thermometer className="w-4 h-4" /> },
                  { label: '气温', value: `${weather[weather.length - 1]?.air_temperature?.toFixed(1)}°C`, icon: <Wind className="w-4 h-4" /> },
                  { label: '湿度', value: `${weather[weather.length - 1]?.humidity?.toFixed(0)}%`, icon: <Droplets className="w-4 h-4" /> },
                  { label: '降雨', value: weather[weather.length - 1]?.rainfall ? '是' : '否', icon: <Droplets className="w-4 h-4" /> },
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
                      <XAxis
                        dataKey="date"
                        stroke="#8888aa"
                        tick={{ fontSize: 10 }}
                        tickFormatter={v => new Date(v).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      />
                      <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit="°C" />
                      <Tooltip
                        content={({ active, payload, label }) => {
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
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Line type="monotone" dataKey="track_temperature" name="赛道温度" stroke="#e8002d" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="air_temperature" name="气温" stroke="#0067ff" strokeWidth={2} dot={false} />
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

function buildPositionChart(laps: Lap[], selectedDrivers: number[], drivers: Driver[]): Array<Record<string, number | string>> {
  if (laps.length === 0) return []

  const allLapNums = [...new Set(laps.map(l => l.lap_number))].sort((a, b) => a - b)
  const lapsByDriver = groupLapsByDriver(laps)

  const cumTimes = new Map<number, Map<number, number>>()

  for (const [driverNum, driverLaps] of lapsByDriver) {
    if (!selectedDrivers.includes(driverNum)) continue
    const sorted = [...driverLaps].sort((a, b) => a.lap_number - b.lap_number)
    let cumTime = 0
    const driverCum = new Map<number, number>()
    for (const lap of sorted) {
      if (lap.lap_duration) {
        cumTime += lap.lap_duration
        driverCum.set(lap.lap_number, cumTime)
      }
    }
    cumTimes.set(driverNum, driverCum)
  }

  return allLapNums.map(lapNum => {
    const row: Record<string, number | string> = { lap: lapNum }
    const times: Array<{ driverNum: number; time: number }> = []

    for (const driverNum of selectedDrivers) {
      const time = cumTimes.get(driverNum)?.get(lapNum)
      if (time != null) times.push({ driverNum, time })
    }

    times.sort((a, b) => a.time - b.time)
    times.forEach(({ driverNum }, pos) => {
      const driver = drivers.find(d => d.driver_number === driverNum)
      if (driver) {
        row[driver.name_acronym] = pos + 1
      }
    })

    return row
  })
}
