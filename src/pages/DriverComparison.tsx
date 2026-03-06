import { useState, useCallback } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart, Line,
} from 'recharts'
import { openF1Api } from '../api/openf1'
import type { Session, Driver, Lap } from '../types/f1'
import {
  formatLapTime, getDriverColor, groupLapsByDriver, findFastestLap,
  getSessionFastestLap, isValidLap,
} from '../utils/f1'
import SessionSelector from '../components/common/SessionSelector'
import DriverSelector from '../components/common/DriverSelector'
import { LoadingCard, ErrorCard } from '../components/common/LoadingSpinner'
import { Card, SectionHeader } from '../components/common/StatCard'
import { Users } from 'lucide-react'

export default function DriverComparison() {
  const [session, setSession] = useState<Session | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [laps, setLaps] = useState<Lap[]>([])
  const [selectedDrivers, setSelectedDrivers] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSession = useCallback(async (s: Session) => {
    setSession(s)
    setLoading(true)
    setError(null)
    try {
      const [driverList, lapData] = await Promise.all([
        openF1Api.getDrivers(s.session_key),
        openF1Api.getLaps(s.session_key),
      ])
      setDrivers(driverList)
      setLaps(lapData)
      setSelectedDrivers(driverList.slice(0, 3).map(d => d.driver_number))
    } catch {
      setError('加载数据失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  const lapsByDriver = groupLapsByDriver(laps)
  const sessionFastest = getSessionFastestLap(laps)

  // Helper: valid laps for a driver (no pit-out, not >1.2× session fastest)
  const validDriverLaps = (driverNum: number) =>
    (lapsByDriver.get(driverNum) || []).filter(l => isValidLap(l, sessionFastest))

  // Sector comparison (fastest individual sectors, valid laps only)
  const sectorData = (() => {
    const sectors = []
    for (const label of ['S1', 'S2', 'S3']) {
      const row: Record<string, number | string> = { sector: label }
      for (const driverNum of selectedDrivers) {
        const driver = drivers.find(d => d.driver_number === driverNum)
        if (!driver) continue
        const key = label === 'S1' ? 'duration_sector_1' : label === 'S2' ? 'duration_sector_2' : 'duration_sector_3'
        const valid = validDriverLaps(driverNum)
          .map(l => l[key as keyof Lap] as number | null)
          .filter(v => v != null && v > 0) as number[]
        if (valid.length > 0) row[driver.name_acronym] = Math.min(...valid)
      }
      sectors.push(row)
    }
    return sectors
  })()

  // Speed trap data (valid laps only)
  const speedData = (() => {
    const traps = ['i1_speed', 'i2_speed', 'st_speed']
    const labels = ['中间计时1', '中间计时2', '终点速度陷阱']
    return traps.map((trap, i) => {
      const row: Record<string, number | string> = { trap: labels[i] }
      for (const driverNum of selectedDrivers) {
        const driver = drivers.find(d => d.driver_number === driverNum)
        if (!driver) continue
        const vals = validDriverLaps(driverNum)
          .map(l => l[trap as keyof Lap] as number | null)
          .filter(v => v != null && v > 0) as number[]
        if (vals.length > 0) row[driver.name_acronym] = Math.max(...vals)
      }
      return row
    })
  })()

  // Lap time comparison chart (valid laps only)
  const maxLaps = Math.max(...Array.from(lapsByDriver.values()).map(ls => ls.length), 0)
  const lapCompareData = Array.from({ length: maxLaps }, (_, i) => {
    const lapNum = i + 1
    const row: Record<string, number | string> = { lap: lapNum }
    for (const driverNum of selectedDrivers) {
      const driver = drivers.find(d => d.driver_number === driverNum)
      if (!driver) continue
      const lap = lapsByDriver.get(driverNum)?.find(l => l.lap_number === lapNum)
      if (lap && isValidLap(lap, sessionFastest)) {
        row[driver.name_acronym] = lap.lap_duration!
      }
    }
    return row
  })

  // Radar chart (valid laps only)
  const radarData = (() => {
    if (selectedDrivers.length === 0) return []
    const allValid = laps.filter(l => isValidLap(l, sessionFastest))
    const globalFastest = allValid.reduce((m, l) => Math.min(m, l.lap_duration!), Infinity)
    const globalS1 = allValid.reduce((m, l) => l.duration_sector_1 ? Math.min(m, l.duration_sector_1) : m, Infinity)
    const globalS2 = allValid.reduce((m, l) => l.duration_sector_2 ? Math.min(m, l.duration_sector_2) : m, Infinity)
    const globalS3 = allValid.reduce((m, l) => l.duration_sector_3 ? Math.min(m, l.duration_sector_3) : m, Infinity)
    const globalI1 = allValid.reduce((m, l) => l.i1_speed ? Math.max(m, l.i1_speed) : m, 0)
    const globalI2 = allValid.reduce((m, l) => l.i2_speed ? Math.max(m, l.i2_speed) : m, 0)

    const dims = ['最快圈速', '扇区1', '扇区2', '扇区3', '直线速度1', '直线速度2']
    return dims.map((dim, di) => {
      const row: Record<string, string | number> = { metric: dim }
      for (const driverNum of selectedDrivers) {
        const driver = drivers.find(d => d.driver_number === driverNum)
        if (!driver) continue
        const dLaps = validDriverLaps(driverNum)
        let score = 0
        if (di === 0) {
          const f = findFastestLap(dLaps)
          score = f?.lap_duration ? (globalFastest / f.lap_duration) * 100 : 0
        } else if (di === 1) {
          const best = Math.min(...dLaps.map(l => l.duration_sector_1 || Infinity))
          score = best !== Infinity ? (globalS1 / best) * 100 : 0
        } else if (di === 2) {
          const best = Math.min(...dLaps.map(l => l.duration_sector_2 || Infinity))
          score = best !== Infinity ? (globalS2 / best) * 100 : 0
        } else if (di === 3) {
          const best = Math.min(...dLaps.map(l => l.duration_sector_3 || Infinity))
          score = best !== Infinity ? (globalS3 / best) * 100 : 0
        } else if (di === 4) {
          const best = Math.max(...dLaps.map(l => l.i1_speed || 0))
          score = globalI1 > 0 ? (best / globalI1) * 100 : 0
        } else {
          const best = Math.max(...dLaps.map(l => l.i2_speed || 0))
          score = globalI2 > 0 ? (best / globalI2) * 100 : 0
        }
        row[driver.name_acronym] = Math.round(score * 10) / 10
      }
      return row
    })
  })()

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Users className="w-5 h-5 text-blue-400" />
        <h1 className="text-xl font-bold text-white">车手对比</h1>
      </div>

      <SessionSelector onSelect={loadSession} selectedKey={session?.session_key} />

      {session && (
        <div className="bg-f1-card border border-f1-border rounded-xl px-4 py-3">
          <p className="text-xs text-f1-muted mb-2">选择车手对比 (最多3位)</p>
          {loading ? (
            <div className="h-8 flex items-center gap-2 text-f1-muted text-sm">
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-f1-border border-t-blue-400" />
              加载中...
            </div>
          ) : (
            <DriverSelector drivers={drivers} selected={selectedDrivers} onChange={setSelectedDrivers} max={3} />
          )}
        </div>
      )}

      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} onRetry={() => session && loadSession(session)} />}

      {!loading && !error && laps.length > 0 && selectedDrivers.length > 0 && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {selectedDrivers.map((driverNum, i) => {
              const driver = drivers.find(d => d.driver_number === driverNum)
              const driverLaps = validDriverLaps(driverNum)
              const fastest = findFastestLap(driverLaps)
              if (!driver) return null
              const color = getDriverColor(driver, i)
              return (
                <Card key={driverNum} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
                      style={{ backgroundColor: color }}>
                      {driver.driver_number}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{driver.full_name}</p>
                      <p className="text-f1-muted text-xs">{driver.team_name}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-f1-muted">最快圈速</p>
                      <p className="font-mono text-white font-bold text-sm">{formatLapTime(fastest?.lap_duration)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-f1-muted">有效圈数</p>
                      <p className="text-white font-bold text-sm">{driverLaps.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-f1-muted">最佳S1</p>
                      <p className="font-mono text-xs text-white">{Math.min(...driverLaps.map(l => l.duration_sector_1 || Infinity)).toFixed(3) === 'Infinity' ? '--' : Math.min(...driverLaps.map(l => l.duration_sector_1 || Infinity)).toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-f1-muted">最高直线速度</p>
                      <p className="font-mono text-xs text-white">{Math.max(...driverLaps.map(l => l.st_speed || 0)) || '--'} km/h</p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Lap time chart */}
          <Card className="p-5">
            <SectionHeader title="逐圈圈速对比" subtitle="每圈圈速变化趋势" />
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={lapCompareData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                  <XAxis dataKey="lap" stroke="#8888aa" tick={{ fontSize: 11 }}
                    label={{ value: '圈数', position: 'insideBottomRight', offset: -5, fill: '#8888aa', fontSize: 11 }} />
                  <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} tickFormatter={v => formatLapTime(v)} domain={['auto', 'auto']} width={80} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-f1-card border border-f1-border rounded-lg p-3">
                        <p className="text-f1-muted text-xs mb-2">第 {label} 圈</p>
                        {payload.map(p => (
                          <div key={p.dataKey} className="flex items-center justify-between gap-4 text-sm">
                            <span style={{ color: p.color }} className="font-medium">{p.name}</span>
                            <span className="text-white font-mono">{formatLapTime(p.value as number)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }} />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                  {selectedDrivers.map((driverNum, i) => {
                    const driver = drivers.find(d => d.driver_number === driverNum)
                    if (!driver) return null
                    return (
                      <Line key={driverNum} type="monotone" dataKey={driver.name_acronym}
                        stroke={getDriverColor(driver, i)} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4 }} />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sector comparison */}
            <Card className="p-5">
              <SectionHeader title="最佳扇区时间对比" subtitle="各扇区最快成绩" />
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={sectorData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis dataKey="sector" stroke="#8888aa" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-f1-card border border-f1-border rounded-lg p-3">
                          <p className="text-f1-muted text-xs mb-1">{label}</p>
                          {payload.map(p => (
                            <div key={p.dataKey} className="flex items-center justify-between gap-3 text-sm">
                              <span style={{ color: p.color }}>{p.name}</span>
                              <span className="text-white font-mono">{Number(p.value).toFixed(3)}s</span>
                            </div>
                          ))}
                        </div>
                      )
                    }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {selectedDrivers.map((driverNum, i) => {
                      const driver = drivers.find(d => d.driver_number === driverNum)
                      if (!driver) return null
                      return (
                        <Bar key={driverNum} dataKey={driver.name_acronym}
                          fill={getDriverColor(driver, i)} radius={[3, 3, 0, 0]} />
                      )
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Radar chart */}
            <Card className="p-5">
              <SectionHeader title="综合性能雷达图" subtitle="相对于最快车手的百分比" />
              <div className="h-56">
                <ResponsiveContainer>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#383850" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#8888aa', fontSize: 10 }} />
                    <PolarRadiusAxis domain={[90, 100]} tick={{ fill: '#8888aa', fontSize: 9 }} />
                    {selectedDrivers.map((driverNum, i) => {
                      const driver = drivers.find(d => d.driver_number === driverNum)
                      if (!driver) return null
                      return (
                        <Radar
                          key={driverNum}
                          name={driver.name_acronym}
                          dataKey={driver.name_acronym}
                          stroke={getDriverColor(driver, i)}
                          fill={getDriverColor(driver, i)}
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                      )
                    })}
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Speed traps */}
          <Card className="p-5">
            <SectionHeader title="测速点最高速度" subtitle="各测速点最大速度对比" />
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={speedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                  <XAxis dataKey="trap" stroke="#8888aa" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} unit=" km/h" domain={['auto', 'auto']} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-f1-card border border-f1-border rounded-lg p-3">
                        <p className="text-f1-muted text-xs mb-1">{label}</p>
                        {payload.map(p => (
                          <div key={p.dataKey} className="flex items-center justify-between gap-3 text-sm">
                            <span style={{ color: p.color }}>{p.name}</span>
                            <span className="text-white font-mono">{p.value} km/h</span>
                          </div>
                        ))}
                      </div>
                    )
                  }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {selectedDrivers.map((driverNum, i) => {
                    const driver = drivers.find(d => d.driver_number === driverNum)
                    if (!driver) return null
                    return (
                      <Bar key={driverNum} dataKey={driver.name_acronym}
                        fill={getDriverColor(driver, i)} radius={[3, 3, 0, 0]} />
                    )
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {!session && !loading && (
        <div className="bg-f1-card border border-f1-border rounded-xl p-10 text-center">
          <Users className="w-12 h-12 text-f1-muted mx-auto mb-3" />
          <p className="text-white font-medium mb-1">选择赛事会话开始对比</p>
          <p className="text-f1-muted text-sm">支持最多3位车手的多维度数据对比</p>
        </div>
      )}
    </div>
  )
}
