import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
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
} from 'lucide-react'
import { eventsApi } from '../api/client.js'
import { getCategoryConfig, getSourceConfig } from '../utils/categories.js'

// ── Inline Edit Form ──────────────────────────────────────────────────────────
function EditForm({ event, onSave, onCancel }) {
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
    <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-3 bg-zinc-50/70 dark:bg-zinc-800/40 p-4 rounded-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Title</label>
          <input className="input-field" value={form.title} onChange={handle('title')} />
        </div>
        <div>
          <label className="label">Organizer</label>
          <input className="input-field" value={form.organizer} onChange={handle('organizer')} />
        </div>
        <div>
          <label className="label">Venue</label>
          <input className="input-field" value={form.venue} onChange={handle('venue')} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="select-field" value={form.category} onChange={handle('category')}>
            {['recruitment','hackathon','workshop','exam','club','class','personal','other'].map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Start Time</label>
          <input
            type="datetime-local"
            className="input-field"
            value={form.start_time}
            onChange={handle('start_time')}
          />
        </div>
        <div>
          <label className="label">End Time</label>
          <input
            type="datetime-local"
            className="input-field"
            value={form.end_time}
            onChange={handle('end_time')}
          />
        </div>
      </div>
      <div>
        <label className="label">Summary</label>
        <textarea
          className="input-field resize-none"
          rows={3}
          value={form.summary}
          onChange={handle('summary')}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button className="btn-secondary text-xs py-1.5" onClick={onCancel}>
          <X size={13} /> Cancel
        </button>
        <button className="btn-primary text-xs py-1.5" onClick={() => onSave(form)}>
          <Check size={13} /> Save changes
        </button>
      </div>
    </div>
  )
}

// ── Main TimelineCard ─────────────────────────────────────────────────────────
export default function TimelineCard({ event, onEdit, onHide, onDelete, onShowSummary }) {
  const [editing, setEditing] = useState(false)
  const [syncingGCal, setSyncingGCal] = useState(false)

  const cfg = getCategoryConfig(event.category)
  const srcCfg = getSourceConfig(event.source_type)

  let startStr = null
  let endStr = null
  try {
    if (event.start_time) {
      const parsed = typeof event.start_time === 'string' ? parseISO(event.start_time) : new Date(event.start_time)
      if (isValid(parsed)) startStr = format(parsed, 'MMM d, yyyy • h:mm a')
    }
  } catch {}

  try {
    if (event.end_time) {
      const parsedEnd = typeof event.end_time === 'string' ? parseISO(event.end_time) : new Date(event.end_time)
      if (isValid(parsedEnd)) endStr = format(parsedEnd, 'h:mm a')
    }
  } catch {}

  function handleSave(form) {
    onEdit(event.id, form)
    setEditing(false)
  }

  async function handleExportGCal() {
    setSyncingGCal(true)
    try {
      const res = await eventsApi.exportToGoogleCalendar(event.id)
      toast.success('Added to Google Calendar!')
      if (res?.html_link) {
        window.open(res.html_link, '_blank')
      }
    } catch (err) {
      // Interceptor already toasts error message
    } finally {
      setSyncingGCal(false)
    }
  }

  return (
    <div
      className={`
        bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 p-5 transition-all duration-200
        hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm
        ${event.is_hidden ? 'opacity-50 bg-zinc-50 dark:bg-zinc-950' : ''}
      `}
    >
      {/* Top row: source + category badges */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${srcCfg.badge}`}>
            <span className="text-xs">{srcCfg.icon}</span> {srcCfg.label}
          </span>
          <span className={`badge ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          {event.is_hidden && (
            <span className="badge bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700">
              Hidden
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            title="Detailed AI Summary"
            onClick={() => onShowSummary?.(event)}
            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <Sparkles size={14} />
          </button>
          <button
            title="Add to Google Calendar"
            disabled={syncingGCal}
            onClick={handleExportGCal}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            <CalendarPlus size={14} className={syncingGCal ? 'animate-spin' : ''} />
          </button>
          <button
            title="Edit event"
            onClick={() => setEditing((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            title={event.is_hidden ? 'Show in feed' : 'Hide from feed'}
            onClick={() => onHide(event.id)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            {event.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            title="Delete permanently"
            onClick={() => {
              if (window.confirm('Delete this event?')) onDelete(event.id)
            }}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base leading-snug mb-2">
        {event.title}
      </h3>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400 mb-3">
        {startStr && (
          <span className="flex items-center gap-1.5">
            <Clock size={13} className="text-zinc-400" />
            {startStr}
            {endStr && ` – ${endStr}`}
          </span>
        )}
        {event.venue && (
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="text-zinc-400" /> {event.venue}
          </span>
        )}
        {event.organizer && (
          <span className="flex items-center gap-1.5">
            <User size={13} className="text-zinc-400" /> {event.organizer}
          </span>
        )}
      </div>

      {/* Summary */}
      {event.summary && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed bg-zinc-50/80 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
          {event.summary}
        </p>
      )}

      {/* Edit form */}
      {editing && (
        <EditForm
          event={event}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}
