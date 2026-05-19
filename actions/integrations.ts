'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { autoMatchResource } from '@/lib/calendar/utils'

type Provider = 'google_calendar' | 'outlook'

// ---------------------------------------------------------------------------
// OAuth initiation
// ---------------------------------------------------------------------------

export async function initiateCalendarConnect(
  provider: Provider,
  orgSlug: string
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (provider === 'google_calendar') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!)
    url.searchParams.set('redirect_uri', `${baseUrl}/api/integrations/google/callback`)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events')
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', orgSlug)
    return { url: url.toString() }
  }

  // Microsoft
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', process.env.MICROSOFT_CLIENT_ID!)
  url.searchParams.set('redirect_uri', `${baseUrl}/api/integrations/microsoft/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'Calendars.ReadWrite offline_access')
  url.searchParams.set('state', orgSlug)
  return { url: url.toString() }
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export async function disconnectCalendar(
  provider: Provider,
  orgId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()
  if (!member) return { error: 'Not a member of this organisation' }

  const memberId = (member as { id: string }).id

  const { data: token } = await admin
    .from('integration_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('member_id', memberId)
    .eq('provider', provider)
    .single()

  const { data: calEvents } = await admin
    .from('calendar_events')
    .select('event_id, task_id')
    .eq('user_id', user.id)
    .eq('provider', provider)

  if (token && calEvents) {
    const { refreshGoogleToken } = await import('@/lib/calendar/google')
    const { refreshMicrosoftToken, deleteEvent: msDelete } = await import('@/lib/calendar/microsoft')
    const { deleteEvent: gDelete } = await import('@/lib/calendar/google')

    let accessToken = (token as { access_token: string }).access_token
    const tokenRow = token as { access_token: string; refresh_token: string | null; expires_at: string | null }
    const isExpired = tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now() + 60_000
    if (isExpired && tokenRow.refresh_token) {
      try {
        const refreshed = provider === 'google_calendar'
          ? await refreshGoogleToken(tokenRow.refresh_token)
          : await refreshMicrosoftToken(tokenRow.refresh_token)
        accessToken = refreshed.accessToken
      } catch { /* ignore — proceed with potentially stale token */ }
    }

    for (const ev of calEvents as { event_id: string; task_id: string }[]) {
      try {
        if (provider === 'google_calendar') {
          await gDelete(accessToken, ev.event_id)
        } else {
          await msDelete(accessToken, ev.event_id)
        }
      } catch { /* ignore individual failures */ }
    }
  }

  await admin
    .from('calendar_events')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)

  await admin
    .from('integration_tokens')
    .delete()
    .eq('member_id', memberId)
    .eq('provider', provider)

  return {}
}

// ---------------------------------------------------------------------------
// Manual resource assignment override
// ---------------------------------------------------------------------------

export async function matchResource(
  resourceId: string,
  orgId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  const { data: resource } = await supabase
    .from('resources')
    .select('id, org_id, icon_type')
    .eq('id', resourceId)
    .eq('org_id', orgId)
    .single()

  if (!resource) return { error: 'Resource not found' }
  if ((resource as { icon_type: string }).icon_type !== 'person') {
    return { error: 'Only person-type resources can be linked to a user' }
  }

  await admin.from('resources').update({ user_id: null }).eq('user_id', user.id).eq('org_id', orgId)
  await admin.from('resources').update({ user_id: user.id }).eq('id', resourceId)

  return {}
}

// ---------------------------------------------------------------------------
// Per-task calendar toggle
// ---------------------------------------------------------------------------

export async function toggleCalendarSync(
  taskId: string,
  enabled: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  const { data: taskRow } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (!taskRow) return { error: 'Task not found' }

  if (!enabled) {
    const { syncTaskToCalendar: sync } = await import('@/lib/calendar/sync')
    const { toTask } = await import('./schedule-helpers')
    const task = toTask({ ...taskRow, calendar_sync_enabled: true })
    await sync(task, 'delete')
    await admin.from('tasks').update({ calendar_sync_enabled: false }).eq('id', taskId)
    return {}
  }

  await admin.from('tasks').update({ calendar_sync_enabled: true }).eq('id', taskId)
  const { data: updatedRow } = await admin.from('tasks').select('*').eq('id', taskId).single()
  if (!updatedRow) return { error: 'Task not found after update' }

  const { syncTaskToCalendar: sync } = await import('@/lib/calendar/sync')
  const { toTask } = await import('./schedule-helpers')
  const task = toTask(updatedRow as Record<string, unknown>)
  await sync(task, 'create')

  return {}
}

export async function retryCalendarSync(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  await admin
    .from('calendar_events')
    .update({ sync_error: false })
    .eq('task_id', taskId)

  const { data: taskRow } = await admin.from('tasks').select('*').eq('id', taskId).single()
  if (!taskRow) return { error: 'Task not found' }

  const { syncTaskToCalendar: sync } = await import('@/lib/calendar/sync')
  const { toTask } = await import('./schedule-helpers')
  const task = toTask({ ...(taskRow as Record<string, unknown>), calendar_sync_enabled: true })
  await sync(task, 'update')

  return {}
}
