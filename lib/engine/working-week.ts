import { CAPACITY_HOURS } from '@/lib/types'
import type { WorkingWeek } from '@/lib/types'

const DAY_KEYS: (keyof WorkingWeek)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function toMidnightUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function addDays(date: Date, n: number): Date {
  const d = toMidnightUTC(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function capacityForDay(date: Date, ww: WorkingWeek): number {
  return CAPACITY_HOURS[ww[DAY_KEYS[date.getUTCDay()]]]
}

// Returns the calendar date on which the final hour is consumed.
// startDate MUST be a working day (positive capacity). hours === 0 returns startDate.
// IMPORTANT: hoursToEndDate and endDateToHours are NOT inverses because endDateToHours uses exclusive end.
export function hoursToEndDate(startDate: Date, hours: number, ww: WorkingWeek): Date {
  if (hours === 0) return toMidnightUTC(startDate)
  let remaining = hours
  let current = toMidnightUTC(startDate)
  while (true) {
    const cap = capacityForDay(current, ww)
    if (cap > 0) {
      if (cap >= remaining) return current
      remaining -= cap
    }
    current = addDays(current, 1)
  }
}

// Sums working capacity for days in [startDate, endDate) — exclusive end.
// Used for: how many working hours have elapsed from task.start_date up to (not including) `now`.
export function endDateToHours(startDate: Date, endDate: Date, ww: WorkingWeek): number {
  let total = 0
  let current = toMidnightUTC(startDate)
  const end = toMidnightUTC(endDate)
  while (current < end) {
    total += capacityForDay(current, ww)
    current = addDays(current, 1)
  }
  return total
}

// Returns `date` itself if it is a working day (capacity > 0), else advances to the next working day.
export function nextWorkingDay(date: Date, ww: WorkingWeek): Date {
  let current = toMidnightUTC(date)
  while (capacityForDay(current, ww) === 0) {
    current = addDays(current, 1)
  }
  return current
}
