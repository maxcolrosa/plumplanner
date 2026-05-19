import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ResourcesView } from '@/components/resources/resources-view'
import type { EngineTask } from '@/lib/engine/types'
import type { WorkingWeek } from '@/lib/types'

interface Props {
  params: Promise<{ orgSlug: string }>
}

// Local helper — not exported
function toMidnightUTCDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export default async function ResourcesPage({ params }: Props) {
  const { orgSlug } = await params
  const supabase = await createClient()

  // 1. Resolve orgSlug → org
  const { data: org } = await supabase
    .from('orgs')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single()

  if (!org) notFound()

  // 2. Parallel fetch
  const [
    { data: resources, error: resourcesError },
    { data: taskRows, error: tasksError },
  ] = await Promise.all([
    supabase
      .from('resources')
      .select('id, name, icon_type, working_week')
      .eq('org_id', org.id),
    supabase
      .from('tasks')
      .select(
        'id, org_id, resource_id, project_id, name, type, status, start_date, end_date, duration_hours, actual_duration_hours, position, task_group_id, segment_index, constraints, tags, external_ref, created_at, updated_at',
      )
      .eq('org_id', org.id),
  ])

  if (resourcesError || tasksError) {
    throw new Error('Failed to load resources data')
  }

  // 3. Convert task rows → EngineTask (string dates → Date)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineTasks: EngineTask[] = (taskRows ?? []).map((row: any) => ({
    ...row,
    start_date: toMidnightUTCDate(row.start_date),
    end_date: toMidnightUTCDate(row.end_date),
    constraints: row.constraints ?? [],
    tags: row.tags ?? [],
  }) as EngineTask)

  // 4. Group by resource_id (filter out tasks with null resource_id)
  const tasksByResource: Record<string, EngineTask[]> = {}
  for (const task of engineTasks) {
    if (task.resource_id == null) continue // skip orphaned tasks
    if (!tasksByResource[task.resource_id]) tasksByResource[task.resource_id] = []
    tasksByResource[task.resource_id].push(task)
  }

  // 5. Sort tasks by position within each resource
  for (const resourceId of Object.keys(tasksByResource)) {
    tasksByResource[resourceId].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }

  const typedResources = (resources ?? []) as unknown as Array<{
    id: string
    name: string
    icon_type: 'person' | 'room' | 'equipment'
    working_week: WorkingWeek
  }>

  return (
    <ResourcesView
      resources={typedResources}
      initialTasks={tasksByResource}
      orgId={org.id}
    />
  )
}
