// Clean Minimalist Category & Source styling with Light & Dark Mode support
export const CATEGORY_CONFIG = {
  recruitment: {
    label: 'Recruitment',
    pill: 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    dot: 'bg-blue-600 dark:bg-blue-400',
    border: 'border-blue-100 dark:border-blue-900/40',
    badge: 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    gradient: 'from-blue-600 via-indigo-600 to-sky-700',
    borderGradient: 'from-blue-400 via-indigo-400 to-sky-400',
    glow: 'rgba(59, 130, 246, 0.45)',
    iconBg: 'bg-blue-500/20 text-blue-300',
  },
  hackathon: {
    label: 'Hackathon',
    pill: 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60',
    dot: 'bg-purple-600 dark:bg-purple-400',
    border: 'border-purple-100 dark:border-purple-900/40',
    badge: 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60',
    gradient: 'from-purple-600 via-fuchsia-600 to-indigo-700',
    borderGradient: 'from-purple-400 via-fuchsia-400 to-pink-400',
    glow: 'rgba(168, 85, 247, 0.45)',
    iconBg: 'bg-purple-500/20 text-purple-300',
  },
  workshop: {
    label: 'Workshop',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
    border: 'border-emerald-100 dark:border-emerald-900/40',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    gradient: 'from-emerald-600 via-teal-600 to-green-700',
    borderGradient: 'from-emerald-400 via-teal-400 to-emerald-300',
    glow: 'rgba(16, 185, 129, 0.45)',
    iconBg: 'bg-emerald-500/20 text-emerald-300',
  },
  exam: {
    label: 'Exam',
    pill: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    dot: 'bg-rose-600 dark:bg-rose-400',
    border: 'border-rose-100 dark:border-rose-900/40',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    gradient: 'from-rose-600 via-red-600 to-orange-700',
    borderGradient: 'from-rose-400 via-red-400 to-orange-400',
    glow: 'rgba(244, 63, 94, 0.45)',
    iconBg: 'bg-rose-500/20 text-rose-300',
  },
  club: {
    label: 'Club',
    pill: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    dot: 'bg-amber-600 dark:bg-amber-400',
    border: 'border-amber-100 dark:border-amber-900/40',
    badge: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    gradient: 'from-amber-600 via-orange-600 to-yellow-600',
    borderGradient: 'from-amber-400 via-orange-400 to-yellow-400',
    glow: 'rgba(245, 158, 11, 0.45)',
    iconBg: 'bg-amber-500/20 text-amber-300',
  },
  class: {
    label: 'Class',
    pill: 'bg-cyan-50 text-cyan-700 border-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/60',
    dot: 'bg-cyan-600 dark:bg-cyan-400',
    border: 'border-cyan-100 dark:border-cyan-900/40',
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/60',
    gradient: 'from-cyan-600 via-teal-600 to-sky-700',
    borderGradient: 'from-cyan-400 via-teal-400 to-blue-400',
    glow: 'rgba(6, 182, 212, 0.45)',
    iconBg: 'bg-cyan-500/20 text-cyan-300',
  },
  personal: {
    label: 'Personal',
    pill: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/80 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800/60',
    dot: 'bg-fuchsia-600 dark:bg-fuchsia-400',
    border: 'border-fuchsia-100 dark:border-fuchsia-900/40',
    badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/80 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800/60',
    gradient: 'from-pink-600 via-rose-600 to-purple-700',
    borderGradient: 'from-pink-400 via-rose-400 to-purple-400',
    glow: 'rgba(236, 72, 153, 0.45)',
    iconBg: 'bg-pink-500/20 text-pink-300',
  },
  other: {
    label: 'Other',
    pill: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    dot: 'bg-zinc-500 dark:bg-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-800',
    badge: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    gradient: 'from-zinc-700 via-slate-800 to-zinc-900',
    borderGradient: 'from-zinc-400 via-slate-400 to-zinc-500',
    glow: 'rgba(113, 113, 122, 0.35)',
    iconBg: 'bg-zinc-500/20 text-zinc-300',
  },
}

export const getCategoryConfig = (category) =>
  CATEGORY_CONFIG[category?.toLowerCase()] || CATEGORY_CONFIG.other

export const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIG)

export const SOURCE_CONFIG = {
  email: { label: 'Email', icon: '✉️', badge: 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60' },
  gmail: { label: 'Gmail', icon: '✉️', badge: 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60' },
  poster: { label: 'Poster', icon: '🖼️', badge: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60' },
  image: { label: 'Image', icon: '🖼️', badge: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60' },
  pdf: { label: 'PDF', icon: '📄', badge: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60' },
  manual: { label: 'Manual', icon: '✏️', badge: 'bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60' },
  text: { label: 'Text', icon: '📝', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700' },
}

export const getSourceConfig = (source) =>
  SOURCE_CONFIG[source?.toLowerCase()] || {
    label: source || 'Unknown',
    icon: '📌',
    badge: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  }
