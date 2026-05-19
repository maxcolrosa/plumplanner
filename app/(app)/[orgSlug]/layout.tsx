import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/sidebar-nav'

interface Props {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const [{ data: org }, { data: { user } }] = await Promise.all([
    supabase.from('orgs').select('id, name, slug').eq('slug', orgSlug).single(),
    supabase.auth.getUser(),
  ])

  if (!org) notFound()

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
        {children}
      </main>
    </div>
  )
}
