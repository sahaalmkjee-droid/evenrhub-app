import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Calendar,
  ListOrdered,
  MessageSquare,
  Upload,
  X,
  Menu,
  Sun,
  Moon,
  LogOut,
  User,
  Terminal,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const NAV_LINKS = [
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/timeline', label: 'Timeline', icon: ListOrdered },
  { to: '/chat', label: 'Assistant', icon: MessageSquare },
  { to: '/ingest', label: 'Ingest Hub', icon: Upload },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isDark, toggleTheme } = useTheme()
  const { user, logout } = useAuth()

  return (
    <header className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <NavLink
            to="/calendar"
            className="flex items-center gap-2.5 group"
            onClick={() => setMobileOpen(false)}
          >
            <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-sm group-hover:scale-105 transition-all">
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
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-1.5 bg-zinc-100/80 dark:bg-zinc-800/80 p-1 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                    isActive
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/80 dark:border-zinc-700'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-zinc-700/50'
                  }`
                }
              >
                <Icon size={14} className="stroke-[2.2]" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Controls: User Info + Dark Mode Toggle + Logout */}
          <div className="hidden sm:flex items-center gap-2.5">
            {/* User Badge */}
            {user && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                {user.role === 'developer' ? (
                  <Terminal size={13} className="text-amber-500 shrink-0" />
                ) : (
                  <User size={13} className="text-emerald-500 shrink-0" />
                )}
                <span className="max-w-[120px] truncate" title={user.email}>
                  {user.email || 'User'}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 font-semibold text-zinc-600 dark:text-zinc-300 uppercase">
                  {user.role === 'developer' ? 'Dev' : 'Student'}
                </span>
              </div>
            )}

            {/* Dark Mode Switcher */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            >
              {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
            </button>

            {/* Logout button */}
            {user && (
              <button
                onClick={logout}
                title="Sign Out"
                className="p-2 rounded-xl text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-rose-200 dark:hover:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 sm:hidden">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
            >
              {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
            </button>
            <button
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 animate-fade-in shadow-lg space-y-3">
          {user && (
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                {user.role === 'developer' ? <Terminal size={14} className="text-amber-500" /> : <User size={14} className="text-emerald-500" />}
                <span className="font-semibold truncate max-w-[180px]">{user.email}</span>
              </div>
              <button
                onClick={() => {
                  setMobileOpen(false)
                  logout()
                }}
                className="text-xs text-rose-500 flex items-center gap-1 font-semibold"
              >
                <LogOut size={13} />
                Logout
              </button>
            </div>
          )}

          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
