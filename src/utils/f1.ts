import type { Driver, Lap, TireCompound } from '../types/f1'

export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '--:--:---'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

export function formatSectorTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '--:--.---'
  return seconds.toFixed(3)
}

export function lapTimeDelta(a: number | null, b: number | null): string {
  if (a == null || b == null) return 'N/A'
  const delta = a - b
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(3)}s`
}

export function getDriverColor(driver: Driver | undefined, index = 0): string {
  if (driver?.team_colour) {
    return `#${driver.team_colour}`
  }
  const colors = [
    '#e8002d', '#ff8700', '#ffd700', '#00d2be', '#0067ff',
    '#dc0000', '#2b4562', '#b6babd', '#005aff', '#00e2d2',
  ]
  return colors[index % colors.length]
}

export function getTireColor(compound: TireCompound | string): string {
  const colors: Record<string, string> = {
    SOFT: '#e8002d',
    MEDIUM: '#ffd700',
    HARD: '#f0f0f0',
    INTERMEDIATE: '#39b54a',
    WET: '#0067ff',
    UNKNOWN: '#666666',
  }
  return colors[compound] || '#666666'
}

export function getTireLetter(compound: TireCompound | string): string {
  const letters: Record<string, string> = {
    SOFT: 'S',
    MEDIUM: 'M',
    HARD: 'H',
    INTERMEDIATE: 'I',
    WET: 'W',
    UNKNOWN: '?',
  }
  return letters[compound] || '?'
}

export function findFastestLap(laps: Lap[]): Lap | null {
  const validLaps = laps.filter(l => l.lap_duration != null && l.lap_duration > 0 && !l.is_pit_out_lap)
  if (validLaps.length === 0) return null
  return validLaps.reduce((fastest, lap) =>
    (lap.lap_duration! < fastest.lap_duration!) ? lap : fastest
  )
}

/**
 * Returns the single fastest clean lap time across ALL drivers in the session.
 * Used as the reference for the 1.2× outlier threshold.
 */
export function getSessionFastestLap(laps: Lap[]): number | null {
  const times = laps
    .filter(l => l.lap_duration != null && l.lap_duration > 0 && !l.is_pit_out_lap)
    .map(l => l.lap_duration!)
  return times.length > 0 ? Math.min(...times) : null
}

/**
 * A lap is "valid" for analysis if it:
 *  1. Has a non-null, positive duration
 *  2. Is not a pit-out lap
 *  3. Is within `threshold` × session fastest (default 1.2×)
 *
 * Pass `sessionFastest = null` to skip the threshold check.
 */
export function isValidLap(lap: Lap, sessionFastest: number | null, threshold = 1.2): boolean {
  if (lap.lap_duration == null || lap.lap_duration <= 0) return false
  if (lap.is_pit_out_lap) return false
  if (sessionFastest != null && lap.lap_duration > sessionFastest * threshold) return false
  return true
}

/** Returns true when a lap should be flagged as an outlier (slow) but NOT a pit-out lap. */
export function isSlowLap(lap: Lap, sessionFastest: number | null, threshold = 1.2): boolean {
  if (lap.is_pit_out_lap) return false
  if (lap.lap_duration == null || lap.lap_duration <= 0) return false
  if (sessionFastest == null) return false
  return lap.lap_duration > sessionFastest * threshold
}

export function groupLapsByDriver(laps: Lap[]): Map<number, Lap[]> {
  const map = new Map<number, Lap[]>()
  for (const lap of laps) {
    const existing = map.get(lap.driver_number) || []
    existing.push(lap)
    map.set(lap.driver_number, existing)
  }
  return map
}

export function getSessionDisplayName(session_name: string, meeting_name: string): string {
  return `${meeting_name} - ${session_name}`
}

export function getCountryFlag(country_code: string | undefined): string {
  if (!country_code) return ''
  const flags: Record<string, string> = {
    AUS: '🇦🇺', JPN: '🇯🇵', CHN: '🇨🇳', BRN: '🇧🇭', SAU: '🇸🇦',
    USA: '🇺🇸', MCO: '🇲🇨', CAN: '🇨🇦', ESP: '🇪🇸', AUT: '🇦🇹',
    GBR: '🇬🇧', HUN: '🇭🇺', BEL: '🇧🇪', NLD: '🇳🇱', ITA: '🇮🇹',
    AZE: '🇦🇿', SGP: '🇸🇬', MEX: '🇲🇽', BRA: '🇧🇷', UAE: '🇦🇪',
    QAT: '🇶🇦', LVA: '🇱🇻', FIN: '🇫🇮', FRA: '🇫🇷', DEU: '🇩🇪',
    NZL: '🇳🇿', DNK: '🇩🇰', THA: '🇹🇭',
  }
  return flags[country_code] || ''
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function isSessionLive(session: { date_start: string; date_end: string }): boolean {
  const now = new Date()
  const start = new Date(session.date_start)
  const end = new Date(session.date_end)
  return now >= start && now <= end
}

export function isSessionPast(session: { date_end: string }): boolean {
  return new Date() > new Date(session.date_end)
}

export function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear; y >= 2023; y--) {
    years.push(y)
  }
  return years
}

export function calculateGapToFastest(laps: Lap[], driverNumber: number): number | null {
  const allFastest = laps
    .filter(l => l.lap_duration != null && !l.is_pit_out_lap)
    .reduce((min, l) => Math.min(min, l.lap_duration!), Infinity)

  const driverLaps = laps.filter(l => l.driver_number === driverNumber)
  const driverFastest = findFastestLap(driverLaps)

  if (!driverFastest?.lap_duration || allFastest === Infinity) return null
  return driverFastest.lap_duration - allFastest
}
