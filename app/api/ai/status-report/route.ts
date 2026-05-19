// app/api/ai/status-report/route.ts
import { createClient } from '@/lib/supabase/server'
import { streamStatusReport } from '@/lib/ai/status-report'
import type { EngineTask } from '@/lib/engine/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  let orgId: string
  try {
    const body = await request.json()
    orgId = body.orgId
    if (!orgId) throw new Error()
  } catch {
    return new Response('Missing orgId', { status: 400 })
  }

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()
  if (!member) return new Response('Forbidden', { status: 403 })

  const [{ data: taskRows }, { data: resources }] = await Promise.all([
    supabase.from('tasks').select('*').eq('org_id', orgId),
    supabase.from('resources').select('id, name').eq('org_id', orgId),
  ])

  if (!taskRows?.length) {
    return new Response('No tasks scheduled yet.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks: EngineTask[] = taskRows.map((row: any) => ({
    ...row,
    start_date: new Date(row.start_date),
    end_date: new Date(row.end_date),
    constraints: row.constraints ?? [],
    tags: row.tags ?? [],
  }))

  const resourceNames: Record<string, string> = {}
  for (const r of resources ?? []) {
    resourceNames[r.id] = r.name
  }

  const stream = await streamStatusReport(tasks, resourceNames)
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
