import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, Trash2, Sparkles } from 'lucide-react'
import ChatBubble from '../components/ChatBubble.jsx'
import { chatApi } from '../api/client.js'
import toast from 'react-hot-toast'

const SUGGESTION_CHIPS = [
  { label: '🔥 Hackathons this week', message: 'Show hackathons happening this week' },
  { label: '📝 Upcoming exams', message: 'What exams are coming up?' },
  { label: '👁️ Hidden events', message: 'List all hidden events' },
  { label: '🏛️ Auditorium events', message: 'Show events happening in Auditorium' },
]

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 shadow-sm">
        <Sparkles size={14} className="text-zinc-700 dark:text-zinc-300" />
      </div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl rounded-tl-xs px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Welcome state ─────────────────────────────────────────────────────────────
function WelcomeState({ onChipClick }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8 px-4 text-center my-auto py-12">
      <div className="space-y-3">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 shadow-sm">
          <MessageSquare size={26} className="text-zinc-800 dark:text-zinc-200" />
        </div>
        <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Event Hub Assistant</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
          Ask questions in natural language. The assistant queries the database to filter and summarize scheduled campus events.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip.message}
            onClick={() => onChipClick(chip.message)}
            className="
              text-left px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900
              hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all duration-150
              text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white shadow-sm
            "
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)

  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const queryClient = useQueryClient()

  // Load history on mount
  const { data: historyData } = useQuery({
    queryKey: ['chat-history'],
    queryFn: chatApi.getHistory,
    retry: false,
  })

  useEffect(() => {
    const list = Array.isArray(historyData) ? historyData : (historyData?.messages || [])
    if (list.length) {
      setMessages(
        list.map((h) => ({
          id: h.id || Math.random().toString(),
          role: h.role,
          content: h.content || h.message || '',
          sql: h.generated_sql || h.sql || null,
          timestamp: h.created_at || h.timestamp || new Date().toISOString(),
        }))
      )
    }
  }, [historyData])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: (message) => chatApi.sendMessage(message),
    onMutate: (message) => {
      const userMsg = {
        id: Date.now() + '-user',
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsThinking(true)
    },
    onSuccess: (data) => {
      const assistantMsg = {
        id: Date.now() + '-assistant',
        role: 'assistant',
        content: data.response || data.reply || data.message || data.content || 'No response.',
        sql: data.sql,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsThinking(false)
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + '-err',
          role: 'assistant',
          content: '⚠️ Unable to process query. Please check backend connection.',
          timestamp: new Date().toISOString(),
        },
      ])
      setIsThinking(false)
    },
  })

  const clearMutation = useMutation({
    mutationFn: chatApi.clearHistory,
    onSuccess: () => {
      setMessages([])
      queryClient.invalidateQueries({ queryKey: ['chat-history'] })
      toast.success('Conversation history cleared')
    },
  })

  function handleSend() {
    const text = input.trim()
    if (!text || sendMutation.isPending) return
    setInput('')
    sendMutation.mutate(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 min-h-0">
      <div className="flex flex-col flex-1 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-sm font-bold">
              <Sparkles size={14} />
            </div>
            <div>
              <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Event Assistant</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                NL-to-SQL Ready
              </p>
            </div>
          </div>
          {hasMessages && (
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
            >
              <Trash2 size={13} /> Clear
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0 bg-zinc-50/50 dark:bg-zinc-950/40">
          {!hasMessages ? (
            <WelcomeState onChipClick={(msg) => {
              if (!sendMutation.isPending) sendMutation.mutate(msg)
            }} />
          ) : (
            <>
              {messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
              {isThinking && <TypingIndicator />}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Suggestion chips when has messages */}
        {hasMessages && !isThinking && (
          <div className="px-5 py-2 flex flex-wrap gap-2 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
            {SUGGESTION_CHIPS.slice(0, 3).map((chip) => (
              <button
                key={chip.message}
                onClick={() => {
                  if (!sendMutation.isPending) sendMutation.mutate(chip.message)
                }}
                className="text-xs px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors font-medium"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="p-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about events… (e.g. What seminars are scheduled?)"
              rows={1}
              className="
                flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100
                rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2
                focus:ring-zinc-900/10 dark:focus:ring-white/10 focus:border-zinc-700 dark:focus:border-zinc-400
                placeholder-zinc-400 dark:placeholder-zinc-500 text-sm transition-all duration-150 max-h-40 shadow-sm
              "
              style={{ height: 'auto' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              className="
                shrink-0 w-11 h-11 rounded-xl bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200
                text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed
                flex items-center justify-center transition-all duration-150 shadow-sm
              "
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 px-1 text-center sm:text-left">
            Press Enter to query database. Shift+Enter for newline.
          </p>
        </div>
      </div>
    </div>
  )
}
