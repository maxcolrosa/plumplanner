'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { generateOrgSlug, validateInviteEmail } from '@/lib/orgs-utils'

// Re-export pure helpers so tests can import from @/actions/orgs
export { generateOrgSlug, validateInviteEmail }

// ── Server Actions ────────────────────────────────────────────

export async function createOrg(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const name = formData.get('name') as string
  if (!name?.trim()) return { error: 'Organisation name is required' }

  let slug = generateOrgSlug(name)
  if (!slug) return { error: 'Organisation name must contain at least one letter or number' }

  const { data: existing } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) slug = `${slug.slice(0, 43)}-${randomBytes(3).toString('hex')}`

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .insert({ name: name.trim(), slug })
    .select()
    .single()

  if (orgError || !org) return { error: orgError?.message ?? 'Failed to create organisation' }

  const { error: memberError } = await supabase
    .from('org_members')
    .insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
      joined_at: new Date().toISOString(),
    })

  if (memberError) {
    await supabase.from('orgs').delete().eq('id', org.id)
    return { error: memberError.message }
  }

  revalidatePath('/app')
  redirect(`/${org.slug}/timeline`)
}

export async function inviteMember(orgId: string, email: string, role: 'admin' | 'member' = 'member') {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (!validateInviteEmail(email)) return { error: 'Invalid email address' }

  const { data: org } = await supabase
    .from('orgs')
    .select('plan_tier')
    .eq('id', orgId)
    .single()

  const { count } = await supabase
    .from('org_members')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .not('joined_at', 'is', null)

  const limits = { starter: 5, team: 15, agency: 25 }
  const limit = limits[org?.plan_tier as keyof typeof limits] ?? 5

  if ((count ?? 0) >= limit) {
    return { error: `Your ${org?.plan_tier} plan supports up to ${limit} members. Upgrade to add more.` }
  }

  const token = randomBytes(32).toString('hex')

  const { error } = await supabase
    .from('org_members')
    .insert({
      org_id: orgId,
      invited_email: email.toLowerCase(),
      invite_token: token,
      role,
    })

  if (error) {
    if (error.code === '23505') return { error: 'This email has already been invited' }
    return { error: error.message }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV] Invite URL: ${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`)
  }

  return { success: true, token }
}

export async function acceptInvite(token: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/sign-up?next=/invite/${token}`)

  const { data: member, error } = await supabase
    .from('org_members')
    .select('id, org_id, joined_at, orgs!inner(slug)')
    .eq('invite_token', token)
    .single()

  if (error || !member) return { error: 'Invalid or expired invite link' }
  if (member.joined_at) return { error: 'This invite has already been used' }

  const slug = (member.orgs as unknown as { slug: string }).slug
  if (!slug) return { error: 'Organisation not found' }

  const { error: updateError } = await supabase
    .from('org_members')
    .update({
      user_id: user.id,
      joined_at: new Date().toISOString(),
      invite_token: null,
    })
    .eq('id', member.id)

  if (updateError) return { error: updateError.message }

  revalidatePath('/app')
  redirect(`/${slug}/timeline`)
}
