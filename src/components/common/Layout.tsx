import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home, Flag, Users, Activity, Layers, Trophy,
  Menu, X, ChevronRight, Gauge
} from 'lucide-react'

const navItems = [
  { path: '/', label: '首页', icon: Home },
  { path: '/standings', label: '积分榜', icon: Trophy },
  { path: '/race', label: '赛事分析', icon: Flag },
  { path: '/comparison', label: '车手对比', icon: Users },
  { path: '/telemetry', label: '遥测数据', icon: Activity },
  { path: '/strategy', label: '轮胎策略', icon: Layers },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-f1-dark flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-f1-gray border-r border-f1-border
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-f1-border">
            <div className="flex items-center justify-center w-9 h-9 bg-f1-red rounded-lg">
              <Gauge className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">F1 Analytics</h1>
              <p className="text-xs text-f1-muted">数据分析平台</p>
            </div>
            <button
              className="ml-auto lg:hidden text-f1-muted hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path ||
                (path !== '/' && location.pathname.startsWith(path))
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-colors duration-150 group
                    ${isActive
                      ? 'bg-f1-red text-white'
                      : 'text-f1-muted hover:text-white hover:bg-f1-card'
                    }
                  `}
                >
                  <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
                  <span>{label}</span>
                  {isActive && <ChevronRight className="ml-auto w-4 h-4" />}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-f1-border">
            <p className="text-xs text-f1-muted">数据来源: OpenF1 & Jolpica API</p>
            <p className="text-xs text-f1-muted mt-1">© 2025 F1 Analytics</p>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-f1-gray/80 backdrop-blur-md border-b border-f1-border px-4 py-3 flex items-center gap-3">
          <button
            className="lg:hidden text-f1-muted hover:text-white p-1"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-sm text-f1-muted">
            {navItems.find(n => n.path === location.pathname || (n.path !== '/' && location.pathname.startsWith(n.path)))?.label || '首页'}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-f1-muted">实时数据</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
