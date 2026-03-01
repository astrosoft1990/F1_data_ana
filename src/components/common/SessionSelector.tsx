import { useState, useEffect } from 'react'
import { openF1Api, type Meeting } from '../../api/openf1'
import type { Session } from '../../types/f1'
import { getAvailableYears, getCountryFlag } from '../../utils/f1'
import { LoadingSpinner } from './LoadingSpinner'

interface SessionSelectorProps {
  onSelect: (session: Session) => void
  selectedKey?: number
  sessionTypes?: string[]
}

interface MeetingGroup {
  key: number
  name: string
  location: string
  countryCode: string
  sessions: Session[]
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
      // Build a lookup map from meeting_key → meeting info
      const meetingInfoMap = new Map<number, Meeting>()
      for (const m of meetingData) {
        meetingInfoMap.set(m.meeting_key, m)
      }

      const filtered = sessionTypes
        ? sessions.filter(s => sessionTypes.includes(s.session_type))
        : sessions

      // Group sessions by meeting, using meeting names from /meetings endpoint
      const meetingMap = new Map<number, MeetingGroup>()
      for (const session of filtered) {
        if (!meetingMap.has(session.meeting_key)) {
          const info = meetingInfoMap.get(session.meeting_key)
          // Fallback: build a name from session fields if meeting info missing
          const name = info?.meeting_name
            || `${session.country_name} Grand Prix`
          meetingMap.set(session.meeting_key, {
            key: session.meeting_key,
            name,
            location: info?.location || session.location || '',
            countryCode: info?.country_code || session.country_code || '',
            sessions: [],
          })
        }
        meetingMap.get(session.meeting_key)!.sessions.push(session)
      }

      // Sort meetings by date (latest first)
      const meetingList = Array.from(meetingMap.values()).reverse()
      setMeetings(meetingList)

      if (meetingList.length > 0) {
        setSelectedMeeting(meetingList[0].key)
      }
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
            className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-f1-red"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Meeting selector */}
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-f1-muted block mb-1">
            赛站 {!loading && meetings.length > 0 && <span className="text-f1-muted/60">({meetings.length} 站)</span>}
          </label>
          {loading ? (
            <div className="flex items-center gap-2 h-[34px]">
              <LoadingSpinner size="sm" />
              <span className="text-xs text-f1-muted">加载中...</span>
            </div>
          ) : meetings.length === 0 ? (
            <p className="text-xs text-f1-muted h-[34px] flex items-center">暂无数据</p>
          ) : (
            <select
              value={selectedMeeting ?? ''}
              onChange={e => setSelectedMeeting(Number(e.target.value))}
              className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-f1-red w-full"
            >
              {meetings.map(m => (
                <option key={m.key} value={m.key}>
                  {getCountryFlag(m.countryCode)} {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Session type buttons */}
      {currentMeeting && (
        <div>
          <label className="text-xs text-f1-muted block mb-2">
            选择会话 — <span className="text-white">{currentMeeting.name}</span>
          </label>
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
