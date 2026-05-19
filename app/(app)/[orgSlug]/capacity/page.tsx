import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWeekDays, computeWeekCells, computeKPIs, parseWeekParam } from '@/lib/capacity-utils'
import { CapacityView } from '@/components/capacity/capacity-view'
import { KpiCards } from '@/components/capacity/kpi-cards'
import { CapacityHeatmap } from '@/components/capacity/capacity-heatmap'
import type { EngineTask } from '@/lib/engine/types'

export default async function CapacityPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { orgSlug } = await params
  const { week } = await searchParams
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('orgs')
    .select('id, slug')
    .eq('slug', orgSlug)
    .single()
  if (!org) notFound()

  const weekStart = parseWeekParam(week ?? null)
  const weekDays = getWeekDays(weekStart)
  const weekEnd = weekDays[4]

  const [{ data: resources }, { data: taskRows }] = await Promise.all([
    supabase
      .from('resources')
      .select('id, name, icon_type, working_week')
      .eq('org_id', org.id),
    supabase
      .from('tasks')
      .select('id, resource_id, name, type, status, duration_hours, actual_duration_hours, start_date, end_date, position, task_group_id, segment_index, constraints, tags, external_ref, project_id, org_id')
      .eq('org_id', org.id)
      .lte('start_date', weekEnd.toISOString().split('T')[0])
      .gte('end_date', weekStart.toISOString().split('T')[0]),
  ])

  function toDate(s: string): Date {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }

  const tasks = (taskRows ?? []).map(row => ({
    ...row,
    start_date: toDate(row.start_date),
    end_date: toDate(row.end_date),
  })) as EngineTask[]

  const cells = computeWeekCells(weekDays, resources ?? [], tasks)
  const kpis = computeKPIs(cells)

  return (
    <CapacityView weekStart={weekStart} orgSlug={org.slug}>
      <KpiCards kpis={kpis} />
      <CapacityHeatmap weekDays={weekDays} resources={resources ?? []} cells={cells} />
    </CapacityView>
  )
}
