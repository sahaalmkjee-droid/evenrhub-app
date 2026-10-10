import axios from 'axios'
import toast from 'react-hot-toast'

const PROTOTYPE_USER_ID = '00000000-0000-0000-0000-000000000001'

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request interceptor ───────────────────────────────────────────────────────
client.interceptors.request.use(
  (config) => {
    let userId = PROTOTYPE_USER_ID
    try {
      const stored = localStorage.getItem('eventhub_user')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.id) userId = parsed.id
      }
    } catch {}
    config.headers['X-User-Id'] = userId
    return config
  },
  (error) => Promise.reject(error),
)

// ── Response interceptor ──────────────────────────────────────────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const message =
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      'An unexpected error occurred'

    if (status === 401) {
      toast.error('Session expired. Please reconnect.')
    } else if (status === 403) {
      toast.error('You do not have permission to perform this action.')
    } else if (status === 404) {
      toast.error('Resource not found.')
    } else if (status >= 500) {
      toast.error(`Server error: ${message}`)
    } else if (status !== undefined) {
      toast.error(message)
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Request timed out. Please try again.')
    } else if (!error.response) {
      toast.error('Network error — is the backend running?')
    }

    return Promise.reject(error)
  },
)

// ── Events API ────────────────────────────────────────────────────────────────
export const eventsApi = {
  list: (params = {}) =>
    client.get('/events', { params }).then((r) => {
      const data = r.data
      if (Array.isArray(data)) return data
      if (data && Array.isArray(data.items)) return data.items
      if (data && Array.isArray(data.events)) return data.events
      return []
    }),

  get: (id) =>
    client.get(`/events/${id}`).then((r) => r.data),

  update: (id, data) =>
    client.patch(`/events/${id}`, data).then((r) => r.data),

  toggleHide: (id) =>
    client.post(`/events/${id}/hide`).then((r) => r.data),

  delete: (id) =>
    client.delete(`/events/${id}`).then((r) => r.data),

  calendarMonth: (year, month) =>
    client.get('/events/calendar', { params: { year, month } }).then((r) => r.data),

  exportToGoogleCalendar: (id) =>
    client.post(`/events/${id}/export-calendar`).then((r) => r.data),

  getDetailedSummary: (id) =>
    client.post(`/events/${id}/detailed-summary`).then((r) => r.data),
}

// ── Ingest API ────────────────────────────────────────────────────────────────
export const ingestApi = {
  uploadFile: (file, sourceType = 'auto') => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('source_type', sourceType)
    return client
      .post('/ingest/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  submitText: (text) =>
    client.post('/ingest/text', { text }).then((r) => r.data),

  submitManual: (data) =>
    client.post('/ingest/manual', data).then((r) => r.data),

  getJobStatus: (jobId) =>
    client.get(`/ingest/job/${jobId}`).then((r) => r.data),

  listJobs: () =>
    client.get('/ingest/jobs').then((r) => {
      const data = r.data
      return Array.isArray(data) ? data : []
    }),

  connectGmail: () =>
    client.get('/ingest/gmail/auth').then((r) => r.data),

  syncGmail: (maxResults = 10, force = false) => {
    const formData = new FormData()
    formData.append('max_results', maxResults)
    formData.append('force', force)
    return client.post('/ingest/gmail/sync', formData).then((r) => r.data)
  },

  getGmailStatus: () =>
    client.get('/ingest/gmail/status').then((r) => r.data),
}

// ── Chat API ──────────────────────────────────────────────────────────────────
export const chatApi = {
  sendMessage: (message) =>
    client.post('/chat', { message }).then((r) => r.data),

  getHistory: () =>
    client.get('/chat/history').then((r) => {
      const data = r.data
      if (Array.isArray(data)) return data
      if (data && Array.isArray(data.messages)) return data.messages
      return []
    }),

  clearHistory: () =>
    client.delete('/chat/history').then((r) => r.data),
}

// ── Filters API ───────────────────────────────────────────────────────────────
export const filtersApi = {
  list: () =>
    client.get('/filters').then((r) => {
      const data = r.data
      return Array.isArray(data) ? data : []
    }),

  create: (instruction, category = null) =>
    client.post('/filters', { instruction, category }).then((r) => r.data),

  delete: (id) =>
    client.delete(`/filters/${id}`).then((r) => r.data),
}

export default client
