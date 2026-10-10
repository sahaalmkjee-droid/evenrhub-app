import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Bot, ChevronDown, ChevronUp, User, Terminal } from 'lucide-react'

// ── Simple markdown-to-HTML converter ────────────────────────────────────────
function markdownToHtml(text) {
  if (!text) return ''

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-zinc-900 dark:text-zinc-100">$1</strong>')
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded-md font-mono text-xs border border-zinc-200 dark:border-zinc-700">$1</code>')

  // Tables
  const tableRegex = /(\|.+\|\n)((?:\|[-:]+)+\|\n)((?:\|.+\|\n?)+)/gm
  html = html.replace(tableRegex, (match, header, sep, body) => {
    const headerCells = header
      .split('|')
      .slice(1, -1)
      .map((c) => `<th class="px-3.5 py-2 text-left text-xs font-bold text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">${c.trim()}</th>`)
      .join('')
    const rows = body.trim().split('\n').map((row) => {
      const cells = row
        .split('|')
        .slice(1, -1)
        .map((c) => `<td class="px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800">${c.trim()}</td>`)
        .join('')
      return `<tr class="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors">${cells}</tr>`
    }).join('')
    return `<div class="overflow-x-auto my-3"><table class="w-full border-collapse bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm"><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`
  })

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-zinc-700 dark:text-zinc-300 leading-relaxed">$1</li>')
  html = html.replace(/(<li.+<\/li>\n?)+/g, (m) => `<ul class="my-2 space-y-1">${m}</ul>`)

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-zinc-700 dark:text-zinc-300 leading-relaxed">$1</li>')

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 mt-3 mb-1">$1</h1>')

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="border-zinc-200 dark:border-zinc-800 my-3" />')

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="mt-2 text-zinc-700 dark:text-zinc-300 leading-relaxed">')
  html = html.replace(/\n/g, '<br />')

  return `<p class="leading-relaxed text-zinc-700 dark:text-zinc-300">${html}</p>`
}

// ── SQL Accordion ─────────────────────────────────────────────────────────────
function SqlAccordion({ sql }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/70 dark:bg-zinc-800/40 shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-zinc-100/70 dark:hover:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors font-medium"
      >
        <span className="flex items-center gap-1.5">
          <Terminal size={13} className="text-zinc-500 dark:text-zinc-400" /> View Executed SQL Query
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="bg-zinc-950 border-t border-zinc-800">
          <pre className="p-3 text-xs text-emerald-400 overflow-x-auto font-mono leading-relaxed">
            <code>{sql}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Main ChatBubble ───────────────────────────────────────────────────────────
export default function ChatBubble({ message }) {
  const { role, content, sql, timestamp } = message
  const isUser = role === 'user'

  const timeStr = timestamp
    ? format(typeof timestamp === 'string' ? parseISO(timestamp) : new Date(timestamp), 'h:mm a')
    : ''

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs shadow-sm
          ${isUser
            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold'
            : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
          }`}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4.5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm
            ${isUser
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-tr-xs font-normal'
              : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200/90 dark:border-zinc-800 rounded-tl-xs'
            }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div
              className="prose-sm text-zinc-800 dark:text-zinc-200"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
            />
          )}
        </div>

        {/* SQL accordion (assistant only) */}
        {!isUser && sql && <SqlAccordion sql={sql} />}

        {/* Timestamp */}
        {timeStr && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 px-1 font-medium">{timeStr}</span>
        )}
      </div>
    </div>
  )
}
