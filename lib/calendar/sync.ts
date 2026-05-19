// lib/calendar/sync.ts

import { createServiceClient } from '@/lib/supabase/server'
import { buildCalendarEvent } from './utils'
import * as google from './google'
import * as microsoft from './microsoft'
import type { EngineTask } from '@/lib/engine/types'

interface TokenRow {
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  member_id: string
  org_id: string
}

async function getValidToken(
  admin: ReturnType<typeof createServiceClient>,
  token: TokenRow
): Promise<string> {
  const isExpired =
    !token.expires_at ||
    new Date(token.expires_at).getTime() < Date.now() + 60_000

  if (!isExpired) return token.access_token
  if (!token.refresh_token) throw new Error('No refresh token — cannot refresh')

  const refreshed =
    token.provider === 'google_calendar'
      ? await google.refreshGoogleToken(token.refresh_token)
      : await microsoft.refreshMicrosoftToken(token.refresh_token)

  await admin
    .from('integration_tokens')
    .update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt.toISOString(),
    })
    .eq('member_id', token.member_id)
    .eq('provider', token.provider)
    .eq('org_id', token.org_id)

  return refreshed.accessToken
}

export async function syncTaskToCalendar(
  task: EngineTask & { calendar_sync_enabled?: boolean },
  operation: 'create' | 'update' | 'delete'
): Promise<void> {
  if (!task.calendar_sync_enabled) return

  const admin = createServiceClient()

  // 1. Get resource's linked user
  const { data: resource } = await admin
    .from('resources')
    .select('user_id')
    .eq('id', task.resource_id)
    .single()

  if (!resource?.user_id) return
  const userId = resource.user_id as string

  // 2. Find org_member record (integration_tokens is keyed by member_id)
  const { data: member } = await admin
    .from('org_members')
    .select('id')
    .eq('org_id', task.org_id)
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .single()

  if (!member) return

  // 3. Get all connected calendar tokens for this member
  const { data: tokens } = await admin
    .from('integration_tokens')
    .select('provider, access_token, refresh_token, expires_at, member_id, org_id')
    .eq('member_id', (member as { id: string }).id)

  if (!tokens || tokens.length === 0) return

  const calendarEvent = buildCalendarEvent(task)

  for (const token of tokens as TokenRow[]) {
    if (token.provider !== 'google_calendar' && token.provider !== 'outlook') continue

    let existingEventId: string | null = null
    try {
      const { data: existing } = await admin
        .from('calendar_events')
        .select('event_id')
        .eq('task_id', task.id)
        .eq('provider', token.provider)
        .maybeSingle()
      existingEventId = (existing as { event_id: string } | null)?.event_id ?? null

      const accessToken = await getValidToken(admin, token)

      if (operation === 'create' || (operation === 'update' && !existingEventId)) {
        const eventId =
          token.provider === 'google_calendar'
            ? await google.createEvent(accessToken, calendarEvent)
            : await microsoft.createEvent(accessToken, calendarEvent)

        await admin.from('calendar_events').upsert({
          task_id: task.id,
          user_id: userId,
          provider: token.provider,
          event_id: eventId,
          sync_error: false,
        })
      } else if (operation === 'update' && existingEventId) {
        if (token.provider === 'google_calendar') {
          await google.updateEvent(accessToken, existingEventId, calendarEvent)
        } else {
          await microsoft.updateEvent(accessToken, existingEventId, calendarEvent)
        }
        await admin
          .from('calendar_events')
          .update({ sync_error: false })
          .eq('task_id', task.id)
          .eq('provider', token.provider)
      } else if (operation === 'delete' && existingEventId) {
        if (token.provider === 'google_calendar') {
          await google.deleteEvent(accessToken, existingEventId)
        } else {
          await microsoft.deleteEvent(accessToken, existingEventId)
        }
        await admin
          .from('calendar_events')
          .delete()
          .eq('task_id', task.id)
          .eq('provider', token.provider)
      }
    } catch (err) {
      console.error(`[calendar-sync] ${operation} failed for ${token.provider}:`, err)
      // Best-effort: mark sync_error without blocking the task mutation
      await admin
        .from('calendar_events')
        .upsert({
          task_id: task.id,
          user_id: userId,
          provider: token.provider,
          event_id: existingEventId ?? '',
          sync_error: true,
        })
        .catch(() => {})
    }
  }
}
