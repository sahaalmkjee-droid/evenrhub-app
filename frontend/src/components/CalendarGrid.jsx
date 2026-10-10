import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  addWeeks,
  subWeeks,
  parseISO,
  isValid,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X, Clock, MapPin, User, Sparkles } from 'lucide-react'
import { getCategoryConfig } from '../utils/categories.js'
import { safeParseDate, safeFormatTime } from '../utils/date.js'

function groupEventsByDay(events) {
  const map = {}
  ;(events || []).forEach((ev) => {
    // If no start_time, fall back to created_at so announcement appears on the day it arrived
    const d = safeParseDate(ev.start_time) || safeParseDate(ev.created_at)
    if (!d) return
    const key = format(d, 'yyyy-MM-dd')
    if (!map[key]) map[key] = []
    map[key].push(ev)
  })
  return map
}

// ── Day Detail Modal ──────────────────────────────────────────────────────────
function DayDetailModal({ day, events, onClose, onShowSummary }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
              {format(day, 'EEEE')}
            </p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {format(day, 'MMMM d, yyyy')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Events list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {events.length === 0 ? (
            <p className="text-center text-zinc-400 dark:text-zinc-500 py-8 text-sm">No events scheduled for this date.</p>
          ) : (
            events.map((ev) => {
              const cfg = getCategoryConfig(ev.category)
              const startTime = safeFormatTime(ev.start_time)
              const endTime = safeFormatTime(ev.end_time)
              return (
                <div
                  key={ev.id}
                  className="bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl p-4 space-y-2 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug text-sm">
                      {ev.title}
                    </h3>
                    <span className={`badge ${cfg.badge} shrink-0`}>
                      {cfg.label}
                    </span>
                  </div>
                  {(startTime || endTime) && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <Clock size={12} className="text-zinc-400" />
                      {startTime}{endTime ? ` – ${endTime}` : ''}
                    </p>
                  )}
                  {ev.venue && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <MapPin size={12} className="text-zinc-400" />
                      {ev.venue}
                    </p>
                  )}
                  {ev.organizer && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <User size={12} className="text-zinc-400" />
                      {ev.organizer}
                    </p>
                  )}
                  {ev.summary && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-3 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                      {ev.summary}
                    </p>
                  )}

                  {/* Deep AI Summary Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => onShowSummary?.(ev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 text-xs font-semibold transition"
                    >
                      <Sparkles size={12} />
                      <span>Detailed Summary</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────────────────────
function MonthView({ currentDate, eventsByDay, onDayClick }) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = []
  let day = gridStart
  while (day <= gridEnd) {
    days.push(day)
    day = addDays(day, 1)
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-zinc-900">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-2.5 text-center text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr bg-zinc-200/70 dark:bg-zinc-800/80 gap-px">
        {days.map((d, i) => {
          const key = format(d, 'yyyy-MM-dd')
          const dayEvents = eventsByDay[key] || []
          const isCurrentMonth = isSameMonth(d, currentDate)
          const todayDay = isToday(d)
          const MAX_PILLS = 3

          return (
            <button
              key={i}
              onClick={() => onDayClick(d)}
              className={`
                min-h-[96px] p-2 text-left bg-white dark:bg-zinc-900
                transition-colors duration-100 group flex flex-col
                ${isCurrentMonth
                  ? 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                  : 'bg-zinc-50/40 dark:bg-zinc-950/40 opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}
              `}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`
                    inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full
                    ${todayDay
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-sm'
                      : 'text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white'}
                  `}
                >
                  {format(d, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                    {dayEvents.length}
                  </span>
                )}
              </div>
              <div className="space-y-1 flex-1 overflow-hidden w-full">
                {dayEvents.slice(0, MAX_PILLS).map((ev) => {
                  const cfg = getCategoryConfig(ev.category)
                  return (
                    <div
                      key={ev.id}
                      className={`text-[11px] font-medium truncate px-2 py-0.5 rounded-md ${cfg.pill} leading-snug`}
                    >
                      {ev.title}
                    </div>
                  )
                })}
                {dayEvents.length > MAX_PILLS && (
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold px-1">
                    +{dayEvents.length - MAX_PILLS} more
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ currentDate, eventsByDay, onDayClick }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="flex-1 grid grid-cols-7 gap-3 p-4 bg-zinc-50/60 dark:bg-zinc-950/50">
      {days.map((d) => {
        const key = format(d, 'yyyy-MM-dd')
        const dayEvents = eventsByDay[key] || []
        const todayDay = isToday(d)

        return (
          <button
            key={key}
            onClick={() => onDayClick(d)}
            className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all text-left"
          >
            <div className="mb-3 pb-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {format(d, 'EEE')}
                </p>
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 text-sm font-bold rounded-full mt-0.5 ${
                    todayDay
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {format(d, 'd')}
                </span>
              </div>
              {dayEvents.length > 0 && (
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                  {dayEvents.length}
                </span>
              )}
            </div>
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {dayEvents.map((ev) => {
                const cfg = getCategoryConfig(ev.category)
                return (
                  <div
                    key={ev.id}
                    className={`text-xs p-2 rounded-xl border ${cfg.pill} leading-snug space-y-0.5`}
                  >
                    <p className="font-semibold truncate">{ev.title}</p>
                    {ev.venue && <p className="text-[10px] opacity-75 truncate">📍 {ev.venue}</p>}
                  </div>
                )
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Day View ──────────────────────────────────────────────────────────────────
function DayView({ currentDate, eventsByDay, onShowSummary }) {
  const key = format(currentDate, 'yyyy-MM-dd')
  const dayEvents = eventsByDay[key] || []

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-zinc-900">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            {format(currentDate, 'EEEE')}
          </p>
          <h3 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
            {format(currentDate, 'MMMM d, yyyy')}
          </h3>
        </div>
        {dayEvents.length === 0 ? (
          <p className="text-zinc-400 dark:text-zinc-500 text-sm py-8 text-center">No events for this day.</p>
        ) : (
          dayEvents.map((ev) => {
            const cfg = getCategoryConfig(ev.category)
            const timeStr = safeFormatTime(ev.start_time)
            return (
              <div
                key={ev.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-2 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{ev.title}</h4>
                  <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  {timeStr && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {timeStr}
                    </span>
                  )}
                  {ev.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {ev.venue}
                    </span>
                  )}
                  {ev.organizer && (
                    <span className="flex items-center gap-1">
                      <User size={12} /> {ev.organizer}
                    </span>
                  )}
                </div>
                {ev.summary && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    {ev.summary}
                  </p>
                )}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => onShowSummary?.(ev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 text-xs font-semibold transition"
                  >
                    <Sparkles size={12} />
                    <span>Detailed Summary</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Main CalendarGrid ─────────────────────────────────────────────────────────
const VIEWS = ['Month', 'Week', 'Day']

export default function CalendarGrid({ events = [], onEventClick, onShowSummary }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState('Month')
  const [selectedDay, setSelectedDay] = useState(null)

  const eventsByDay = useMemo(() => groupEventsByDay(events), [events])

  function navigate(dir) {
    if (view === 'Month') {
      setCurrentDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)))
    } else if (view === 'Week') {
      setCurrentDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)))
    } else {
      setCurrentDate((d) => addDays(d, dir))
    }
  }

  function getTitle() {
    if (view === 'Month') return format(currentDate, 'MMMM yyyy')
    if (view === 'Week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 })
      const we = endOfWeek(currentDate, { weekStartsOn: 0 })
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`
    }
    return format(currentDate, 'EEEE, MMMM d, yyyy')
  }

  const selectedDayEvents = selectedDay
    ? eventsByDay[format(selectedDay, 'yyyy-MM-dd')] || []
    : []

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors duration-200">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 gap-3 flex-wrap bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date())}
            className="btn-secondary text-xs px-3 py-1.5 rounded-lg"
          >
            Today
          </button>
          <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />
            <button
              onClick={() => navigate(1)}
              className="p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 ml-2">
            {getTitle()}
          </h2>
        </div>

        {/* View toggle */}
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                view === v
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm font-bold'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      {view === 'Month' && (
        <MonthView
          currentDate={currentDate}
          eventsByDay={eventsByDay}
          onDayClick={(d) => setSelectedDay(d)}
        />
      )}
      {view === 'Week' && (
        <WeekView
          currentDate={currentDate}
          eventsByDay={eventsByDay}
          onDayClick={(d) => setSelectedDay(d)}
        />
      )}
      {view === 'Day' && (
        <DayView
          currentDate={currentDate}
          eventsByDay={eventsByDay}
          onShowSummary={onShowSummary}
        />
      )}

      {/* Day detail modal */}
      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          events={selectedDayEvents}
          onClose={() => setSelectedDay(null)}
          onShowSummary={onShowSummary}
        />
      )}
    </div>
  )
}
