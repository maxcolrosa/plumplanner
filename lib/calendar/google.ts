import type { CalendarEvent } from './types'

const EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const TOKEN_API = 'https://oauth2.googleapis.com/token'

function requiredEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

// Google all-day events need exclusive end date (last day + 1)
function exclusiveEnd(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

export async function refreshGoogleToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

export async function createEvent(
  accessToken: string,
  event: CalendarEvent
): Promise<string> {
  const res = await fetch(EVENTS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.title,
      description: event.description,
      start: { date: event.startDate },
      end: { date: exclusiveEnd(event.endDate) },
    }),
  })
  if (!res.ok) throw new Error(`Google createEvent failed: ${res.status}`)
  const data = (await res.json()) as { id: string }
  return data.id
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEvent
): Promise<void> {
  const res = await fetch(`${EVENTS_API}/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.title,
      description: event.description,
      start: { date: event.startDate },
      end: { date: exclusiveEnd(event.endDate) },
    }),
  })
  if (!res.ok) throw new Error(`Google updateEvent failed: ${res.status}`)
}

export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${EVENTS_API}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404)
    throw new Error(`Google deleteEvent failed: ${res.status}`)
}
