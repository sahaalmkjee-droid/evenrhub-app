import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { isThisWeek } from 'date-fns'
import { AlertCircle } from 'lucide-react'
import CalendarGrid from '../components/CalendarGrid.jsx'
import { safeParseDate } from '../utils/date.js'
import DetailedSummaryModal from '../components/DetailedSummaryModal.jsx'
import { eventsApi } from '../api/client.js'
import { CATEGORY_CONFIG } from '../utils/categories.js'

// ── Skeleton ──────────────────────────────────────────────────────────────────
function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-[600px] rounded-2xl" />
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <div className="card p-4 flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-lg`}>
        {icon}
      </div>
    </div>
  )
}

// ── Category Legend ───────────────────────────────────────────────────────────
function CategoryLegend({ categoryCounts }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 mr-1 uppercase tracking-wider">
        Categories:
      </span>
      {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
        const count = categoryCounts[key] || 0
        if (!count) return null
        return (
          <div key={key} className={`badge ${cfg.badge} gap-1.5`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
            <span className="ml-0.5 font-semibold opacity-80">({count})</span>
          </div>
        )
      })}
    </div>
  )
}

export default function CalendarPage() {
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
      // toast is handled in client.js
    } finally {
      setSummaryLoading(false)
    }
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['events'],
    queryFn: () => eventsApi.list({ limit: 500 }),
  })

  const events = Array.isArray(data) ? data : (data?.items || data?.events || [])

  const { upcomingThisWeek, categoryCounts } = useMemo(() => {
    const counts = {}
    let weekCount = 0
    ;(events || []).forEach((ev) => {
      const cat = ev.category?.toLowerCase() || 'other'
      counts[cat] = (counts[cat] || 0) + 1
      const d = safeParseDate(ev.start_time)
      if (d) {
        try {
          if (isThisWeek(d)) weekCount++
        } catch {/* skip */}
      }
    })
    return { upcomingThisWeek: weekCount, categoryCounts: counts }
  }, [events])

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <CalendarSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm max-w-md">
          <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 mx-auto flex items-center justify-center">
            <AlertCircle size={24} />
          </div>
          <p className="text-zinc-800 dark:text-zinc-200 font-bold text-base">Failed to load calendar events</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{error?.message || 'Could not reach backend service'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-5 w-full">
      {/* Top Banner & Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Scheduled"
          value={events.length}
          icon="📅"
          color="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
        />
        <StatCard
          label="This Week"
          value={upcomingThisWeek}
          icon="⚡"
          color="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Hackathons"
          value={categoryCounts.hackathon || 0}
          icon="🚀"
          color="bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"
        />
        <StatCard
          label="Recruitment"
          value={categoryCounts.recruitment || 0}
          icon="💼"
          color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between flex-wrap gap-3 py-1">
        <CategoryLegend categoryCounts={categoryCounts} />
      </div>

      {/* Main Calendar Grid */}
      <div className="flex-1 min-h-[640px]">
        <CalendarGrid events={events} onShowSummary={handleRequestDetailedSummary} />
      </div>

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
