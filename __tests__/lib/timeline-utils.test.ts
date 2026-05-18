import { describe, it, expect } from 'vitest'
import {
  dateToPixel,
  pixelToDate,
  taskWidthPx,
  getVisibleDays,
  formatAxisDate,
  startOfCurrentWeekUTC,
  DAY_WIDTH_PX,
} from '@/lib/timeline-utils'

// Helper to make UTC midnight dates easily
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

describe('dateToPixel', () => {
  it('returns 0 when date equals viewportStart', () => {
    const d = utcDate(2024, 5, 20)
    expect(dateToPixel(d, d, DAY_WIDTH_PX.week)).toBe(0)
  })

  it('returns 140px for 7 days ahead at week zoom (20px/day)', () => {
    const start = utcDate(2024, 5, 20)
    const target = utcDate(2024, 5, 27)
    expect(dateToPixel(target, start, DAY_WIDTH_PX.week)).toBe(140)
  })

  it('returns negative pixels when date is before viewportStart', () => {
    const start = utcDate(2024, 5, 20)
    const before = utcDate(2024, 5, 17)
    expect(dateToPixel(before, start, DAY_WIDTH_PX.week)).toBe(-60) // -3 * 20
  })
})

describe('pixelToDate', () => {
  it('round-trips with dateToPixel for whole-day values', () => {
    const viewportStart = utcDate(2024, 5, 20)
    const original = utcDate(2024, 5, 25) // 5 days ahead
    const px = dateToPixel(original, viewportStart, DAY_WIDTH_PX.week)
    const result = pixelToDate(px, viewportStart, DAY_WIDTH_PX.week)
    expect(result.getTime()).toBe(original.getTime())
  })

  it('round-trips at day zoom', () => {
    const viewportStart = utcDate(2024, 1, 1)
    const original = utcDate(2024, 1, 10)
    const px = dateToPixel(original, viewportStart, DAY_WIDTH_PX.day)
    const result = pixelToDate(px, viewportStart, DAY_WIDTH_PX.day)
    expect(result.getTime()).toBe(original.getTime())
  })

  it('returns UTC midnight date', () => {
    const viewportStart = utcDate(2024, 5, 20)
    const result = pixelToDate(40, viewportStart, DAY_WIDTH_PX.week) // 40/20 = 2 days
    expect(result.getUTCHours()).toBe(0)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
  })
})

describe('taskWidthPx', () => {
  it('returns exactly dayWidthPx for single-day task (start === end)', () => {
    const d = utcDate(2024, 5, 20)
    expect(taskWidthPx(d, d, DAY_WIDTH_PX.week)).toBe(DAY_WIDTH_PX.week)
  })

  it('returns 100px for Mon–Fri at week zoom (5 days × 20px)', () => {
    const mon = utcDate(2024, 5, 20) // Monday
    const fri = utcDate(2024, 5, 24) // Friday
    expect(taskWidthPx(mon, fri, DAY_WIDTH_PX.week)).toBe(100)
  })

  it('returns dayWidthPx for day zoom single-day task', () => {
    const d = utcDate(2024, 6, 1)
    expect(taskWidthPx(d, d, DAY_WIDTH_PX.day)).toBe(DAY_WIDTH_PX.day)
  })
})

describe('getVisibleDays', () => {
  it('returns 7 dates for 140px at week zoom (20px/day)', () => {
    const start = utcDate(2024, 5, 20)
    const days = getVisibleDays(start, 140, DAY_WIDTH_PX.week)
    expect(days).toHaveLength(7)
    expect(days[0].getTime()).toBe(start.getTime())
    expect(days[6].getTime()).toBe(utcDate(2024, 5, 26).getTime())
  })

  it('rounds up (ceil) for partial days', () => {
    const start = utcDate(2024, 5, 20)
    // 141px / 20px = 7.05 → ceil = 8
    const days = getVisibleDays(start, 141, DAY_WIDTH_PX.week)
    expect(days).toHaveLength(8)
  })

  it('each date is UTC midnight', () => {
    const start = utcDate(2024, 1, 1)
    const days = getVisibleDays(start, 100, DAY_WIDTH_PX.week)
    for (const d of days) {
      expect(d.getUTCHours()).toBe(0)
      expect(d.getUTCMinutes()).toBe(0)
    }
  })
})

describe('formatAxisDate', () => {
  // 2024-05-20 is a Monday in week 21
  const monday = utcDate(2024, 5, 20)

  it('day zoom → "Mon 20"', () => {
    expect(formatAxisDate(monday, 'day')).toBe('Mon 20')
  })

  it('week zoom → "W21 May" for 2024-05-20', () => {
    expect(formatAxisDate(monday, 'week')).toBe('W21 May')
  })

  it('month zoom → "May"', () => {
    expect(formatAxisDate(monday, 'month')).toBe('May')
  })

  it('day zoom → "Sat 1" for June 1, 2024', () => {
    const june1 = utcDate(2024, 6, 1) // June 1 2024 is a Saturday
    expect(formatAxisDate(june1, 'day')).toBe('Sat 1')
  })

  it('week zoom → "W53 Jan" for Jan 1 2021 (ISO week 53 of 2020)', () => {
    expect(formatAxisDate(utcDate(2021, 1, 1), 'week')).toBe('W53 Jan')
  })

  it('week zoom → "W1 Dec" for Dec 30 2024 (ISO week 1 of 2025)', () => {
    expect(formatAxisDate(utcDate(2024, 12, 30), 'week')).toBe('W1 Dec')
  })

  it('month zoom → "Jan" for January', () => {
    const jan = utcDate(2024, 1, 15)
    expect(formatAxisDate(jan, 'month')).toBe('Jan')
  })
})

describe('startOfCurrentWeekUTC', () => {
  it('returns a Monday (UTC day 1)', () => {
    const result = startOfCurrentWeekUTC()
    expect(result.getUTCDay()).toBe(1)
  })

  it('returns UTC midnight', () => {
    const result = startOfCurrentWeekUTC()
    expect(result.getUTCHours()).toBe(0)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
    expect(result.getUTCMilliseconds()).toBe(0)
  })

  it('is within 6 days of today UTC', () => {
    const result = startOfCurrentWeekUTC()
    const now = Date.now()
    const diffDays = (now - result.getTime()) / 86_400_000
    expect(diffDays).toBeGreaterThanOrEqual(0)
    expect(diffDays).toBeLessThan(7)
  })
})
