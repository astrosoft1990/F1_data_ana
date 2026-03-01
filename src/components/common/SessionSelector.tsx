import { useState, useEffect } from 'react'
import { openF1Api } from '../../api/openf1'
import type { Session } from '../../types/f1'
import { getAvailableYears } from '../../utils/f1'
import { LoadingSpinner } from './LoadingSpinner'

interface SessionSelectorProps {
  onSelect: (session: Session) => void
  selectedKey?: number
  sessionTypes?: string[]
}

export default function SessionSelector({ onSelect, selectedKey, sessionTypes }: SessionSelectorProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [meetings, setMeetings] = useState<Array<{ key: number; name: string; sessions: Session[] }>>([])
  const [selectedMeeting, setSelectedMeeting] = useState<number | null>(null)

  const years = getAvailableYears()

  useEffect(() => {
    setLoading(true)
    openF1Api.getSessions({ year })
      .then(data => {
        const filtered = sessionTypes
          ? data.filter(s => sessionTypes.includes(s.session_type))
          : data

        const meetingMap = new Map<number, { key: number; name: string; sessions: Session[] }>()
        for (const session of filtered) {
          if (!meetingMap.has(session.meeting_key)) {
            meetingMap.set(session.meeting_key, {
              key: session.meeting_key,
              name: session.meeting_name,
              sessions: [],
            })
          }
          meetingMap.get(session.meeting_key)!.sessions.push(session)
        }
        const meetingList = Array.from(meetingMap.values()).reverse()
        setMeetings(meetingList)

        if (meetingList.length > 0 && !selectedMeeting) {
          setSelectedMeeting(meetingList[0].key)
        }
      })
      .finally(() => setLoading(false))
  }, [year])

  const currentMeeting = meetings.find(m => m.key === selectedMeeting)

  return (
    <div className="bg-f1-card border border-f1-border rounded-xl p-4">
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="text-xs text-f1-muted block mb-1">赛季</label>
          <select
            value={year}
            onChange={e => { setYear(Number(e.target.value)); setSelectedMeeting(null) }}
            className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-f1-red"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-f1-muted block mb-1">赛站</label>
          {loading ? (
            <div className="flex items-center gap-2 h-8">
              <LoadingSpinner size="sm" />
              <span className="text-xs text-f1-muted">加载中...</span>
            </div>
          ) : (
            <select
              value={selectedMeeting || ''}
              onChange={e => setSelectedMeeting(Number(e.target.value))}
              className="bg-f1-gray border border-f1-border text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-f1-red w-full"
            >
              {meetings.map(m => (
                <option key={m.key} value={m.key}>{m.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {currentMeeting && (
        <div>
          <label className="text-xs text-f1-muted block mb-2">选择会话</label>
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
