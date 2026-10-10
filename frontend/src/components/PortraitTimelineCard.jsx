import { useState } from 'react'
import { format, parseISO, isValid, isPast, isToday, isTomorrow, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Pencil,
  Eye,
  EyeOff,
  Trash2,
  Check,
  X,
  MapPin,
  User,
  Clock,
  CalendarPlus,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import { eventsApi } from '../api/client.js'
import { getCategoryConfig, getSourceConfig } from '../utils/categories.js'

// ── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ event, onSave, onClose }) {
  const [form, setForm] = useState({
    title: event.title || '',
    organizer: event.organizer || '',
    venue: event.venue || '',
    category: event.category || 'other',
    start_time: event.start_time ? event.start_time.slice(0, 16) : '',
    end_time: event.end_time ? event.end_time.slice(0, 16) : '',
    summary: event.summary || '',
  })

  const handle = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-3xl p-6 shadow-2xl space-y-4 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-400">
              <Pencil size={16} />
            </span>
            <h3 className="font-bold text-base text-zinc-100">Edit Event</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="text-zinc-400 block mb-1 font-medium">Event Title</label>
            <input
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              value={form.title}
              onChange={handle('title')}
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1 font-medium">Organizer</label>
            <input
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              value={form.organizer}
              onChange={handle('organizer')}
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1 font-medium">Venue</label>
            <input
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              value={form.venue}
              onChange={handle('venue')}
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1 font-medium">Category</label>
            <select
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              value={form.category}
              onChange={handle('category')}
            >
              {['recruitment','hackathon','workshop','exam','club','class','personal','other'].map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-zinc-400 block mb-1 font-medium">Start Time</label>
            <input
              type="datetime-local"
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              value={form.start_time}
              onChange={handle('start_time')}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-zinc-400 block mb-1 font-medium">End Time</label>
            <input
              type="datetime-local"
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              value={form.end_time}
              onChange={handle('end_time')}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-zinc-400 block mb-1 font-medium">Summary</label>
            <textarea
              rows={3}
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500 resize-none"
              value={form.summary}
              onChange={handle('summary')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
          >
            <Check size={14} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 3:4 Portrait Timeline Card ───────────────────────────────────────────────
export default function PortraitTimelineCard({
  event,
  isMain = false,
  isNextUpcoming = false,
  onClick,
  onEdit,
  onHide,
  onDelete,
  onShowSummary,
}) {
  const [editing, setEditing] = useState(false)
  const [syncingGCal, setSyncingGCal] = useState(false)

  const cfg = getCategoryConfig(event.category)
  const srcCfg = getSourceConfig(event.source_type)

  // Date parsing
  let startDate = null
  let endTimeStr = null
  try {
    if (event.start_time) {
      const parsed = typeof event.start_time === 'string' ? parseISO(event.start_time) : new Date(event.start_time)
      if (isValid(parsed)) startDate = parsed
    }
  } catch {
    startDate = null
  }

  try {
    if (event.end_time) {
      const parsedEnd = typeof event.end_time === 'string' ? parseISO(event.end_time) : new Date(event.end_time)
      if (isValid(parsedEnd)) endTimeStr = format(parsedEnd, 'h:mm a')
    }
  } catch {
    endTimeStr = null
  }

  const dayNumber = startDate ? format(startDate, 'd') : '--'
  const monthStr = startDate ? format(startDate, 'MMM').toUpperCase() : 'TBD'
  const yearStr = startDate ? format(startDate, 'yyyy') : ''
  const weekDayStr = startDate ? format(startDate, 'EEEE').toUpperCase() : ''
  const timeRangeStr = startDate ? format(startDate, 'h:mm a') : 'Time TBD'

  // Relative status badge
  let relativeBadge = null
  if (isNextUpcoming) {
    relativeBadge = {
      text: 'NEXT UPCOMING',
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
      pulse: true,
    }
  } else if (startDate) {
    if (isToday(startDate)) {
      relativeBadge = {
        text: 'TODAY',
        bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
        pulse: true,
      }
    } else if (isTomorrow(startDate)) {
      relativeBadge = {
        text: 'TOMORROW',
        bg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40',
      }
    } else if (isPast(startDate)) {
      relativeBadge = {
        text: formatDistanceToNow(startDate, { addSuffix: true }).toUpperCase(),
        bg: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-700/40 dark:text-zinc-400 dark:border-zinc-700/60',
      }
    } else {
      relativeBadge = {
        text: formatDistanceToNow(startDate, { addSuffix: true }).toUpperCase(),
        bg: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40',
      }
    }
  }

  async function handleExportGCal(e) {
    e?.stopPropagation()
    setSyncingGCal(true)
    try {
      const res = await eventsApi.exportToGoogleCalendar(event.id)
      toast.success('Event added to Google Calendar!')
      if (res?.html_link) {
        window.open(res.html_link, '_blank')
      }
    } catch {
      // client.js interceptor toasts errors
    } finally {
      setSyncingGCal(false)
    }
  }

  return (
    <>
      <div
        onClick={onClick}
        style={{
          boxShadow: isMain
            ? `0 20px 45px -10px ${cfg.glow || 'rgba(99,102,241,0.35)'}, 0 0 20px -5px ${cfg.glow || 'rgba(99,102,241,0.15)'}`
            : '0 8px 24px -10px rgba(0,0,0,0.12)',
        }}
        className={`
          relative w-[300px] sm:w-[330px] aspect-[3/4] rounded-[28px] p-[1.5px] cursor-pointer select-none
          transition-all duration-300 group
          ${isMain ? 'ring-1 ring-zinc-300/80 dark:ring-white/20' : 'hover:scale-[1.02]'}
          ${event.is_hidden ? 'opacity-60' : ''}
          ${isMain 
            ? (cfg.borderGradient ? `bg-gradient-to-br ${cfg.borderGradient}` : 'bg-gradient-to-br from-indigo-400 to-purple-400')
            : 'bg-gradient-to-br from-zinc-200 via-zinc-300/60 to-zinc-200 dark:from-zinc-700/60 dark:via-zinc-800/40 dark:to-zinc-900/60'
          }
          shadow-md
        `}
      >
        {/* Card Inner Body: Whitish-grey in light mode, sexy dark gradient in dark mode */}
        <div className="relative w-full h-full rounded-[26.5px] bg-gradient-to-b from-white via-zinc-50/95 to-zinc-100/95 dark:from-zinc-900/95 dark:via-zinc-950/95 dark:to-black/95 backdrop-blur-2xl p-5 flex flex-col justify-between overflow-hidden border border-zinc-200/50 dark:border-transparent">
          {/* Ambient Category Glow in top corner */}
          <div
            className={`absolute -top-14 -right-14 w-40 h-40 rounded-full blur-3xl opacity-20 dark:opacity-30 pointer-events-none bg-gradient-to-br ${cfg.gradient || 'from-indigo-600 to-purple-600'}`}
          />
          <div
            className={`absolute -bottom-14 -left-14 w-40 h-40 rounded-full blur-3xl opacity-15 dark:opacity-20 pointer-events-none bg-gradient-to-tr ${cfg.gradient || 'from-indigo-600 to-purple-600'}`}
          />

          {/* ── TOP SECTION: Header badges ── */}
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              {/* Category Pill */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border bg-zinc-100/90 text-zinc-700 border-zinc-200 dark:bg-white/5 dark:border-white/10 dark:text-zinc-200">
                <span className={`w-2 h-2 rounded-full ${cfg.dot || 'bg-indigo-500'} shadow-sm`} />
                {cfg.label}
              </span>

              {/* Source Badge */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white text-zinc-700 border border-zinc-200 shadow-xs dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700/60">
                <span>{srcCfg.icon}</span>
                <span>{srcCfg.label}</span>
              </span>
            </div>

            {/* Relative timing badge */}
            {relativeBadge && (
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold tracking-widest border ${relativeBadge.bg}`}
                >
                  {relativeBadge.pulse && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}
                  {relativeBadge.text}
                </span>

                {event.is_hidden && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                    Hidden
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── MIDDLE SECTION: Giant Calendar Day & Title ── */}
          <div className="relative z-10 my-auto py-2">
            {/* Bold Calendar Date Banner */}
            <div className="flex items-baseline gap-3 mb-2.5">
              <span className="text-5xl font-black tracking-tight text-zinc-900 dark:text-white drop-shadow-none dark:drop-shadow-sm font-mono">
                {dayNumber}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-widest text-zinc-700 dark:text-zinc-300 font-mono">
                  {monthStr} {yearStr}
                </span>
                <span className="text-[10px] font-bold tracking-widest text-zinc-400 dark:text-zinc-500">
                  {weekDayStr}
                </span>
              </div>
            </div>

            {/* Event Title */}
            <h3
              className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white leading-snug line-clamp-2 drop-shadow-none dark:drop-shadow-sm"
              title={event.title}
            >
              {event.title}
            </h3>

            {/* Meta Row (Time & Venue) */}
            <div className="mt-2.5 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
              <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-medium">
                <Clock size={13} className="text-zinc-400 shrink-0" />
                <span className="truncate">
                  {timeRangeStr}
                  {endTimeStr ? ` – ${endTimeStr}` : ''}
                </span>
              </div>
              {event.venue && (
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <MapPin size={13} className="text-zinc-400 shrink-0" />
                  <span className="truncate">{event.venue}</span>
                </div>
              )}
              {event.organizer && (
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <User size={13} className="text-zinc-400 shrink-0" />
                  <span className="truncate">{event.organizer}</span>
                </div>
              )}
            </div>

            {/* Summary preview */}
            {event.summary && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 line-clamp-2 bg-zinc-100/90 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-200/60 dark:border-white/5">
                {event.summary}
              </p>
            )}
          </div>

          {/* ── BOTTOM SECTION: Actions bar ── */}
          <div className="relative z-10 pt-3 border-t border-zinc-200/80 dark:border-white/10 flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              {/* Deep AI Summary Action */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onShowSummary?.(event)
                }}
                title="Generate In-Depth AI Summary from Email / Announcement"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-600/25 dark:hover:bg-indigo-600/45 dark:text-indigo-300 dark:border-indigo-500/40 text-xs font-semibold transition shadow-xs"
              >
                <Sparkles size={13} className="text-indigo-600 dark:text-indigo-400" />
                <span>Deep Summary</span>
              </button>

              {/* Google Calendar Action */}
              <button
                onClick={handleExportGCal}
                disabled={syncingGCal}
                title="Add to Google Calendar"
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-600/20 dark:hover:bg-blue-600/40 dark:text-blue-300 dark:border-blue-500/30 text-xs font-semibold transition shadow-xs disabled:opacity-50"
              >
                <CalendarPlus size={14} className={syncingGCal ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Add to Cal</span>
              </button>
            </div>

            {/* Secondary actions: Edit, Hide, Delete */}
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                }}
                title="Edit event details"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onHide?.(event.id)
                }}
                title={event.is_hidden ? 'Show on timeline' : 'Hide from timeline'}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                {event.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm('Delete this event permanently?')) {
                    onDelete?.(event.id)
                  }
                }}
                title="Delete event"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Dimming overlay on side cards */}
        {!isMain && (
          <div className="absolute inset-0 rounded-[28px] bg-white/50 hover:bg-white/20 dark:bg-black/40 dark:hover:bg-black/10 transition-colors pointer-events-none flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-bold text-zinc-800 dark:text-white bg-white/90 dark:bg-black/70 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-white/20 shadow-md">
              Click to Focus
            </span>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <EditModal
          event={event}
          onSave={(updated) => {
            onEdit?.(event.id, updated)
            setEditing(false)
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
