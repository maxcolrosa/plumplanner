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

  const { data: org } = await supabase
    .from('orgs')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single()

  if (!org) notFound()

  return (
    <div className="flex min-h-screen">
      <SidebarNav orgSlug={org.slug} orgName={org.name} />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
