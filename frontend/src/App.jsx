import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/Navbar.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import TimelinePage from './pages/TimelinePage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import IngestPage from './pages/IngestPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import { useTheme } from './context/ThemeContext.jsx'
import { useAuth } from './context/AuthContext.jsx'

export default function App() {
  const { isDark } = useTheme()
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200">
      {user && <Navbar />}
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route
            path="/"
            element={<LandingPage />}
          />
          <Route
            path="/login"
            element={user ? <Navigate to="/calendar" replace /> : <LoginPage />}
          />
          <Route
            path="/calendar"
            element={user ? <CalendarPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/timeline"
            element={user ? <TimelinePage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/chat"
            element={user ? <ChatPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/ingest"
            element={user ? <IngestPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="*"
            element={<Navigate to={user ? '/calendar' : '/login'} replace />}
          />
        </Routes>
      </main>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: isDark ? '#18181b' : '#ffffff',
            color: isDark ? '#f4f4f5' : '#09090b',
            border: isDark ? '1px solid #27272a' : '1px solid #e4e4e7',
            borderRadius: '14px',
            fontSize: '13.5px',
            fontWeight: '500',
            boxShadow: isDark
              ? '0 8px 24px -4px rgba(0, 0, 0, 0.4), 0 2px 6px -1px rgba(0, 0, 0, 0.2)'
              : '0 8px 24px -4px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)',
            padding: '12px 16px',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: isDark ? '#18181b' : '#ffffff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: isDark ? '#18181b' : '#ffffff' },
          },
        }}
      />
    </div>
  )
}
