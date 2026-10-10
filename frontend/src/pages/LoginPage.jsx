import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Terminal, ArrowRight, Sun, Moon, ShieldCheck, Mail, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'

export default function LoginPage() {
  const { user, loginWithGoogle, loginAsDemo } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()

  // Redirect to calendar if already logged in
  useEffect(() => {
    if (user) {
      navigate('/calendar', { replace: true })
    }
  }, [user, navigate])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top minimalistic header with theme switcher */}
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-sm">
            <Calendar size={18} className="stroke-[2.2]" />
          </div>
          <div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-base tracking-tight leading-none block">
              EventHub
            </span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide uppercase block mt-0.5">
              Campus Aggregator
            </span>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:scale-105"
        >
          {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
        </button>
      </header>

      {/* Main Login Card container */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          {/* Hero text */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300/80 dark:border-zinc-700">
              <Sparkles size={13} className="text-amber-500" />
              <span>Smart Event Hub v1.0</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              Welcome to EventHub
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Consolidate campus circulars, placement drives, club meetings, and hackathons in one place.
            </p>
          </div>

          {/* Authentication Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            {/* Student Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Student Sign In
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md font-medium">
                  Official Access
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-normal">
                Sign in with your student Gmail or campus email to automatically import events from your inbox.
              </p>

              {/* Only One Option for Student: Sign in with Gmail */}
              <button
                onClick={loginWithGoogle}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-sm shadow-sm transition-all transform active:scale-[0.99] border border-transparent"
              >
                {/* Google "G" Logo */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Gmail</span>
                <ArrowRight size={14} className="opacity-60 ml-auto" />
              </button>
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center flex items-center justify-center gap-1.5">
                <ShieldCheck size={12} className="text-emerald-500" />
                <span>Read-only Gmail event parsing • Zero credentials stored</span>
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider">
                <span className="bg-white dark:bg-zinc-900 px-3 text-zinc-400 dark:text-zinc-500">
                  Developer & Testing
                </span>
              </div>
            </div>

            {/* Developer Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Developer Sandbox
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md font-mono">
                  1-Click Dev Mode
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-normal">
                Bypass external OAuth for instant local testing of all features, filters, and AI assistant.
              </p>

              {/* Demo Login Button */}
              <button
                onClick={loginAsDemo}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 font-semibold text-xs tracking-wide transition-all border border-zinc-200 dark:border-zinc-700 shadow-sm"
              >
                <Terminal size={14} className="stroke-[2.2] text-zinc-500 dark:text-zinc-400" />
                <span>Continue as Demo Developer</span>
                <ArrowRight size={13} className="opacity-60 ml-auto" />
              </button>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            Smart Event Hub • Privacy-First Architecture
          </p>
        </div>
      </div>
    </div>
  )
}
