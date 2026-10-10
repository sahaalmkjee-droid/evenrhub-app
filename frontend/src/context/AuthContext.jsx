import { createContext, useContext, useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import axios from 'axios'

const AuthContext = createContext(null)

const DEMO_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'developer@eventhub.local',
  name: 'Demo Developer',
  role: 'developer',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('eventhub_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  // Listen for Gmail OAuth popup completion
  useEffect(() => {
    function handleMessage(event) {
      if (event.data?.type === 'GMAIL_AUTH_SUCCESS') {
        const studentUser = {
          id: event.data.user_id || '00000000-0000-0000-0000-000000000001',
          email: event.data.email || 'student@gmail.com',
          name: event.data.email?.split('@')[0] || 'Student',
          role: 'student',
        }
        setUser(studentUser)
        localStorage.setItem('eventhub_user', JSON.stringify(studentUser))
        toast.success(`Welcome back, ${studentUser.email}!`)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  function loginAsDemo() {
    setUser(DEMO_USER)
    localStorage.setItem('eventhub_user', JSON.stringify(DEMO_USER))
    toast.success('Signed in as Demo Developer')
  }

  async function loginWithGoogle() {
    try {
      const res = await axios.get('/api/ingest/gmail/auth')
      if (res.data?.auth_url) {
        window.open(res.data.auth_url, '_blank', 'width=520,height=640')
        toast('Complete sign-in in the Google popup window')
      } else {
        toast.error('Failed to get Google sign-in URL')
      }
    } catch (err) {
      toast.error('Could not initiate Google sign-in. Is backend running?')
    }
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('eventhub_user')
    toast('Logged out successfully')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loginAsDemo,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
