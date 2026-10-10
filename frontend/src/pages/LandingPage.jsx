import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'

export default function LandingPage() {
  const { user } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()

  function handleEnter() {
    if (user) {
      navigate('/calendar')
    } else {
      navigate('/login')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200 selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900">
      {/* Top minimal bar without icons */}
      <header className="max-w-5xl mx-auto w-full px-6 py-6 flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div className="flex items-baseline gap-3">
          <span className="font-extrabold tracking-tight text-lg text-zinc-900 dark:text-zinc-100">
            EventHub
          </span>
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            v1.0
          </span>
        </div>

        <button
          onClick={toggleTheme}
          className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm"
        >
          {isDark ? 'Light' : 'Dark'}
        </button>
      </header>

      {/* Main hero area */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 flex flex-col justify-center py-20 sm:py-28">
        <div className="max-w-2xl space-y-8">
          {/* Subtle category tag */}
          <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Campus Intelligence & Scheduling
          </div>

          {/* Primary typography headline */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 leading-[1.08]">
            Every campus event.
            <br />
            Unified quietly.
          </h1>

          {/* Clean secondary prose */}
          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl font-normal">
            Consolidate placement drives, hackathons, workshops, and student circulars from inboxes and notices into a single clean timeline and calendar.
          </p>

          {/* Minimal CTA action */}
          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              onClick={handleEnter}
              className="px-8 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-sm tracking-wide transition-all active:scale-[0.99] shadow-sm"
            >
              Enter EventHub
            </button>
          </div>

          {/* Minimal 3-point feature strip with pure text */}
          <div className="pt-12 border-t border-zinc-200/80 dark:border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                Inbox & Poster Parsing
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                Detects dates, deadlines, and venues directly from announcement bodies.
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                Timeline & Calendar
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                Structured views with zero marketing clutter or social notifications.
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                Natural-Language Assistant
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                Query schedules, filter categories, and verify upcoming events instantly.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="max-w-5xl mx-auto w-full px-6 py-6 border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500 font-mono">
        <span>Smart Event Hub</span>
        <span>Minimalist Architecture</span>
      </footer>
    </div>
  )
}
