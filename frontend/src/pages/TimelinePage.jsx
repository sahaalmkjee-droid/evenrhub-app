import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { AlertCircle, Layers, List, Sparkles } from 'lucide-react'
import TimelineCard from '../components/TimelineCard.jsx'
import DeckCarousel from '../components/DeckCarousel.jsx'
import DetailedSummaryModal from '../components/DetailedSummaryModal.jsx'
import { eventsApi } from '../api/client.js'
import { CATEGORY_CONFIG } from '../utils/categories.js'
import toast from 'react-hot-toast'

const ALL_FILTER = 'all'

// ── Skeleton Card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card p-5 space-y-3 animate-pulse bg-white dark:bg-zinc-900">
      <div className="flex gap-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="skeleton h-5 w-3/4 rounded-lg" />
      <div className="skeleton h-4 w-1/2 rounded-lg" />
      <div className="skeleton h-4 w-full rounded-lg" />
    </div>
  )
}

// ── Date Section Header ───────────────────────────────────────────────────────
function DateSection({ label }) {
  return (
    <div className="flex items-center gap-3 my-6 first:mt-0">
      <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 shrink-0 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md">
        {label}
      </span>
      <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ category }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 shadow-sm my-4 p-8">
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 flex items-center justify-center text-2xl mb-3">
        📅
      </div>
      <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 mb-1">No events found</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
        {category !== ALL_FILTER
          ? `There are no scheduled events in the ${category} category.`
          : 'Your timeline feed is currently empty. Head over to the Ingestion Hub to import events.'}
      </p>
    </div>
  )
}

// ── Category Filter Pills ─────────────────────────────────────────────────────
function FilterPills({ active, onChange }) {
  const cats = [ALL_FILTER, ...Object.keys(CATEGORY_CONFIG)]
  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      {cats.map((cat) => {
        const cfg = CATEGORY_CONFIG[cat]
        const isActive = active === cat
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`
              px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-150
              ${isActive
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }
            `}
          >
            {cat === ALL_FILTER ? 'All' : cfg?.label || cat}
          </button>
        )
      })}
    </div>
  )
}

// ── Group events by date ──────────────────────────────────────────────────────
function groupByDate(events) {
  const groups = {}
  ;(events || []).forEach((ev) => {
    try {
      const d = parseISO(ev.start_time)
      let label
      if (isToday(d)) label = 'TODAY'
      else if (isTomorrow(d)) label = 'TOMORROW'
      else label = format(d, 'EEEE, MMMM d, yyyy')
      if (!groups[label]) groups[label] = []
      groups[label].push(ev)
    } catch {
      const key = 'UNDATED'
      if (!groups[key]) groups[key] = []
      groups[key].push(ev)
    }
  })
  return groups
}

export default function TimelinePage() {
  const [activeCategory, setActiveCategory] = useState(ALL_FILTER)
  const [viewMode, setViewMode] = useState('deck') // 'deck' (3D 3:4 portrait) | 'feed' (vertical list)
  const queryClient = useQueryClient()

  // Detailed Summary Modal states
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryEvent, setSummaryEvent] = useState(null)
  const [summaryData, setSummaryData] = useState(null)

  async function handleRequestDetailedSummary(event) {
    setSummaryEvent(event)
    setSummaryData(null)
    setSummaryLoading(true)
    setSummaryModalOpen(true)
    try {
      const res = await eventsApi.getDetailedSummary(event.id)
      setSummaryData(res)
    } catch {
      // client.js interceptor toasts errors
    } finally {
      setSummaryLoading(false)
    }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['events', 'timeline'],
    queryFn: () => eventsApi.list({ limit: 500, sort: 'start_time' }),
  })

  const events = Array.isArray(data) ? data : (data?.items || data?.events || [])

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...events].sort((a, b) => {
      if (!a.start_time) return 1
      if (!b.start_time) return -1
      return new Date(a.start_time) - new Date(b.start_time)
    })
    if (activeCategory !== ALL_FILTER) {
      list = list.filter(
        (e) => e.category?.toLowerCase() === activeCategory.toLowerCase()
      )
    }
    return list
  }, [events, activeCategory])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  // ── Mutations ───────────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: ({ id, data }) => eventsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Event updated')
    },
    onError: () => toast.error('Failed to update event'),
  })

  const hideMutation = useMutation({
    mutationFn: (id) => eventsApi.toggleHide(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Visibility toggled')
    },
    onError: () => toast.error('Failed to toggle visibility'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => eventsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Event deleted')
    },
    onError: () => toast.error('Failed to delete event'),
  })

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6 w-full">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Event Timeline
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles size={11} /> 3:4 3D Deck
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Upcoming events front & center • Left: Future • Right: Past
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setViewMode('deck')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'deck'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Layers size={13} />
              <span>3D Deck</span>
            </button>
            <button
              onClick={() => setViewMode('feed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'feed'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <List size={13} />
              <span>List Feed</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="overflow-x-auto pb-1">
        <FilterPills active={activeCategory} onChange={setActiveCategory} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4 max-w-4xl mx-auto w-full">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 shadow-sm max-w-xl mx-auto w-full">
          <AlertCircle size={32} className="text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Failed to load timeline events</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState category={activeCategory} />
      ) : viewMode === 'deck' ? (
        /* ── 3D 3:4 Portrait Deck View ── */
        <DeckCarousel
          events={filtered}
          onEdit={(id, data) => editMutation.mutate({ id, data })}
          onHide={(id) => hideMutation.mutate(id)}
          onDelete={(id) => deleteMutation.mutate(id)}
          onShowSummary={handleRequestDetailedSummary}
        />
      ) : (
        /* ── Classic List Feed View ── */
        <div className="space-y-1 max-w-4xl mx-auto w-full">
          {Object.entries(grouped).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              <DateSection label={dateLabel} />
              <div className="space-y-3">
                {dayEvents.map((event) => (
                  <TimelineCard
                    key={event.id}
                    event={event}
                    onEdit={(id, data) => editMutation.mutate({ id, data })}
                    onHide={(id) => hideMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onShowSummary={handleRequestDetailedSummary}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 95% Sized Detailed Summary Modal (White UI) ── */}
      <DetailedSummaryModal
        isOpen={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
        event={summaryEvent}
        summaryData={summaryData}
        isLoading={summaryLoading}
      />
    </div>
  )
}
