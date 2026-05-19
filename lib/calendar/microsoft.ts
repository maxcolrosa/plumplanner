import type { CalendarEvent } from './types'

const EVENTS_API = 'https://graph.microsoft.com/v1.0/me/events'

function requiredEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

function tokenUrl(): string {
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
}

export async function refreshMicrosoftToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnv('MICROSOFT_CLIENT_ID'),
      client_secret: requiredEnv('MICROSOFT_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'Calendars.ReadWrite offline_access',
    }),
  })
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

function graphBody(event: CalendarEvent) {
  return {
    subject: event.title,
    body: { contentType: 'Text', content: event.description },
    start: { dateTime: `${event.startDate}T00:00:00`, timeZone: 'UTC' },
    end: { dateTime: `${event.endDate}T23:59:59`, timeZone: 'UTC' },
    isAllDay: true,
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
    body: JSON.stringify(graphBody(event)),
  })
  if (!res.ok) throw new Error(`Microsoft createEvent failed: ${res.status}`)
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
    body: JSON.stringify(graphBody(event)),
  })
  if (!res.ok) throw new Error(`Microsoft updateEvent failed: ${res.status}`)
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
    throw new Error(`Microsoft deleteEvent failed: ${res.status}`)
}
