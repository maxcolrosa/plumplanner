import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

export default async function TimelinePage({ params }: Props) {
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
  const [{ data: resources }, { data: taskRows }, { data: projects }] = await Promise.all([
    supabase
      .from('resources')
      .select('id, name, icon_type, working_week')
      .eq('org_id', org.id),
    supabase
      .from('tasks')
      .select('*')
      .eq('org_id', org.id),
    supabase
      .from('projects')
      .select('id, name, color')
      .eq('org_id', org.id),
  ])

  // 3. Convert task rows → EngineTask (string dates → Date)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineTasks: EngineTask[] = (taskRows ?? []).map((row: any) => ({
    ...row,
    start_date: toMidnightUTCDate(row.start_date),
    end_date: toMidnightUTCDate(row.end_date),
    constraints: row.constraints ?? [],
    tags: row.tags ?? [],
  }) as EngineTask)

  // 4. Group by resource_id
  const tasksByResource: Record<string, EngineTask[]> = {}
  for (const task of engineTasks) {
    if (!tasksByResource[task.resource_id]) tasksByResource[task.resource_id] = []
    tasksByResource[task.resource_id].push(task)
  }

  const typedResources = (resources ?? []) as unknown as Array<{
    id: string
    name: string
    icon_type: 'person' | 'room' | 'equipment'
    working_week: WorkingWeek
  }>

  const typedProjects = (projects ?? []) as Array<{
    id: string
    name: string
    color: string
  }>

  // 5. TODO (Task 3): Replace stub with:
  // <TimelineView
  //   initialTasks={tasksByResource}
  //   resources={typedResources}
  //   org={org}
  //   projects={typedProjects}
  // />
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <p>Timeline UI coming in Task 3 — {org.name}</p>
      {/* Data ready: {typedResources.length} resources, {engineTasks.length} tasks, {typedProjects.length} projects */}
    </div>
  )
}
