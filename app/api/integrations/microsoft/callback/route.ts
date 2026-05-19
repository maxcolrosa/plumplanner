import { createClient, createServiceClient } from '@/lib/supabase/server'
import { autoMatchResource } from '@/lib/calendar/utils'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const orgSlug = searchParams.get('state')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (!code || !orgSlug) {
    return Response.redirect(`${baseUrl}/`)
  }

  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: `${baseUrl}/api/integrations/microsoft/callback`,
        grant_type: 'authorization_code',
        scope: 'Calendars.ReadWrite offline_access',
      }),
    }
  )

  if (!tokenRes.ok) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=oauth_failed`)
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.redirect(`${baseUrl}/sign-in`)
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=org_not_found`)
  }
  const orgId = (org as { id: string }).id

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()

  if (!member) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=not_member`)
  }
  const memberId = (member as { id: string }).id

  const admin = createServiceClient()

  await admin.from('integration_tokens').upsert(
    {
      org_id: orgId,
      member_id: memberId,
      provider: 'outlook',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    },
    { onConflict: 'org_id,member_id,provider' }
  )

  const { data: resources } = await admin
    .from('resources')
    .select('id, name, icon_type')
    .eq('org_id', orgId)
    .is('user_id', null)

  const userName: string =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? ''
  const userEmail = user.email ?? ''
  const matchedId = autoMatchResource(userName, userEmail, (resources ?? []) as Array<{ id: string; name: string; icon_type: string }>)

  if (matchedId) {
    await admin.from('resources').update({ user_id: user.id }).eq('id', matchedId)
  }

  return Response.redirect(`${baseUrl}/${orgSlug}/settings`)
}
