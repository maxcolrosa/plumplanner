import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/sidebar-nav'
import { QuickAddProvider } from '@/components/ai/quick-add-provider'

interface Props {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const [{ data: org }, { data: { user } }] = await Promise.all([
    supabase
      .from('orgs')
      .select('id, name, slug, stripe_subscription_id')
      .eq('slug', orgSlug)
      .single(),
    supabase.auth.getUser(),
  ])

  if (!org) notFound()
  if (!user) redirect('/sign-in')

  // Subscription gate — skip when already on the subscribe page
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  if (!org.stripe_subscription_id && !pathname.endsWith('/subscribe')) {
    redirect(`/${orgSlug}/subscribe`)
  }

  const userName =
    user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'

  return (
    <div className="flex min-h-screen">
      <SidebarNav
        orgSlug={org.slug}
        orgName={org.name}
        orgId={org.id}
        userId={user?.id ?? ''}
        userName={userName}
      />
      <main className="flex-1 overflow-hidden">
        <QuickAddProvider orgId={org.id} orgSlug={org.slug}>
          {children}
        </QuickAddProvider>
      </main>
    </div>
  )
}
