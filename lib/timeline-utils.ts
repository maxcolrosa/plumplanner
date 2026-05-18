export type ZoomLevel = 'day' | 'week' | 'month'

export const DAY_WIDTH_PX: Record<ZoomLevel, number> = {
  day: 80,
  week: 20,
  month: 5,
}

export const VISIBLE_DAY_COUNT: Record<ZoomLevel, number> = {
  day: 60,
  week: 84,
  month: 180,
}

export const RESOURCE_COL_WIDTH = 192

/**
 * Add `days` days to a UTC date without local-time drift.
 */
export function addUTCDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

// All math uses UTC exclusively — no local-time conversions anywhere

/**
 * Convert a date to a pixel offset from the viewport start.
 */
export function dateToPixel(
  date: Date,
  viewportStart: Date,
  dayWidthPx: number,
): number {
  return (
    Math.round((date.getTime() - viewportStart.getTime()) / 86_400_000) *
    dayWidthPx
  )
}

/**
 * Convert a pixel offset back to a UTC-midnight Date.
 */
export function pixelToDate(
  px: number,
  viewportStart: Date,
  dayWidthPx: number,
): Date {
  return new Date(
    viewportStart.getTime() + Math.floor(px / dayWidthPx) * 86_400_000,
  )
}

/**
 * Returns an array of UTC-midnight Dates covering the visible viewport.
 */
export function getVisibleDays(
  viewportStart: Date,
  totalWidthPx: number,
  dayWidthPx: number,
): Date[] {
  const count = Math.ceil(totalWidthPx / dayWidthPx)
  const days: Date[] = []
  for (let i = 0; i < count; i++) {
    days.push(new Date(viewportStart.getTime() + i * 86_400_000))
  }
  return days
}

/**
 * Width in pixels for a task spanning startDate..endDate (inclusive).
 */
export function taskWidthPx(
  startDate: Date,
  endDate: Date,
  dayWidthPx: number,
): number {
  const diff = (endDate.getTime() - startDate.getTime()) / 86_400_000
  return (diff + 1) * dayWidthPx
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Format a date for the timeline axis at the given zoom level.
 * day   → 'Mon 18'
 * week  → 'W21 May'
 * month → 'May'
 */
export function formatAxisDate(date: Date, zoom: ZoomLevel): string {
  if (zoom === 'day') {
    const dayName = SHORT_DAYS[date.getUTCDay()]
    const dayNum = date.getUTCDate()
    return `${dayName} ${dayNum}`
  }

  if (zoom === 'month') {
    return SHORT_MONTHS[date.getUTCMonth()]
  }

  // week zoom → ISO week number + short month
  const month = SHORT_MONTHS[date.getUTCMonth()]
  const isoWeek = getISOWeekUTC(date)
  return `W${isoWeek} ${month}`
}

/**
 * ISO week number using UTC date math only.
 * Uses the canonical Thursday-of-the-week algorithm: find Thursday of the
 * same ISO week; that Thursday's year determines the week year.
 * Correctly handles year-boundary dates (e.g. Jan 1 2021 → W53, Dec 30 2024 → W1).
 */
function getISOWeekUTC(date: Date): number {
  // Find Thursday of the same ISO week; that Thursday's year determines the week year.
  const thursday = new Date(date)
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/**
 * Returns the Monday of the current UTC week at UTC midnight.
 */
export function startOfCurrentWeekUTC(): Date {
  const now = new Date()
  const utcDay = now.getUTCDay() // 0=Sun, 1=Mon, … 6=Sat
  const daysBack = utcDay === 0 ? 6 : utcDay - 1
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysBack,
    ),
  )
}
