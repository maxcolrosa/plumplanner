import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CalendarSettings } from '@/components/integrations/calendar-settings'

interface Props {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function SettingsPage({ params, searchParams }: Props) {
  const { orgSlug } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: org } = await supabase
    .from('orgs')
    .select('id, name')
    .eq('slug', orgSlug)
    .single()
  if (!org) notFound()
  const orgId = (org as { id: string }).id

  const { data: member } = await supabase
    .from('org_members')
    .select('id, role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()

  if (!member) notFound()

  const memberId = (member as { id: string }).id
  const isAdmin = ['owner', 'admin'].includes((member as { role: string }).role)
  const admin = createServiceClient()

  const { data: tokens } = await admin
    .from('integration_tokens')
    .select('provider')
    .eq('member_id', memberId)

  const connectedProviders = new Set(
    ((tokens ?? []) as { provider: string }[]).map((t) => t.provider)
  )

  const { data: personResources } = await admin
    .from('resources')
    .select('id, name, user_id')
    .eq('org_id', orgId)
    .eq('icon_type', 'person')

  const myResourceId =
    ((personResources ?? []) as { id: string; user_id: string | null }[]).find(
      (r) => r.user_id === user.id
    )?.id ?? null

  const resourceOptions = (personResources ?? []) as { id: string; name: string }[]

  let allResourceLinks: Array<{ resourceId: string; resourceName: string; userEmail: string | null }> = []
  if (isAdmin) {
    const { data: allResources } = await admin
      .from('resources')
      .select('id, name, email, user_id')
      .eq('org_id', orgId)
      .eq('icon_type', 'person')

    allResourceLinks = (allResources ?? []).map(
      (r: { id: string; name: string; email: string | null; user_id: string | null }) => ({
        resourceId: r.id,
        resourceName: r.name,
        userEmail: r.email ?? null,
      })
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">{(org as { name: string }).name}</p>

      {error === 'oauth_failed' && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Calendar connection failed. Please try again.
        </div>
      )}

      <CalendarSettings
        orgId={orgId}
        orgSlug={orgSlug}
        googleConnected={connectedProviders.has('google_calendar')}
        outlookConnected={connectedProviders.has('outlook')}
        myResourceId={myResourceId}
        resources={resourceOptions}
        isAdmin={isAdmin}
        allResourceLinks={allResourceLinks}
      />
    </div>
  )
}
