import { describe, it, expect } from 'vitest'
import { hoursToEndDate, endDateToHours, nextWorkingDay } from '@/lib/engine/working-week'
import type { WorkingWeek } from '@/lib/types'

// Fixtures
const MON_FRI: WorkingWeek = {
  mon: 'full',
  tue: 'full',
  wed: 'full',
  thu: 'full',
  fri: 'full',
  sat: 'none',
  sun: 'none',
}

const MIXED: WorkingWeek = {
  mon: 'full',   // 8h
  tue: 'half',   // 4h
  wed: 'none',   // 0h
  thu: 'full',   // 8h
  fri: 'full',   // 8h
  sat: 'none',
  sun: 'none',
}

// Date helpers (all UTC midnight)
const mon  = new Date(Date.UTC(2026, 4, 18)) // 2026-05-18 Monday
const tue  = new Date(Date.UTC(2026, 4, 19)) // 2026-05-19 Tuesday
const wed  = new Date(Date.UTC(2026, 4, 20)) // 2026-05-20 Wednesday
const thu  = new Date(Date.UTC(2026, 4, 21)) // 2026-05-21 Thursday
const fri  = new Date(Date.UTC(2026, 4, 22)) // 2026-05-22 Friday
const sat  = new Date(Date.UTC(2026, 4, 23)) // 2026-05-23 Saturday
const sun  = new Date(Date.UTC(2026, 4, 24)) // 2026-05-24 Sunday
const mon2 = new Date(Date.UTC(2026, 4, 25)) // 2026-05-25 Monday

describe('hoursToEndDate', () => {
  it('8h from Monday (MON_FRI) → ends Monday (exactly fills it)', () => {
    expect(hoursToEndDate(mon, 8, MON_FRI)).toEqual(mon)
  })

  it('16h from Monday (MON_FRI) → ends Tuesday', () => {
    expect(hoursToEndDate(mon, 16, MON_FRI)).toEqual(tue)
  })

  it('24h from Monday (MON_FRI) → ends Wednesday', () => {
    expect(hoursToEndDate(mon, 24, MON_FRI)).toEqual(wed)
  })

  it('12h from Monday with MIXED (mon=8h, tue=4h) → ends Tuesday (8+4=12)', () => {
    expect(hoursToEndDate(mon, 12, MIXED)).toEqual(tue)
  })

  it('9h from Monday with MIXED → ends Tuesday (8h Mon + 1h of Tue capacity)', () => {
    expect(hoursToEndDate(mon, 9, MIXED)).toEqual(tue)
  })

  it('8h from Friday (MON_FRI) → ends Friday', () => {
    expect(hoursToEndDate(fri, 8, MON_FRI)).toEqual(fri)
  })

  it('16h from Friday (MON_FRI) → ends Monday of next week (Fri=8, skip Sat+Sun, Mon=8)', () => {
    expect(hoursToEndDate(fri, 16, MON_FRI)).toEqual(mon2)
  })

  it('0h from Monday → returns Monday (edge case)', () => {
    expect(hoursToEndDate(mon, 0, MON_FRI)).toEqual(mon)
  })
})

describe('endDateToHours', () => {
  it('(Mon, Mon, MON_FRI) → 0 (exclusive end, empty range)', () => {
    expect(endDateToHours(mon, mon, MON_FRI)).toBe(0)
  })

  it('(Mon, Tue, MON_FRI) → 8 (Mon only)', () => {
    expect(endDateToHours(mon, tue, MON_FRI)).toBe(8)
  })

  it('(Mon, Wed, MON_FRI) → 16 (Mon + Tue)', () => {
    expect(endDateToHours(mon, wed, MON_FRI)).toBe(16)
  })

  it('(Mon, Wed, MIXED) → 12 (Mon=8 + Tue=4, Wed excluded)', () => {
    expect(endDateToHours(mon, wed, MIXED)).toBe(12)
  })

  it('startDate > endDate → 0', () => {
    expect(endDateToHours(wed, mon, MON_FRI)).toBe(0)
  })

  it('(Fri, Mon2, MON_FRI) → 8 (Fri=8, Sat=0, Sun=0; Mon2 is exclusive end)', () => {
    expect(endDateToHours(fri, mon2, MON_FRI)).toBe(8)
  })
})

describe('nextWorkingDay', () => {
  it('Monday (MON_FRI) → Monday (same day, it is a working day)', () => {
    expect(nextWorkingDay(mon, MON_FRI)).toEqual(mon)
  })

  it('Saturday (MON_FRI) → Monday (skips Sat + Sun)', () => {
    expect(nextWorkingDay(sat, MON_FRI)).toEqual(mon2)
  })

  it('Sunday (MON_FRI) → Monday (skips Sun)', () => {
    expect(nextWorkingDay(sun, MON_FRI)).toEqual(mon2)
  })

  it('Wednesday (MIXED with wed=none) → Thursday', () => {
    expect(nextWorkingDay(wed, MIXED)).toEqual(thu)
  })
})
