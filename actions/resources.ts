'use server'

import { createClient } from '@/lib/supabase/server'

const DEFAULT_WORKING_WEEK = {
  mon: 'full',
  tue: 'full',
  wed: 'full',
  thu: 'full',
  fri: 'full',
  sat: 'none',
  sun: 'none',
} as const

export async function createResource(
  orgId: string,
  name: string,
  iconType: 'person' | 'room' | 'equipment'
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()

  if (!member) return { error: 'Not a member of this organisation' }

  const { data: resource, error } = await supabase
    .from('resources')
    .insert({
      org_id: orgId,
      name: name.trim(),
      icon_type: iconType,
      working_week: DEFAULT_WORKING_WEEK,
    })
    .select('id')
    .single()

  if (error || !resource) return { error: error?.message ?? 'Failed to create resource' }

  return { id: resource.id }
}
