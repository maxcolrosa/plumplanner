import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppRedirectPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: member } = await supabase
    .from('org_members')
    .select('orgs(slug)')
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  const slug = (member?.orgs as unknown as { slug: string } | null)?.slug
  if (slug) redirect(`/${slug}/timeline`)
  redirect('/onboarding')
}
