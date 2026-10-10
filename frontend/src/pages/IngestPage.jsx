import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, Upload, PenSquare, Filter, Activity,
  RefreshCw, Loader2, CheckCircle2, AlertCircle, Clock,
  X, Plus, ExternalLink, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'
import UploadDropzone from '../components/UploadDropzone.jsx'
import { ingestApi, filtersApi } from '../api/client.js'
import { CATEGORY_CONFIG } from '../utils/categories.js'
import { useAuth } from '../context/AuthContext.jsx'

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ id, icon: Icon, title, color, children }) {
  return (
    <div className="card p-6 space-y-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-sm rounded-2xl">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 ${color} rounded-xl shadow-sm`}>
          <Icon size={18} />
        </div>
        <h2 className="section-title text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Gmail Sync
// ─────────────────────────────────────────────────────────────────────────────
function GmailSection() {
  const [syncing, setSyncing] = useState(false)
  const [syncingMode, setSyncingMode] = useState(null)
  const [emailCount, setEmailCount] = useState(10)
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: gmailStatus, refetch } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: ingestApi.getGmailStatus,
    retry: false,
    staleTime: 30000,
  })

  const connected = gmailStatus?.connected || user?.role === 'student'
  const displayEmail = gmailStatus?.email || (user?.role === 'student' ? user.email : null)

  useEffect(() => {
    function handleMsg(event) {
      if (event.data?.type === 'GMAIL_AUTH_SUCCESS') {
        toast.success(`Gmail connected: ${event.data.email || 'Success'}`)
        refetch()
        queryClient.invalidateQueries({ queryKey: ['jobs'] })
        queryClient.invalidateQueries({ queryKey: ['events'] })
      }
    }
    window.addEventListener('message', handleMsg)
    return () => window.removeEventListener('message', handleMsg)
  }, [refetch, queryClient])

  async function handleConnect() {
    try {
      const res = await ingestApi.connectGmail()
      if (res?.auth_url) {
        window.open(res.auth_url, '_blank', 'width=500,height=600')
        toast('Complete Gmail authentication in popup window')
        setTimeout(() => refetch(), 3000)
      }
    } catch {
      toast.error('Failed to initiate Gmail connection')
    }
  }

  async function handleSync(isForce = false) {
    const count = Math.max(1, Math.min(50, Number(emailCount) || 10))
    setSyncing(true)
    setSyncingMode(isForce ? 'force' : 'normal')
    try {
      await ingestApi.syncGmail(count, isForce)
      toast.success(
        isForce
          ? `Force-extracting last ${count} emails with Local SLM! Watch Job Feed below.`
          : `Syncing last ${count} emails...`
      )
      setTimeout(() => {
        refetch()
        queryClient.invalidateQueries({ queryKey: ['jobs'] })
        queryClient.invalidateQueries({ queryKey: ['events'] })
      }, 2500)
    } catch {
      toast.error('Sync request failed')
    } finally {
      setSyncing(false)
      setSyncingMode(null)
    }
  }

  return (
    <Section icon={Mail} title="Gmail Ingestion" color="bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/70 dark:border-rose-900/60" id="gmail">
      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">
                Connected as{' '}
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {displayEmail || 'user@gmail.com'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                Last synced: {gmailStatus?.last_synced
                  ? new Date(gmailStatus.last_synced).toLocaleTimeString()
                  : 'Never'}
              </span>
            </div>
          </div>

          {/* Controls to ingest and force-add last N emails (Default: 10, Max: 50) */}
          <div className="bg-zinc-50/70 dark:bg-zinc-800/30 p-4 rounded-xl border border-zinc-200/60 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                  Fetch Last N Emails to Timeline
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Default is 10 emails (maximum 50). Processed 100% locally on your RTX 5060 GPU.
                </p>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex items-center gap-1.5">
                {[5, 10, 20, 50].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setEmailCount(num)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                      emailCount === num
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Count (N):</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={emailCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val)) {
                      setEmailCount(Math.max(1, Math.min(50, val)))
                    } else {
                      setEmailCount('')
                    }
                  }}
                  className="w-20 px-3 py-1.5 text-xs text-center font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <span className="text-xs text-zinc-400">emails</span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => handleSync(false)}
                  disabled={syncing}
                  className="btn-secondary text-xs py-2 px-3.5"
                  title="Smart filter & sync emails"
                >
                  {syncing && syncingMode === 'normal' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Smart Sync ({emailCount || 10})
                </button>

                <button
                  onClick={() => handleSync(true)}
                  disabled={syncing}
                  className="btn-primary text-xs py-2 px-4 shadow-sm bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                  title="Force extracts events from the last N emails directly onto your timeline"
                >
                  {syncing && syncingMode === 'force' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Zap size={13} />
                  )}
                  Force Add Last {emailCount || 10} to Timeline
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 bg-zinc-50/50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-center justify-center text-zinc-700 dark:text-zinc-200">
            <Mail size={22} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Connect Google Workspace or Gmail</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
              Automatically scans email announcements and notices for date, venue, and deadline details.
            </p>
          </div>
          <button onClick={handleConnect} className="btn-primary text-xs py-2 px-4 mt-1">
            <ExternalLink size={13} /> Connect Gmail Account
          </button>
        </div>
      )}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Media Dropzone & Text Ingestion (Simplified + Periodic Support)
// ─────────────────────────────────────────────────────────────────────────────
function TextPasteSection() {
  const [text, setText] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (content) => ingestApi.submitText(content),
    onSuccess: (res) => {
      toast.success(res?.message || 'Text sent for extraction!')
      setText('')
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['ingest-jobs'] })
    },
    onError: () => toast.error('Failed to process text'),
  })

  function handleInsertSample() {
    setText(
      `CS2800 Operating Systems
Instructor: Prof. Narayanaswamy
Schedule: Mondays 09:00 AM - 10:00 AM and Wednesdays 09:00 AM - 10:00 AM
Venue: CS25 Lecture Hall
Topics: Process concurrency, scheduling algorithms, virtual memory, paging, and storage systems.`
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="label">Or paste announcement or timetable text directly</label>
        <button
          type="button"
          onClick={handleInsertSample}
          className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
        >
          📋 Insert Sample Class Timetable
        </button>
      </div>
      <textarea
        className="input-field resize-none font-mono text-xs"
        rows={4}
        placeholder="e.g. 'CH2010 Thermodynamics: Mondays and Thursdays 9:00 AM - 10:00 AM in Hall 2' or 'Slot A: IITM Core Course'…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          💡 Periodic days like <span className="font-semibold text-zinc-700 dark:text-zinc-300">"Mondays 9 AM"</span> automatically project onto all Mondays of the semester.
        </p>
        <button
          onClick={() => {
            if (!text.trim()) { toast.error('Please enter some text'); return }
            mutation.mutate(text)
          }}
          disabled={mutation.isPending || !text.trim()}
          className="btn-primary text-xs py-1.5 px-4"
        >
          {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Extract Events with Local AI
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Manual Event & Recurring Timetable Creator
// ─────────────────────────────────────────────────────────────────────────────
const DAYS_OF_WEEK = [
  { id: 'monday', label: 'Mon' },
  { id: 'tuesday', label: 'Tue' },
  { id: 'wednesday', label: 'Wed' },
  { id: 'thursday', label: 'Thu' },
  { id: 'friday', label: 'Fri' },
  { id: 'saturday', label: 'Sat' },
  { id: 'sunday', label: 'Sun' },
]

const IITM_SLOT_PRESETS = [
  { id: 'custom', label: 'Custom Days & Time Slot' },
  { id: 'Slot A', label: 'Slot A (Mon 8:00, Tue 13:00, Thu 11:00, Fri 14:00)' },
  { id: 'Slot B', label: 'Slot B (Mon 9:00, Tue 8:00, Wed 13:00, Fri 10:00)' },
  { id: 'Slot C', label: 'Slot C (Mon 10:00, Wed 8:00, Thu 13:00, Fri 9:00)' },
  { id: 'Slot D', label: 'Slot D (Mon 11:00, Tue 14:00, Wed 9:00, Fri 13:00)' },
  { id: 'Slot E', label: 'Slot E (Tue 9:00, Wed 10:00, Thu 8:00, Fri 11:00)' },
  { id: 'Slot F', label: 'Slot F (Tue 10:00, Wed 11:00, Thu 9:00)' },
  { id: 'Slot G', label: 'Slot G (Tue 11:00, Thu 10:00)' },
  { id: 'Slot P', label: 'Slot P (Mon 14:00 - 17:00 Lab)' },
  { id: 'Slot Q', label: 'Slot Q (Tue 14:00 - 17:00 Lab)' },
  { id: 'Slot R', label: 'Slot R (Wed 14:00 - 17:00 Lab)' },
  { id: 'Slot S', label: 'Slot S (Thu 14:00 - 17:00 Lab)' },
  { id: 'Slot T', label: 'Slot T (Fri 14:00 - 17:00 Lab)' },
]

const INITIAL_FORM = {
  title: '',
  organizer: '',
  category: 'class',
  start_time: '',
  end_time: '',
  venue: '',
  summary: '',
}

function ManualEventForm() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [isRecurring, setIsRecurring] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState('custom')
  const [selectedDays, setSelectedDays] = useState(['monday'])
  const [startTimeOfDay, setStartTimeOfDay] = useState('09:00')
  const [endTimeOfDay, setEndTimeOfDay] = useState('10:00')
  const [repeatWeeks, setRepeatWeeks] = useState(14)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data) => ingestApi.submitManual(data),
    onSuccess: (res) => {
      toast.success(res?.message || 'Event(s) created successfully!')
      setForm(INITIAL_FORM)
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: () => toast.error('Failed to create event'),
  })

  const handle = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const toggleDay = (dayId) => {
    setSelectedDays((prev) =>
      prev.includes(dayId)
        ? (prev.length > 1 ? prev.filter((d) => d !== dayId) : prev)
        : [...prev, dayId]
    )
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }

    if (isRecurring) {
      mutation.mutate({
        title: form.title.trim(),
        organizer: form.organizer.trim() || 'Academic Faculty',
        category: form.category || 'class',
        venue: form.venue.trim(),
        summary: form.summary.trim(),
        is_recurring: true,
        repeat_days: selectedSlot === 'custom' ? selectedDays : null,
        slot_name: selectedSlot !== 'custom' ? selectedSlot : null,
        start_time_of_day: startTimeOfDay,
        end_time_of_day: endTimeOfDay,
        repeat_weeks: Number(repeatWeeks) || 14,
      })
    } else {
      mutation.mutate({
        ...form,
        is_recurring: false,
      })
    }
  }

  return (
    <Section icon={PenSquare} title="Manual Event & Timetable Creator" color="bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-200/70 dark:border-teal-900/60" id="manual">
      {/* Event Type Mode Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-100 dark:bg-zinc-800/70 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
        <button
          type="button"
          onClick={() => setIsRecurring(false)}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
            !isRecurring
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          Single / One-time Event
        </button>
        <button
          type="button"
          onClick={() => {
            setIsRecurring(true)
            if (form.category === 'other') setForm((f) => ({ ...f, category: 'class' }))
          }}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            isRecurring
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400'
          }`}
        >
          <span>🔁</span> Repeating Class / IITM Timetable Slot
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Course or Event Title *</label>
            <input
              className="input-field"
              placeholder={isRecurring ? "e.g. CS2800 Operating Systems" : "e.g. Annual Hackathon 2026"}
              value={form.title}
              onChange={handle('title')}
              required
            />
          </div>
          <div>
            <label className="label">Instructor / Organizer</label>
            <input
              className="input-field"
              placeholder={isRecurring ? "e.g. Prof. Narayanaswamy / Dept of CS" : "e.g. Computer Science Club"}
              value={form.organizer}
              onChange={handle('organizer')}
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="select-field" value={form.category} onChange={handle('category')}>
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Venue / Classroom</label>
            <input
              className="input-field"
              placeholder={isRecurring ? "e.g. CS25 Hall / NAC 101" : "e.g. Main Auditorium"}
              value={form.venue}
              onChange={handle('venue')}
            />
          </div>
        </div>

        {/* Dynamic Section: Repeating Timetable Slot vs Specific Date/Time */}
        {isRecurring ? (
          <div className="p-4 rounded-xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200/80 dark:border-teal-900/60 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                <span>⚡</span> IITM Standard Slot or Custom Weekdays
              </span>
              <span className="text-[11px] font-medium text-teal-700 dark:text-teal-300">
                (No specific date needed — auto-populates calendar)
              </span>
            </div>

            {/* Slot Preset Dropdown */}
            <div>
              <label className="label">IITM Slot Preset</label>
              <select
                className="select-field"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
              >
                {IITM_SLOT_PRESETS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Custom Day Chips & Timings when custom is picked */}
            {selectedSlot === 'custom' && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="label">Repeat on Weekdays (Multi-select)</label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {DAYS_OF_WEEK.map((day) => {
                      const active = selectedDays.includes(day.id)
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleDay(day.id)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                            active
                              ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                              : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-teal-500'
                          }`}
                        >
                          {day.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="label">Slot Start Time</label>
                    <input
                      type="time"
                      className="input-field"
                      value={startTimeOfDay}
                      onChange={(e) => setStartTimeOfDay(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Slot End Time</label>
                    <input
                      type="time"
                      className="input-field"
                      value={endTimeOfDay}
                      onChange={(e) => setEndTimeOfDay(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Semester Duration (Weeks) */}
            <div className="pt-2 border-t border-teal-200/50 dark:border-teal-900/50 flex items-center justify-between flex-wrap gap-3">
              <div>
                <label className="label">Semester Duration (Horizon)</label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Projects class instances across your calendar deck & views.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="26"
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(Math.max(1, Math.min(26, parseInt(e.target.value, 10) || 14)))}
                  className="w-16 px-2.5 py-1.5 text-xs font-bold text-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Weeks</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date & Time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={form.start_time}
                onChange={handle('start_time')}
              />
            </div>
            <div>
              <label className="label">End Date & Time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={form.end_time}
                onChange={handle('end_time')}
              />
            </div>
          </div>
        )}

        <div>
          <label className="label">Notes / Syllabus Summary</label>
          <textarea
            className="input-field resize-none"
            rows={2}
            placeholder="Brief description or course topics…"
            value={form.summary}
            onChange={handle('summary')}
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className={`w-full justify-center text-xs py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm ${
            isRecurring
              ? 'bg-teal-600 hover:bg-teal-700 text-white'
              : 'btn-primary'
          }`}
        >
          {mutation.isPending
            ? <><Loader2 size={14} className="animate-spin" /> {isRecurring ? 'Generating recurring sessions…' : 'Saving event…'}</>
            : <><Plus size={14} /> {isRecurring ? `Schedule Repeating Class (${repeatWeeks} Weeks)` : 'Create Event'}</>
          }
        </button>
      </form>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Filter Rules
// ─────────────────────────────────────────────────────────────────────────────
function FilterRuleManager() {
  const [instruction, setInstruction] = useState('')
  const [category, setCategory] = useState('')
  const queryClient = useQueryClient()

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['filter-rules'],
    queryFn: filtersApi.list,
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: () => filtersApi.create(instruction.trim(), category || null),
    onSuccess: () => {
      toast.success('Filter rule added')
      setInstruction('')
      setCategory('')
      queryClient.invalidateQueries({ queryKey: ['filter-rules'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: () => toast.error('Failed to add rule'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => filtersApi.delete(id),
    onSuccess: () => {
      toast.success('Filter rule removed')
      queryClient.invalidateQueries({ queryKey: ['filter-rules'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: () => toast.error('Failed to remove rule'),
  })

  function handleAdd() {
    if (!instruction.trim()) { toast.error('Please enter a filter instruction'); return }
    createMutation.mutate()
  }

  return (
    <Section icon={Filter} title="Negative Filtering Rules" color="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-900/60" id="filters">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Tell the AI aggregator which events to automatically hide (e.g. "Ignore all hostel notices").
      </p>
      {/* Add rule */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <input
          className="input-field flex-1"
          placeholder="e.g. Hide all seminars about hostel rules"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <select
          className="select-field sm:w-44"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Any category</option>
          {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={createMutation.isPending}
          className="btn-primary shrink-0 text-xs py-2 px-4"
        >
          {createMutation.isPending
            ? <Loader2 size={13} className="animate-spin" />
            : <Plus size={13} />
          }
          Add Rule
        </button>
      </div>

      {/* Active rules */}
      {isLoading ? (
        <div className="flex gap-2 flex-wrap">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-7 w-32 rounded-full" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 italic pt-1">No active filter rules. All extracted circulars will appear.</p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-2">
          {rules.map((rule) => {
            const catCfg = rule.category ? CATEGORY_CONFIG[rule.category] : null
            return (
              <div
                key={rule.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-xs font-semibold text-zinc-800 dark:text-zinc-200 shadow-sm"
              >
                {catCfg && (
                  <span className={`w-1.5 h-1.5 rounded-full ${catCfg.dot}`} />
                )}
                <span className="max-w-[220px] truncate">{rule.instruction}</span>
                <button
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="hover:text-rose-600 dark:hover:text-rose-400 text-zinc-400 dark:text-zinc-500 transition-colors ml-0.5"
                  disabled={deleteMutation.isPending}
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Background Job Feed
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  PENDING: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    bar: 'bg-amber-500',
    icon: <Clock size={11} />,
    pct: 20,
  },
  PROCESSING: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    bar: 'bg-zinc-900 dark:bg-white',
    icon: <Loader2 size={11} className="animate-spin" />,
    pct: 60,
  },
  SUCCESS: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    bar: 'bg-emerald-500',
    icon: <CheckCircle2 size={11} />,
    pct: 100,
  },
  FAILED: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    bar: 'bg-rose-500',
    icon: <AlertCircle size={11} />,
    pct: 100,
  },
}

const SOURCE_EMOJI = {
  email: '✉️', gmail: '✉️',
  poster: '🖼️', image: '🖼️', pdf: '📄', manual: '✏️', text: '📝',
}

function JobFeedItem({ job }) {
  const s = STATUS_STYLES[job.status] || STATUS_STYLES.PENDING
  const emoji = SOURCE_EMOJI[job.source_type?.toLowerCase()] || '📌'

  return (
    <div className="bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl p-3.5 space-y-2 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base">{emoji}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
              {job.filename || job.description || `Task #${job.id?.slice(0, 8)}`}
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {job.source_type} · {new Date(job.created_at || Date.now()).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <span className={`badge ${s.badge} shrink-0 text-[11px]`}>
          {s.icon} {job.status}
        </span>
      </div>
      <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${s.bar} rounded-full transition-all duration-700`}
          style={{ width: `${job.progress ?? s.pct}%` }}
        />
      </div>
    </div>
  )
}

function JobFeed() {
  const queryClient = useQueryClient()
  const { data: jobList = [] } = useQuery({
    queryKey: ['ingest-jobs'],
    queryFn: ingestApi.listJobs,
    refetchInterval: 2500,
    retry: false,
  })

  useEffect(() => {
    if (jobList.some((j) => j.status === 'SUCCESS')) {
      queryClient.invalidateQueries({ queryKey: ['events'] })
    }
  }, [jobList, queryClient])

  const displayJobs = jobList.length > 0 ? jobList : [
    { id: '1', source_type: 'poster', filename: 'hackathon_poster.png', status: 'SUCCESS', progress: 100, created_at: new Date(Date.now() - 60000).toISOString() },
    { id: '2', source_type: 'pdf', filename: 'midterm_exam_circular.pdf', status: 'PROCESSING', progress: 55, created_at: new Date(Date.now() - 30000).toISOString() },
    { id: '3', source_type: 'gmail', filename: 'Placement Cell Email Batch', status: 'PENDING', progress: 15, created_at: new Date().toISOString() },
  ]

  return (
    <Section icon={Activity} title="Background Job Status Feed" color="bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-200/70 dark:border-violet-900/60" id="jobs">
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {displayJobs.map((job) => <JobFeedItem key={job.id} job={job} />)}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main IngestPage
// ─────────────────────────────────────────────────────────────────────────────
export default function IngestPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1 w-full">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Ingestion & Control Hub</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Ingest campus announcements from Gmail, posters/PDFs, or enter them manually
        </p>
      </div>

      {/* Section 1: Gmail */}
      <GmailSection />

      {/* Section 2: Media Upload */}
      <Section icon={Upload} title="Media Dropzone" color="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/70 dark:border-indigo-900/60" id="upload">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Upload event flyers, posters, or circular PDFs for automatic Gemini extraction.
        </p>
        <UploadDropzone />
        <TextPasteSection />
      </Section>

      {/* Section 3: Manual Creator */}
      <ManualEventForm />

      {/* Section 4: Filter Rules */}
      <FilterRuleManager />

      {/* Section 5: Job Feed */}
      <JobFeed />
    </div>
  )
}
