export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Relative time like "just now", "5m ago", "3h ago", "yesterday", "Mar 4". */
export function relativeTime(ts: number, now: number = Date.now()): string {
  if (!ts) return ''
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Human total like "12m 23s" or "1h 4m". */
export function formatTotal(sec: number): string {
  const total = Math.floor(sec)
  if (!Number.isFinite(total) || total <= 0) return '0m'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}
