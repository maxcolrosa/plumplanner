'use server'

import { createClient } from '@/lib/supabase/server'
import { parseQuickAdd } from '@/lib/ai/quick-add'
import type { ParsedTask } from '@/lib/ai/quick-add'

export async function parseQuickAddAction(
  text: string,
  orgId: string,
): Promise<ParsedTask | { error: string }> {
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

  const { data: resources } = await supabase
    .from('resources')
    .select('id, name')
    .eq('org_id', orgId)

  const today = new Date().toISOString().slice(0, 10)
  return parseQuickAdd(text, resources ?? [], today)
}
