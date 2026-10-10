import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Calendar,
  History,
  Compass,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'
import PortraitTimelineCard from './PortraitTimelineCard.jsx'

export default function DeckCarousel({
  events = [],
  onEdit,
  onHide,
  onDelete,
  onShowSummary,
}) {
  // Sort events chronologically descending so that:
  // LEFT side (indices < activeIndex) = FUTURE events
  // RIGHT side (indices > activeIndex) = PAST events
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const timeA = a.start_time ? new Date(a.start_time).getTime() : 0
      const timeB = b.start_time ? new Date(b.start_time).getTime() : 0
      return timeB - timeA // descending: newest/future first -> oldest/past last
    })
  }, [events])

  // Identify index of the "Next Upcoming Event"
  const defaultUpcomingIndex = useMemo(() => {
    if (!sortedEvents.length) return 0
    const now = Date.now()

    // In descending list:
    // Future events have event.start_time >= now.
    // The "closest/earliest upcoming event" is the last future event before we cross into the past!
    let bestIdx = -1
    for (let i = 0; i < sortedEvents.length; i++) {
      const t = sortedEvents[i].start_time ? new Date(sortedEvents[i].start_time).getTime() : 0
      if (t >= now) {
        bestIdx = i // keep updating until the last future one
      }
    }

    if (bestIdx !== -1) return bestIdx

    // If all events are in the past, pick the most recent past event (index 0)
    return 0
  }, [sortedEvents])

  const [activeIndex, setActiveIndex] = useState(defaultUpcomingIndex)
  const containerRef = useRef(null)
  const dragStartX = useRef(null)

  // Sync default upcoming index when events change
  useEffect(() => {
    setActiveIndex(defaultUpcomingIndex)
  }, [defaultUpcomingIndex])

  // Navigation handlers
  const handlePrev = useCallback(() => {
    // Moves towards index - 1 (Left = Future)
    setActiveIndex((prev) => Math.max(0, prev - 1))
  }, [])

  const handleNext = useCallback(() => {
    // Moves towards index + 1 (Right = Past)
    setActiveIndex((prev) => Math.min(sortedEvents.length - 1, prev + 1))
  }, [sortedEvents.length])

  const handleJumpToUpcoming = useCallback(() => {
    setActiveIndex(defaultUpcomingIndex)
  }, [defaultUpcomingIndex])

  // Keyboard navigation with ArrowLeft / ArrowRight
  useEffect(() => {
    function handleKeyDown(e) {
      if (['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase())) {
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePrev, handleNext])

  // Touch / Drag swipe support
  function handleTouchStart(e) {
    dragStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e) {
    if (dragStartX.current === null) return
    const diff = dragStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 45) {
      if (diff > 0) handleNext() // Swiped left -> move to right cards (past)
      else handlePrev() // Swiped right -> move to left cards (future)
    }
    dragStartX.current = null
  }

  function handleMouseDown(e) {
    // Only drag on background or cards (not buttons)
    if (e.target.closest('button') || e.target.closest('input')) return
    dragStartX.current = e.clientX
  }

  function handleMouseUp(e) {
    if (dragStartX.current === null) return
    const diff = dragStartX.current - e.clientX
    if (Math.abs(diff) > 55) {
      if (diff > 0) handleNext()
      else handlePrev()
    }
    dragStartX.current = null
  }

  if (!sortedEvents.length) {
    return null
  }

  const activeEvent = sortedEvents[activeIndex] || sortedEvents[0]
  const isCurrentlyOnUpcoming = activeIndex === defaultUpcomingIndex

  return (
    <div className="w-full flex flex-col items-center select-none py-4">
      {/* ── Top Deck HUD Bar: Relative Indicators & Jump Button ── */}
      <div className="w-full max-w-4xl flex items-center justify-between px-4 mb-6">
        {/* Left Side Tag: Future Events */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={activeIndex === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 dark:text-cyan-400 dark:bg-cyan-950/40 dark:border-cyan-800/60 dark:hover:bg-cyan-900/40 transition disabled:opacity-30 disabled:pointer-events-none"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">FUTURE EVENTS</span>
            <span className="sm:hidden">FUTURE</span>
          </button>
          <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
            {activeIndex} ahead
          </span>
        </div>

        {/* Center: Reset to Next Upcoming */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleJumpToUpcoming}
            className={`
              flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-bold transition-all shadow-sm
              ${isCurrentlyOnUpcoming
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-2 ring-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700/80'
              }
            `}
            title="Focus the nearest upcoming event"
          >
            <Sparkles size={13} className={isCurrentlyOnUpcoming ? 'text-emerald-500 dark:text-emerald-400' : 'text-zinc-400'} />
            <span>Next Upcoming</span>
          </button>
        </div>

        {/* Right Side Tag: Past Events */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
            {sortedEvents.length - 1 - activeIndex} past
          </span>
          <button
            onClick={handleNext}
            disabled={activeIndex === sortedEvents.length - 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-700 bg-zinc-100 border-zinc-200 hover:bg-zinc-200 dark:text-zinc-400 dark:bg-zinc-900/60 dark:border-zinc-800 dark:hover:bg-zinc-800 transition disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="hidden sm:inline">PAST EVENTS</span>
            <span className="sm:hidden">PAST</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* ── 3D Stage Carousel Area ── */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className="relative w-full max-w-6xl h-[530px] sm:h-[560px] flex items-center justify-center overflow-hidden [perspective:1400px]"
      >
        {/* Floating Left Chevron */}
        <button
          onClick={handlePrev}
          disabled={activeIndex === 0}
          aria-label="Previous event (Future)"
          className="absolute left-2 sm:left-4 z-50 p-3.5 rounded-full bg-white/90 hover:bg-white text-zinc-800 hover:text-black border border-zinc-200 shadow-xl dark:bg-black/60 dark:hover:bg-black/90 dark:backdrop-blur-xl dark:border-white/10 dark:text-white/90 dark:hover:text-white transition-all hover:scale-110 active:scale-95 disabled:opacity-20 disabled:pointer-events-none"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Floating Right Chevron */}
        <button
          onClick={handleNext}
          disabled={activeIndex === sortedEvents.length - 1}
          aria-label="Next event (Past)"
          className="absolute right-2 sm:right-4 z-50 p-3.5 rounded-full bg-white/90 hover:bg-white text-zinc-800 hover:text-black border border-zinc-200 shadow-xl dark:bg-black/60 dark:hover:bg-black/90 dark:backdrop-blur-xl dark:border-white/10 dark:text-white/90 dark:hover:text-white transition-all hover:scale-110 active:scale-95 disabled:opacity-20 disabled:pointer-events-none"
        >
          <ChevronRight size={24} />
        </button>

        {/* Cards Stack with Multi-Layer Depth */}
        <div className="relative w-full h-full flex items-center justify-center [transform-style:preserve-3d]">
          {sortedEvents.map((ev, idx) => {
            const offset = idx - activeIndex
            const absOffset = Math.abs(offset)

            // Render window: show up to 5 cards on each side (11 cards visible total)
            if (absOffset > 5) return null

            const isMain = offset === 0
            const isNextUpcoming = idx === defaultUpcomingIndex

            // Progressive depth geometry:
            // - Digressing gaps: 175px -> 120px -> 85px -> 60px -> 45px
            // - Size reduction: 1.0 -> 0.88 -> 0.77 -> 0.67 -> 0.58 -> 0.50
            // - Progressive vertical lowering: 0 -> 20 -> 38 -> 54 -> 68 -> 80
            // - Inward 3D angle: 0 -> 14 -> 21 -> 26 -> 30 -> 33
            const CUMULATIVE_X = [0, 175, 295, 380, 440, 485]
            const Y_OFFSETS = [0, 20, 38, 54, 68, 80]
            const SCALES = [1.0, 0.88, 0.77, 0.67, 0.58, 0.50]
            const ROTATIONS = [0, 14, 21, 26, 30, 33]
            const OPACITIES = [1.0, 0.88, 0.74, 0.56, 0.38, 0.22]

            const dist = Math.min(absOffset, 5)
            const rawX = CUMULATIVE_X[dist]
            const translateX = offset === 0 ? 0 : offset > 0 ? rawX : -rawX
            const translateY = Y_OFFSETS[dist]
            const scale = SCALES[dist]
            const rawRot = ROTATIONS[dist]
            const rotateY = offset === 0 ? 0 : offset > 0 ? -rawRot : rawRot
            const zIndex = 60 - dist * 10
            const opacity = OPACITIES[dist]

            return (
              <div
                key={ev.id || idx}
                style={{
                  transform: `translateX(${translateX}px) translateY(${translateY}px) scale(${scale}) rotateY(${rotateY}deg)`,
                  zIndex,
                  opacity,
                  transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 450ms ease, z-index 450ms ease',
                  pointerEvents: dist > 4 ? 'none' : 'auto',
                }}
                className="absolute will-change-transform"
              >
                <PortraitTimelineCard
                  event={ev}
                  isMain={isMain}
                  isNextUpcoming={isNextUpcoming}
                  onClick={() => setActiveIndex(idx)}
                  onEdit={onEdit}
                  onHide={onHide}
                  onDelete={onDelete}
                  onShowSummary={onShowSummary}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Bottom Scrub Controller & Dot Indicator ── */}
      <div className="w-full max-w-md flex flex-col items-center gap-2.5 mt-2 px-4">
        {/* Dot Strip */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-full overflow-x-auto py-1">
          {sortedEvents.slice(0, 30).map((ev, i) => {
            const isActive = i === activeIndex
            const isUpcoming = i === defaultUpcomingIndex
            return (
              <button
                key={ev.id || i}
                onClick={() => setActiveIndex(i)}
                title={ev.title}
                className={`
                  transition-all duration-300 rounded-full
                  ${isActive
                    ? 'w-7 h-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md'
                    : isUpcoming
                    ? 'w-2.5 h-2.5 bg-emerald-400 ring-2 ring-emerald-500/40'
                    : 'w-2 h-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-500'
                  }
                `}
              />
            )
          })}
          {sortedEvents.length > 30 && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono">+{sortedEvents.length - 30}</span>
          )}
        </div>

        {/* Counter and Keyboard Prompt */}
        <div className="flex items-center justify-between w-full text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-bold">←</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-bold">→</kbd>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Arrow keys or swipe to navigate</span>
          </span>
          <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 font-semibold">
            {activeIndex + 1} / {sortedEvents.length}
          </span>
        </div>
      </div>
    </div>
  )
}
