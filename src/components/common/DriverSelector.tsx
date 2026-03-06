import type { Driver } from '../../types/f1'
import { getDriverColor } from '../../utils/f1'

interface DriverSelectorProps {
  drivers: Driver[]
  selected: number[]
  onChange: (selected: number[]) => void
  max?: number
}

export default function DriverSelector({ drivers, selected, onChange, max = 4 }: DriverSelectorProps) {
  const toggle = (num: number) => {
    if (selected.includes(num)) {
      onChange(selected.filter(n => n !== num))
    } else if (selected.length < max) {
      onChange([...selected, num])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {drivers.map((driver, i) => {
        const isSelected = selected.includes(driver.driver_number)
        const color = getDriverColor(driver, i)
        return (
          <button
            key={driver.driver_number}
            onClick={() => toggle(driver.driver_number)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
              border transition-all duration-150
              ${isSelected
                ? 'text-white border-transparent'
                : 'text-f1-muted border-f1-border hover:text-white hover:border-f1-muted bg-f1-gray'
              }
            `}
            style={isSelected ? { backgroundColor: color, borderColor: color } : {}}
          >
            <span className="font-mono font-bold text-xs w-5 text-center">
              {driver.driver_number}
            </span>
            <span>{driver.name_acronym}</span>
            {driver.headshot_url && (
              <img
                src={driver.headshot_url}
                alt={driver.name_acronym}
                className="w-5 h-5 rounded-full object-cover"
                onError={e => (e.currentTarget.style.display = 'none')}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
