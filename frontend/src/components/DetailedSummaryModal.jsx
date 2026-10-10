import { useEffect, useState } from 'react'
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  User,
  Copy,
  Check,
  CalendarPlus,
  FileText,
  Printer,
  Mail,
  Loader2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { eventsApi } from '../api/client.js'
import { getCategoryConfig } from '../utils/categories.js'

export default function DetailedSummaryModal({
  isOpen,
  onClose,
  event,
  summaryData,
  isLoading,
}) {
  const [copied, setCopied] = useState(false)
  const [syncingGCal, setSyncingGCal] = useState(false)

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const cfg = event ? getCategoryConfig(event.category) : null

  let startFormatted = null
  let endFormatted = null
  try {
    if (event?.start_time) {
      startFormatted = format(parseISO(event.start_time), 'EEEE, MMMM d, yyyy • h:mm a')
    }
    if (event?.end_time) {
      endFormatted = format(parseISO(event.end_time), 'h:mm a')
    }
  } catch {
    // fallback
  }

  function handleCopy() {
    if (!summaryData?.detailed_summary) return
    navigator.clipboard.writeText(summaryData.detailed_summary)
    setCopied(true)
    toast.success('Summary copied to clipboard!')
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleExportGCal() {
    if (!event?.id) return
    setSyncingGCal(true)
    try {
      const res = await eventsApi.exportToGoogleCalendar(event.id)
      toast.success('Added to Google Calendar!')
      if (res?.html_link) {
        window.open(res.html_link, '_blank')
      }
    } catch {
      // client.js interceptor handles error toast
    } finally {
      setSyncingGCal(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  // Markdown renderer for beautiful headings and paragraphs
  function renderMarkdown(content) {
    if (!content) return null
    const lines = content.split('\n')
    const elements = []
    let currentParagraph = []

    function flushParagraph(key) {
      if (currentParagraph.length > 0) {
        const text = currentParagraph.join(' ')
        elements.push(
          <p key={key} className="text-zinc-700 leading-relaxed text-sm sm:text-base my-2.5">
            {formatInlineText(text)}
          </p>
        )
        currentParagraph = []
      }
    }

    function formatInlineText(text) {
      // Parse **bold**
      const parts = text.split(/(\*\*[^*]+\*\*)/g)
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-bold text-zinc-900">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return part
      })
    }

    lines.forEach((line, idx) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('## ')) {
        flushParagraph(`flush-${idx}`)
        const title = trimmed.replace('## ', '')
        elements.push(
          <div key={`h2-${idx}`} className="mt-7 mb-3 pt-4 border-t border-zinc-200 first:border-t-0 first:pt-0">
            <h2 className="text-lg sm:text-xl font-extrabold text-zinc-900 flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-indigo-600 shrink-0" />
              {title}
            </h2>
          </div>
        )
      } else if (trimmed.startsWith('### ')) {
        flushParagraph(`flush-${idx}`)
        const title = trimmed.replace('### ', '')
        elements.push(
          <h3 key={`h3-${idx}`} className="text-base font-bold text-zinc-800 mt-4 mb-2">
            {title}
          </h3>
        )
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        flushParagraph(`flush-${idx}`)
        const bulletText = trimmed.slice(2)
        elements.push(
          <li key={`li-${idx}`} className="ml-5 text-zinc-700 text-sm sm:text-base leading-relaxed list-disc my-1.5">
            {formatInlineText(bulletText)}
          </li>
        )
      } else if (trimmed === '') {
        flushParagraph(`flush-${idx}`)
      } else {
        currentParagraph.push(trimmed)
      }
    })
    flushParagraph('final')

    return elements
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      {/* 95% Height and Width Container with Bright White UI */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-zinc-200 text-zinc-900"
      >
        {/* ── Modal Header (Sticky) ── */}
        <div className="shrink-0 bg-white border-b border-zinc-200 px-6 sm:px-8 py-5 flex items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Sparkles size={13} className="text-indigo-600" />
                Detailed AI Executive Summary
              </span>
              {event?.category && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700 border border-zinc-200">
                  <span className={`w-2 h-2 rounded-full ${cfg?.dot || 'bg-indigo-600'}`} />
                  {event.category}
                </span>
              )}
              {summaryData?.has_source_email && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Mail size={12} />
                  Sourced from full email body
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-zinc-900 tracking-tight leading-tight">
              {event?.title || 'Event Briefing'}
            </h1>
          </div>

          {/* Close button top-right */}
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors"
            title="Close summary (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Meta Ribbon: Quick Facts ── */}
        <div className="shrink-0 bg-zinc-50 border-b border-zinc-200 px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-3 text-xs sm:text-sm text-zinc-600">
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            {startFormatted && (
              <span className="flex items-center gap-1.5 font-medium text-zinc-800">
                <Clock size={15} className="text-indigo-600 shrink-0" />
                {startFormatted}
                {endFormatted && ` – ${endFormatted}`}
              </span>
            )}
            {event?.venue && (
              <span className="flex items-center gap-1.5 font-medium text-zinc-800">
                <MapPin size={15} className="text-rose-600 shrink-0" />
                {event.venue}
              </span>
            )}
            {event?.organizer && (
              <span className="flex items-center gap-1.5 font-medium text-zinc-800">
                <User size={15} className="text-emerald-600 shrink-0" />
                {event.organizer}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-bold transition shadow-sm"
              title="Copy markdown text"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleExportGCal}
              disabled={syncingGCal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
              title="Add to Google Calendar"
            >
              <CalendarPlus size={14} className={syncingGCal ? 'animate-spin' : ''} />
              <span>Add to Calendar</span>
            </button>
            <button
              onClick={handlePrint}
              className="p-1.5 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-600 hover:text-zinc-900 transition shadow-sm hidden sm:block"
              title="Print summary"
            >
              <Printer size={15} />
            </button>
          </div>
        </div>

        {/* ── Modal Body: Scrollable Reading Area ── */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-10 md:px-14 py-8 bg-white">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-inner">
                  <Sparkles size={28} className="animate-pulse" />
                </div>
                <Loader2
                  size={42}
                  className="animate-spin text-indigo-600 absolute -top-2.5 -left-2.5"
                />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-900">
                  Summarization is happening...
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500 max-w-md">
                  Analyzing the original email announcements, schedule details, and instructions using your on-device SLM model...
                </p>
              </div>
              <div className="w-48 h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-3">
                <div className="w-full h-full bg-gradient-to-r from-indigo-500 to-purple-600 animate-pulse" />
              </div>
            </div>
          ) : summaryData?.detailed_summary ? (
            <div className="max-w-4xl mx-auto prose prose-zinc">
              {renderMarkdown(summaryData.detailed_summary)}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center text-zinc-500">
              <FileText size={40} className="text-zinc-300 mb-2" />
              <p className="text-sm font-semibold text-zinc-700">No detailed summary available</p>
              <p className="text-xs text-zinc-400 mt-1">Please try generating the summary again.</p>
            </div>
          )}
        </div>

        {/* ── Sticky Modal Footer ── */}
        <div className="shrink-0 bg-zinc-50 border-t border-zinc-200 px-6 sm:px-8 py-4 flex items-center justify-between">
          <span className="text-xs text-zinc-500 hidden sm:inline">
            Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-zinc-300 text-zinc-700 font-mono text-[10px]">Esc</kbd> or click outside to dismiss
          </span>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs sm:text-sm transition shadow-md ml-auto"
          >
            Done Reading
          </button>
        </div>
      </div>
    </div>
  )
}
