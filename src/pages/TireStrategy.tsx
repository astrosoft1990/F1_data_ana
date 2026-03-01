import { useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import { openF1Api } from '../api/openf1'
import type { Session, Driver, Stint, Pit } from '../types/f1'
import { getDriverColor, getTireColor, getTireLetter } from '../utils/f1'
import SessionSelector from '../components/common/SessionSelector'
import { LoadingCard, ErrorCard } from '../components/common/LoadingSpinner'
import { Card, SectionHeader } from '../components/common/StatCard'
import { Layers } from 'lucide-react'

const COMPOUND_NAMES: Record<string, string> = {
  SOFT: '软胎 (S)',
  MEDIUM: '中性胎 (M)',
  HARD: '硬胎 (H)',
  INTERMEDIATE: '中雨胎 (I)',
  WET: '全雨胎 (W)',
  UNKNOWN: '未知',
}

export default function TireStrategy() {
  const [session, setSession] = useState<Session | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [stints, setStints] = useState<Stint[]>([])
  const [pits, setPits] = useState<Pit[]>([])
  const [maxLapsFromData, setMaxLapsFromData] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSession = useCallback(async (s: Session) => {
    setSession(s)
    setLoading(true)
    setError(null)
    try {
      const [driverList, lapData, stintData, pitData] = await Promise.all([
        openF1Api.getDrivers(s.session_key),
        openF1Api.getLaps(s.session_key),
        openF1Api.getStints(s.session_key),
        openF1Api.getPitStops(s.session_key),
      ])
      setDrivers(driverList)
      const maxLapFromData = Math.max(...lapData.map(l => l.lap_number), 1)
      setMaxLapsFromData(maxLapFromData)
      setStints(stintData)
      setPits(pitData)
    } catch {
      setError('加载数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const maxLaps = Math.max(...stints.map(s => s.lap_end || 0), maxLapsFromData, 1)

  // Group stints by driver
  const driverStints = new Map<number, Stint[]>()
  for (const stint of stints) {
    const existing = driverStints.get(stint.driver_number) || []
    existing.push(stint)
    driverStints.set(stint.driver_number, existing.sort((a, b) => a.stint_number - b.stint_number))
  }

  // Compound usage statistics
  const compoundStats = new Map<string, { count: number; avgLaps: number; totalLaps: number }>()
  for (const stint of stints) {
    const existing = compoundStats.get(stint.compound) || { count: 0, avgLaps: 0, totalLaps: 0 }
    const stintLaps = (stint.lap_end || maxLaps) - stint.lap_start + 1
    existing.count++
    existing.totalLaps += stintLaps
    existing.avgLaps = existing.totalLaps / existing.count
    compoundStats.set(stint.compound, existing)
  }

  const compoundChartData = Array.from(compoundStats.entries()).map(([compound, stats]) => ({
    compound: COMPOUND_NAMES[compound] || compound,
    rawCompound: compound,
    count: stats.count,
    avgLaps: Math.round(stats.avgLaps),
    totalLaps: stats.totalLaps,
  }))

  // Pit stop data
  const pitChartData = pits.map(p => ({
    driver: drivers.find(d => d.driver_number === p.driver_number)?.name_acronym || `#${p.driver_number}`,
    driverNum: p.driver_number,
    lap: p.lap_number,
    duration: p.pit_duration,
  })).sort((a, b) => a.duration - b.duration)

  const driverOrder = Array.from(driverStints.keys()).sort((a, b) => {
    const aDriver = drivers.find(d => d.driver_number === a)
    const bDriver = drivers.find(d => d.driver_number === b)
    return (aDriver?.name_acronym || '').localeCompare(bDriver?.name_acronym || '')
  })

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Layers className="w-5 h-5 text-yellow-400" />
        <h1 className="text-xl font-bold text-white">轮胎策略分析</h1>
      </div>

      <SessionSelector onSelect={loadSession} selectedKey={session?.session_key} />

      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} onRetry={() => session && loadSession(session)} />}

      {!loading && !error && stints.length > 0 && (
        <div className="space-y-4">
          {/* Tire strategy timeline */}
          <Card className="p-5">
            <SectionHeader
              title="胎策时间线"
              subtitle={`${session?.meeting_name} · ${session?.session_name} · 共${maxLaps}圈`}
            />

            {/* Lap number ruler */}
            <div className="flex items-center gap-2 mb-2 pl-16">
              <div className="flex-1 flex justify-between text-xs text-f1-muted">
                {Array.from({ length: 6 }, (_, i) => Math.round((i / 5) * maxLaps)).map(n => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 overflow-y-auto max-h-[500px] pr-1">
              {driverOrder.map((driverNum, i) => {
                const driver = drivers.find(d => d.driver_number === driverNum)
                const driverStintList = driverStints.get(driverNum) || []
                const color = getDriverColor(driver, i)
                const driverPits = pits.filter(p => p.driver_number === driverNum)

                return (
                  <div key={driverNum} className="flex items-center gap-2 group">
                    <div className="w-14 flex-shrink-0 text-right">
                      <span className="text-xs font-bold" style={{ color }}>
                        {driver?.name_acronym || `#${driverNum}`}
                      </span>
                    </div>
                    <div className="flex-1 flex h-7 bg-f1-dark/50 rounded relative">
                      {driverStintList.map(stint => {
                        const start = ((stint.lap_start - 1) / maxLaps) * 100
                        const end = ((stint.lap_end || maxLaps) / maxLaps) * 100
                        const width = end - start
                        return (
                          <div
                            key={stint.stint_number}
                            title={`${COMPOUND_NAMES[stint.compound] || stint.compound} | L${stint.lap_start}-${stint.lap_end || '?'} | 胎龄+${stint.tyre_age_at_start}圈`}
                            className="absolute top-0 h-full flex items-center justify-center text-xs font-bold cursor-help hover:opacity-90 transition-opacity rounded-sm"
                            style={{
                              left: `${start}%`,
                              width: `${width}%`,
                              backgroundColor: getTireColor(stint.compound),
                              color: stint.compound === 'HARD' ? '#000' : '#fff',
                              borderRight: '2px solid rgba(21,21,30,0.5)',
                              minWidth: '8px',
                            }}
                          >
                            {width > 4 ? getTireLetter(stint.compound) : ''}
                          </div>
                        )
                      })}
                      {/* Pit stop markers */}
                      {driverPits.map(pit => {
                        const pos = ((pit.lap_number - 1) / maxLaps) * 100
                        return (
                          <div
                            key={pit.lap_number}
                            title={`第${pit.lap_number}圈进站 - ${pit.pit_duration.toFixed(2)}s`}
                            className="absolute top-0 h-full w-0.5 bg-white/70 z-10"
                            style={{ left: `${pos}%` }}
                          />
                        )
                      })}
                    </div>
                    {/* Pit count */}
                    <div className="w-8 flex-shrink-0 text-xs text-f1-muted text-center">
                      {driverPits.length > 0 ? `${driverPits.length}停` : ''}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center flex-wrap gap-4 mt-4 pt-4 border-t border-f1-border">
              {['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'].map(c => (
                <div key={c} className="flex items-center gap-1.5 text-xs text-f1-muted">
                  <div className="w-4 h-4 rounded flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: getTireColor(c), color: c === 'HARD' ? '#000' : '#fff' }}>
                    {getTireLetter(c)}
                  </div>
                  {COMPOUND_NAMES[c]}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-xs text-f1-muted">
                <div className="w-0.5 h-4 bg-white/70" />
                进站
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Compound usage */}
            <Card className="p-5">
              <SectionHeader title="胎型使用统计" subtitle="各胎型平均使用圈数" />
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={compoundChartData} margin={{ top: 5, right: 20, left: 10, bottom: 50 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                    <XAxis dataKey="compound" stroke="#8888aa" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                    <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} label={{ value: '圈数', angle: -90, position: 'insideLeft', fill: '#8888aa', fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div className="bg-f1-card border border-f1-border rounded-lg p-3 text-sm">
                            <p className="text-white font-medium">{d.compound}</p>
                            <p className="text-f1-muted">使用次数: {d.count}</p>
                            <p className="text-f1-muted">平均圈数: {d.avgLaps}</p>
                            <p className="text-f1-muted">总圈数: {d.totalLaps}</p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="avgLaps" name="平均圈数" radius={[4, 4, 0, 0]}>
                      {compoundChartData.map(d => (
                        <Cell key={d.rawCompound} fill={getTireColor(d.rawCompound)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Pit stop duration */}
            <Card className="p-5">
              <SectionHeader title="进站时间排名" subtitle="由快到慢" />
              {pitChartData.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-f1-muted text-sm">暂无进站数据</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={pitChartData.slice(0, 15)} layout="vertical" margin={{ top: 5, right: 50, left: 40, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#383850" horizontal={false} />
                      <XAxis type="number" stroke="#8888aa" tick={{ fontSize: 10 }} unit="s" />
                      <YAxis type="category" dataKey="driver" stroke="#8888aa" tick={{ fontSize: 11 }} width={35} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0].payload
                          return (
                            <div className="bg-f1-card border border-f1-border rounded-lg p-3 text-sm">
                              <p className="text-white">{d.driver} - 第{d.lap}圈</p>
                              <p className="text-f1-red font-bold">{d.duration.toFixed(3)}s</p>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
                        {pitChartData.slice(0, 15).map((d, i) => {
                          const driver = drivers.find(dr => dr.driver_number === d.driverNum)
                          return <Cell key={i} fill={getDriverColor(driver, i)} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Stint details table */}
          <Card className="p-5">
            <SectionHeader title="进站详情" subtitle="所有车手进站记录" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-f1-border">
                    {['车手', '车队', '进站圈数', '进站时间', '换装胎型', '下一段圈数', '历史胎龄'].map(h => (
                      <th key={h} className="text-left text-f1-muted font-medium py-2 pr-4 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pits.map((pit, i) => {
                    const driver = drivers.find(d => d.driver_number === pit.driver_number)
                    const driverStintList = driverStints.get(pit.driver_number) || []
                    const nextStint = driverStintList.find(s => s.lap_start > pit.lap_number)
                    return (
                      <tr key={i} className="border-b border-f1-border/50 hover:bg-f1-gray/30">
                        <td className="py-2 pr-4">
                          <span className="font-medium text-white">{driver?.name_acronym || `#${pit.driver_number}`}</span>
                        </td>
                        <td className="py-2 pr-4 text-f1-muted text-xs">{driver?.team_name}</td>
                        <td className="py-2 pr-4 text-white">{pit.lap_number}</td>
                        <td className="py-2 pr-4 font-mono text-white">{pit.pit_duration.toFixed(3)}s</td>
                        <td className="py-2 pr-4">
                          {nextStint && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold"
                              style={{ backgroundColor: getTireColor(nextStint.compound), color: nextStint.compound === 'HARD' ? '#000' : '#fff' }}
                            >
                              {getTireLetter(nextStint.compound)} {nextStint.compound}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-f1-muted">
                          {nextStint ? `${(nextStint.lap_end || maxLaps) - nextStint.lap_start + 1}圈` : '--'}
                        </td>
                        <td className="py-2 text-f1-muted">
                          {nextStint ? `+${nextStint.tyre_age_at_start}圈` : '--'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {!session && !loading && (
        <div className="bg-f1-card border border-f1-border rounded-xl p-10 text-center">
          <Layers className="w-12 h-12 text-f1-muted mx-auto mb-3" />
          <p className="text-white font-medium mb-1">选择赛事查看轮胎策略</p>
          <p className="text-f1-muted text-sm">支持胎型时间线、进站分析、轮胎使用统计</p>
        </div>
      )}
    </div>
  )
}
