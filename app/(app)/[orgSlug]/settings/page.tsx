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
    <div className="flex flex-col h-full overflow-auto">
      {/* Page header */}
      <div className="border-b border-border px-8 py-5 shrink-0">
        <h1 className="text-[20px] font-bold text-foreground">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Manage your workspace and integrations</p>
      </div>

      <div className="p-8 max-w-2xl space-y-5">
        {/* Calendar integrations card */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[15px] font-semibold text-foreground">Calendar Integrations</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Sync tasks to your Google or Microsoft calendar</p>
          </div>
          <div className="px-5 py-4">
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
        </div>
      </div>
    </div>
  )
}
