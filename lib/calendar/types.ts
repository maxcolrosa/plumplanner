export interface CalendarEvent {
  title: string
  startDate: string  // YYYY-MM-DD (inclusive start)
  endDate: string    // YYYY-MM-DD (inclusive end — providers handle exclusivity internally)
  description: string
}

export type CalendarProvider = 'google_calendar' | 'outlook'
