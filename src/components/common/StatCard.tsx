interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: string
  icon?: React.ReactNode
}

export function StatCard({ label, value, sub, color, icon }: StatCardProps) {
  return (
    <div className="bg-f1-card border border-f1-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-f1-muted uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-white" style={color ? { color } : {}}>
            {value}
          </p>
          {sub && <p className="text-xs text-f1-muted mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className="p-2 bg-f1-border/50 rounded-lg text-f1-muted">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

interface SectionHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-f1-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-f1-card border border-f1-border rounded-xl ${className}`}>
      {children}
    </div>
  )
}
