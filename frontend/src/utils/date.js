import { format, parseISO, isValid } from 'date-fns'

/**
 * Safely parse a date string or Date object.
 * Returns null if the value is null, undefined, or invalid without throwing errors.
 */
export function safeParseDate(val) {
  if (!val) return null
  try {
    const d = typeof val === 'string' ? parseISO(val) : new Date(val)
    return isValid(d) ? d : null
  } catch {
    return null
  }
}

/**
 * Safely format a time string or Date object.
 * Returns empty string '' if date is invalid without throwing errors.
 */
export function safeFormatTime(val, fmt = 'h:mm a') {
  const d = safeParseDate(val)
  return d ? format(d, fmt) : ''
}
