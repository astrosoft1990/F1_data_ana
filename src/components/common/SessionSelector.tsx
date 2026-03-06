import { useState, useEffect, useRef, useCallback } from 'react'
import { openF1Api, type Meeting } from '../../api/openf1'
import type { Session } from '../../types/f1'
import { getAvailableYears } from '../../utils/f1'
import { LoadingSpinner } from './LoadingSpinner'
import { ChevronDown, Check } from 'lucide-react'

// ─── Country code mapping ─────────────────────────────────────────────────────
// OpenF1 uses 3-letter country codes; flagcdn.com needs ISO 3166-1 alpha-2
const ISO2: Record<string, string> = {
  AUS: 'au', BRN: 'bh', BHR: 'bh', CHN: 'cn', JPN: 'jp',
  SAU: 'sa', USA: 'us', MCO: 'mc', CAN: 'ca', ESP: 'es',
  AUT: 'at', GBR: 'gb', HUN: 'hu', BEL: 'be', NLD: 'nl',
  ITA: 'it', AZE: 'az', SGP: 'sg', MEX: 'mx', BRA: 'br',
  UAE: 'ae', QAT: 'qa', FRA: 'fr', DEU: 'de', GER: 'de',
  PRT: 'pt', ARG: 'ar', ZAF: 'za', NZL: 'nz', THA: 'th',
  VNM: 'vn', NLD_: 'nl', LVA: 'lv', DNK: 'dk', SWE: 'se',
  FIN: 'fi', NOR: 'no', CHE: 'ch', TUR: 'tr', GRC: 'gr',
  IND: 'in', KOR: 'kr', MYS: 'my', IDN: 'id', PAK: 'pk',
}

function flagUrl(countryCode: string): string {
  const iso2 = ISO2[countryCode?.toUpperCase()]
  return iso2 ? `https://flagcdn.com/24x18/${iso2}.png` : ''
}

// ─── FlagImg ──────────────────────────────────────────────────────────────────
function FlagImg({ code, className = 'w-6 h-4 object-cover rounded-sm flex-shrink-0' }: {
  code: string; className?: string
}) {
  const url = flagUrl(code)
  if (!url) return <div className={`${className} bg-f1-border`} />
  return (
    <img
      src={url}
      alt={code}
      className={className}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

// ─── MeetingGroup ─────────────────────────────────────────────────────────────
interface MeetingGroup {
  key: number
  name: string
  location: string
  countryCode: string
  dateStart: string   // ISO string – used for sorting
  round: number       // sequential index within the year
  sessions: Session[]
}

// ─── Custom dropdown ──────────────────────────────────────────────────────────
function MeetingSelect({
  meetings, value, onChange, loading,
}: {
  meetings: MeetingGroup[]
  value: number | null
  onChange: (key: number) => void
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = meetings.find(m => m.key === value)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll selected item into view when opening
  useEffect(() => {
    if (open && value && listRef.current) {
      const el = listRef.current.querySelector(`[data-key="${value}"]`) as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, value])

  const handleSelect = useCallback((key: number) => {
    onChange(key)
    setOpen(false)
  }, [onChange])

  if (loading) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 bg-f1-gray border border-f1-border rounded-lg">
        <LoadingSpinner size="sm" />
        <span className="text-xs text-f1-muted">加载中...</span>
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <div className="h-9 flex items-center px-3 text-xs text-f1-muted bg-f1-gray border border-f1-border rounded-lg">
        暂无数据
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 w-full bg-f1-gray border border-f1-border hover:border-f1-muted text-white rounded-lg px-3 py-1.5 text-sm text-left transition-colors focus:outline-none focus:border-f1-red"
      >
        {selected ? (
          <>
            <FlagImg code={selected.countryCode} />
            <span className="flex-1 truncate">{selected.name}</span>
            <span className="text-f1-muted text-xs flex-shrink-0">Rd.{selected.round}</span>
          </>
        ) : (
          <span className="text-f1-muted flex-1">— 请选择赛站 —</span>
        )}
        <ChevronDown className={`w-4 h-4 text-f1-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-f1-gray border border-f1-border rounded-xl shadow-2xl overflow-y-auto"
          style={{ maxHeight: '320px' }}
        >
          {meetings.map(m => (
            <button
              key={m.key}
              data-key={m.key}
              onClick={() => handleSelect(m.key)}
              className={`
                flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left
                hover:bg-f1-card transition-colors
                ${m.key === value ? 'bg-f1-card' : ''}
              `}
            >
              <FlagImg code={m.countryCode} />
              <span className="flex-1 truncate" style={{ color: m.key === value ? '#fff' : '#d0d0e8' }}>
                {m.name}
              </span>
              <span className="text-f1-muted text-xs flex-shrink-0">Rd.{m.round}</span>
              {m.key === value && <Check className="w-3.5 h-3.5 text-f1-red flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SessionSelector ──────────────────────────────────────────────────────────
interface SessionSelectorProps {
  onSelect: (session: Session) => void
  selectedKey?: number
  sessionTypes?: string[]
}

export default function SessionSelector({ onSelect, selectedKey, sessionTypes }: SessionSelectorProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [meetings, setMeetings] = useState<MeetingGroup[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<number | null>(null)

  const years = getAvailableYears()

  useEffect(() => {
    setLoading(true)
    setMeetings([])
    setSelectedMeeting(null)

    Promise.all([
      openF1Api.getSessions({ year }),
      openF1Api.getMeetings(year),
    ]).then(([sessions, meetingData]) => {
      const meetingInfoMap = new Map<number, Meeting>()
      for (const m of meetingData) meetingInfoMap.set(m.meeting_key, m)

      const filtered = sessionTypes
        ? sessions.filter(s => sessionTypes.includes(s.session_type))
        : sessions

      const meetingMap = new Map<number, MeetingGroup>()
      for (const session of filtered) {
        if (!meetingMap.has(session.meeting_key)) {
          const info = meetingInfoMap.get(session.meeting_key)
          meetingMap.set(session.meeting_key, {
            key: session.meeting_key,
            name: info?.meeting_name || `${session.country_name} Grand Prix`,
            location: info?.location || session.location || '',
            countryCode: info?.country_code || session.country_code || '',
            dateStart: info?.date_start || session.date_start || '',
            round: 0,   // filled after sorting
            sessions: [],
          })
        }
        meetingMap.get(session.meeting_key)!.sessions.push(session)
      }

      // Sort by race date (earliest first = Round 1, 2, 3 …)
      const sorted = Array.from(meetingMap.values()).sort(
        (a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime()
      )
      // Assign round numbers after sorting
      sorted.forEach((m, i) => { m.round = i + 1 })

      setMeetings(sorted)

      // Default: most recent completed or upcoming meeting
      const now = Date.now()
      const lastPast = [...sorted].reverse().find(m => new Date(m.dateStart).getTime() <= now)
      setSelectedMeeting((lastPast ?? sorted[sorted.length - 1])?.key ?? null)
    }).finally(() => setLoading(false))
  }, [year])

  const currentMeeting = meetings.find(m => m.key === selectedMeeting)

  return (
    <div className="bg-f1-card border border-f1-border rounded-xl p-4">
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Year selector */}
        <div>
          <label className="text-xs text-f1-muted block mb-1">赛季</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-f1-red h-9"
          >
            {years.map(y => <option key={y} value={y}>{y} 赛季</option>)}
          </select>
        </div>

        {/* Meeting selector – custom dropdown with flag images */}
        <div className="flex-1 min-w-[240px]">
          <label className="text-xs text-f1-muted block mb-1">
            赛站
            {!loading && meetings.length > 0 && (
              <span className="text-f1-muted/60 ml-1">({meetings.length} 站)</span>
            )}
          </label>
          <MeetingSelect
            meetings={meetings}
            value={selectedMeeting}
            onChange={setSelectedMeeting}
            loading={loading}
          />
        </div>
      </div>

      {/* Session type buttons */}
      {currentMeeting && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FlagImg code={currentMeeting.countryCode} className="w-5 h-3.5 object-cover rounded-sm" />
            <label className="text-xs text-f1-muted">
              选择会话 —{' '}
              <span className="text-white font-medium">{currentMeeting.name}</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentMeeting.sessions.map(session => (
              <button
                key={session.session_key}
                onClick={() => onSelect(session)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${selectedKey === session.session_key
                    ? 'bg-f1-red text-white'
                    : 'bg-f1-gray border border-f1-border text-f1-muted hover:text-white hover:border-f1-muted'
                  }
                `}
              >
                {session.session_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
