import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { openF1Api } from '../api/openf1'
import { jolpicaApi } from '../api/jolpica'
import type { Session, DriverStanding } from '../types/f1'
import { formatDate, isSessionLive, isSessionPast, getCountryFlag } from '../utils/f1'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { Flag, Activity, Users, Layers, Trophy, ChevronRight, Radio } from 'lucide-react'

export default function Home() {
  const [latestSession, setLatestSession] = useState<Session | null>(null)
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [standings, setStandings] = useState<DriverStanding[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const currentYear = new Date().getFullYear()

    Promise.all([
      openF1Api.getLatestSession(),
      openF1Api.getSessions({ year: currentYear }),
      jolpicaApi.getDriverStandings(currentYear),
    ]).then(async ([latest, allSessions, driverStandings]) => {
      const latestS = latest[0]
      setLatestSession(latestS)

      const past = allSessions
        .filter(s => s.session_type === 'Race' && isSessionPast(s))
        .slice(-5)
        .reverse()
      setRecentSessions(past)
      setStandings(driverStandings.slice(0, 10))
    }).finally(() => setLoading(false))
  }, [])

  const isLive = latestSession ? isSessionLive(latestSession) : false

  const features = [
    { icon: Flag, label: '赛事分析', desc: '圈速、进站、位置变化', path: '/race', color: 'text-f1-red' },
    { icon: Users, label: '车手对比', desc: '多车手圈速、扇区时间对比', path: '/comparison', color: 'text-blue-400' },
    { icon: Activity, label: '遥测数据', desc: '速度/油门/刹车/档位曲线', path: '/telemetry', color: 'text-green-400' },
    { icon: Layers, label: '轮胎策略', desc: '换胎时机与胎型分析', path: '/strategy', color: 'text-yellow-400' },
  ]

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-r from-f1-gray to-f1-card border border-f1-border rounded-2xl p-6 lg:p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-f1-red/10 rounded-full -translate-y-32 translate-x-32" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-400/10 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">
            F1 数据分析平台
          </h1>
          <p className="text-f1-muted text-lg mb-4">
            实时赛事遥测 · 历史数据对比 · 深度赛事分析
          </p>
          {latestSession && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-f1-dark/50 rounded-lg px-4 py-2 border border-f1-border">
                <p className="text-xs text-f1-muted">最新会话</p>
                <p className="text-white font-semibold">
                  {getCountryFlag(latestSession.country_code)} {latestSession.meeting_name}
                </p>
                <p className="text-f1-muted text-sm">{latestSession.session_name}</p>
              </div>
              <Link
                to={`/race?session=${latestSession.session_key}`}
                className="flex items-center gap-2 bg-f1-red text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm"
              >
                查看分析 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {features.map(({ icon: Icon, label, desc, path, color }) => (
          <Link
            key={path}
            to={path}
            className="bg-f1-card border border-f1-border rounded-xl p-4 hover:border-f1-muted transition-colors group"
          >
            <Icon className={`w-6 h-6 ${color} mb-3`} />
            <h3 className="font-semibold text-white text-sm group-hover:text-f1-red transition-colors">{label}</h3>
            <p className="text-f1-muted text-xs mt-1">{desc}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Races */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-f1-red" /> 近期赛事
            </h2>
            <Link to="/race" className="text-xs text-f1-muted hover:text-white">
              全部 →
            </Link>
          </div>
          <div className="space-y-2">
            {loading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))
            ) : recentSessions.length === 0 ? (
              <div className="bg-f1-card border border-f1-border rounded-xl p-6 text-center text-f1-muted text-sm">
                暂无历史赛事数据
              </div>
            ) : (
              recentSessions.map(session => (
                <Link
                  key={session.session_key}
                  to={`/race?session=${session.session_key}`}
                  className="flex items-center gap-4 bg-f1-card border border-f1-border rounded-xl px-4 py-3 hover:border-f1-muted transition-colors group"
                >
                  <div className="text-2xl">{getCountryFlag(session.country_code)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{session.meeting_name}</p>
                    <p className="text-f1-muted text-xs">{formatDate(session.date_start)} · {session.circuit_short_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-f1-muted bg-f1-gray px-2 py-1 rounded">{session.session_name}</span>
                    <ChevronRight className="w-4 h-4 text-f1-muted group-hover:text-white transition-colors" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Driver Standings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" /> 车手积分榜
            </h2>
            <Link to="/standings" className="text-xs text-f1-muted hover:text-white">
              全部 →
            </Link>
          </div>
          <div className="bg-f1-card border border-f1-border rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-6 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : standings.length === 0 ? (
              <div className="p-6 text-center text-f1-muted text-sm">暂无积分数据</div>
            ) : (
              <div className="divide-y divide-f1-border">
                {standings.map((s, i) => (
                  <div key={s.Driver.driverId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`text-sm font-bold w-5 text-center ${i < 3 ? 'text-yellow-400' : 'text-f1-muted'}`}>
                      {s.position}
                    </span>
                    <div
                      className="w-0.5 h-6 rounded-full"
                      style={{ backgroundColor: `#${s.Constructors[0]?.constructorId === 'red_bull' ? '3671C6' : s.Constructors[0]?.constructorId === 'ferrari' ? 'E8002D' : s.Constructors[0]?.constructorId === 'mercedes' ? '27F4D2' : '888888'}` }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">
                        {s.Driver.givenName} {s.Driver.familyName}
                      </p>
                      <p className="text-f1-muted text-xs truncate">{s.Constructors[0]?.name}</p>
                    </div>
                    <span className="text-white font-bold text-sm">{s.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-f1-card border border-f1-border rounded-xl p-4 flex items-center gap-4">
        <Radio className="w-5 h-5 text-f1-red flex-shrink-0" />
        <div>
          <p className="text-white text-sm font-medium">实时数据支持</p>
          <p className="text-f1-muted text-xs">在比赛进行期间，所有数据将自动每30秒刷新一次。历史数据永久保存，可随时查询。</p>
        </div>
      </div>
    </div>
  )
}
