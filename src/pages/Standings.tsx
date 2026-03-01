import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import { jolpicaApi } from '../api/jolpica'
import type { DriverStanding, ConstructorStanding } from '../types/f1'
import { getAvailableYears } from '../utils/f1'
import { LoadingCard, ErrorCard } from '../components/common/LoadingSpinner'
import { Card, SectionHeader } from '../components/common/StatCard'
import { Trophy, Medal } from 'lucide-react'

const CONSTRUCTOR_COLORS: Record<string, string> = {
  ferrari: '#e8002d',
  red_bull: '#3671C6',
  mercedes: '#27F4D2',
  mclaren: '#FF8000',
  aston_martin: '#229971',
  alpine: '#FF87BC',
  haas: '#B6BABD',
  rb: '#6692FF',
  williams: '#64C4FF',
  kick_sauber: '#52E252',
}

function getConstructorColor(id: string): string {
  return CONSTRUCTOR_COLORS[id] || '#888888'
}

export default function Standings() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers')
  const [driverStandings, setDriverStandings] = useState<DriverStanding[]>([])
  const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const years = getAvailableYears()

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      jolpicaApi.getDriverStandings(year),
      jolpicaApi.getConstructorStandings(year),
    ]).then(([drivers, constructors]) => {
      setDriverStandings(drivers)
      setConstructorStandings(constructors)
    }).catch(() => {
      setError('加载积分数据失败，请稍后重试')
    }).finally(() => setLoading(false))
  }, [year])

  const driverChartData = driverStandings.slice(0, 20).map(s => ({
    name: `${s.Driver.code || s.Driver.familyName.slice(0, 3).toUpperCase()}`,
    fullName: `${s.Driver.givenName} ${s.Driver.familyName}`,
    points: Number(s.points),
    team: s.Constructors[0]?.constructorId || '',
    teamName: s.Constructors[0]?.name || '',
    position: Number(s.position),
  }))

  const constructorChartData = constructorStandings.map(s => ({
    name: s.Constructor.name,
    points: Number(s.points),
    id: s.Constructor.constructorId,
    wins: Number(s.wins),
    position: Number(s.position),
  }))

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <h1 className="text-xl font-bold text-white">积分榜</h1>
        </div>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="bg-f1-card border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-yellow-400"
        >
          {years.map(y => <option key={y} value={y}>{y} 赛季</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-f1-gray border border-f1-border rounded-xl p-1 w-fit">
        {[
          { id: 'drivers', label: '车手积分榜' },
          { id: 'constructors', label: '车队积分榜' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'drivers' | 'constructors')}
            className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-yellow-500 text-black' : 'text-f1-muted hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <LoadingCard />}
      {error && <ErrorCard message={error} onRetry={() => setYear(y => y)} />}

      {!loading && !error && tab === 'drivers' && driverStandings.length > 0 && (
        <div className="space-y-4">
          {/* Chart */}
          <Card className="p-5">
            <SectionHeader title={`${year} 车手积分榜`} subtitle="所有车手积分统计" />
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={driverChartData} margin={{ top: 5, right: 20, left: 10, bottom: 50 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                  <XAxis dataKey="name" stroke="#8888aa" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" />
                  <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} label={{ value: '积分', angle: -90, position: 'insideLeft', fill: '#8888aa', fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-f1-card border border-f1-border rounded-lg p-3 text-sm">
                          <p className="text-white font-medium">{d.fullName}</p>
                          <p className="text-f1-muted text-xs">{d.teamName}</p>
                          <p className="text-yellow-400 font-bold mt-1">{d.points} 分</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="points" radius={[4, 4, 0, 0]}>
                    {driverChartData.map(d => (
                      <Cell key={d.name} fill={getConstructorColor(d.team)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Table */}
          <Card className="p-5">
            <SectionHeader title="详细排名" subtitle={`${year} 赛季车手积分`} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-f1-border">
                    {['排名', '车手', '国籍', '车队', '积分', '胜场'].map(h => (
                      <th key={h} className="text-left text-f1-muted font-medium py-2 pr-4 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverStandings.map(s => {
                    const pos = Number(s.position)
                    const constructorId = s.Constructors[0]?.constructorId || ''
                    const color = getConstructorColor(constructorId)
                    return (
                      <tr key={s.Driver.driverId} className="border-b border-f1-border/50 hover:bg-f1-gray/30">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            {pos <= 3 && <Medal className={`w-4 h-4 ${pos === 1 ? 'text-yellow-400' : pos === 2 ? 'text-gray-300' : 'text-amber-600'}`} />}
                            <span className={`font-bold ${pos <= 3 ? 'text-white' : 'text-f1-muted'}`}>{pos}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-8 rounded-full" style={{ backgroundColor: color }} />
                            <div>
                              <p className="text-white font-medium">{s.Driver.givenName} {s.Driver.familyName}</p>
                              <p className="text-f1-muted text-xs">#{s.Driver.permanentNumber || '--'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-f1-muted">{s.Driver.nationality}</td>
                        <td className="py-2.5 pr-4">
                          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: `${color}20`, color }}>
                            {s.Constructors[0]?.name || '--'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-bold text-white text-base">{s.points}</td>
                        <td className="py-2.5 text-f1-muted">{s.wins}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {!loading && !error && tab === 'constructors' && constructorStandings.length > 0 && (
        <div className="space-y-4">
          {/* Chart */}
          <Card className="p-5">
            <SectionHeader title={`${year} 车队积分榜`} subtitle="车队积分统计" />
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={constructorChartData} margin={{ top: 5, right: 20, left: 10, bottom: 50 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#383850" />
                  <XAxis dataKey="name" stroke="#8888aa" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                  <YAxis stroke="#8888aa" tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-f1-card border border-f1-border rounded-lg p-3 text-sm">
                          <p className="text-white font-medium">{d.name}</p>
                          <p className="text-yellow-400 font-bold">{d.points} 分</p>
                          <p className="text-f1-muted">{d.wins} 胜</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="points" radius={[4, 4, 0, 0]}>
                    {constructorChartData.map(d => (
                      <Cell key={d.id} fill={getConstructorColor(d.id)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Constructor table */}
          <Card className="p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-f1-border">
                    {['排名', '车队', '国籍', '积分', '胜场'].map(h => (
                      <th key={h} className="text-left text-f1-muted font-medium py-2 pr-4 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {constructorStandings.map(s => {
                    const pos = Number(s.position)
                    const color = getConstructorColor(s.Constructor.constructorId)
                    return (
                      <tr key={s.Constructor.constructorId} className="border-b border-f1-border/50 hover:bg-f1-gray/30">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {pos <= 3 && <Medal className={`w-4 h-4 ${pos === 1 ? 'text-yellow-400' : pos === 2 ? 'text-gray-300' : 'text-amber-600'}`} />}
                            <span className={`font-bold ${pos <= 3 ? 'text-white' : 'text-f1-muted'}`}>{pos}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                            <span className="text-white font-medium">{s.Constructor.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-f1-muted">{s.Constructor.nationality}</td>
                        <td className="py-3 pr-4 font-bold text-white text-base">{s.points}</td>
                        <td className="py-3 text-f1-muted">{s.wins}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
