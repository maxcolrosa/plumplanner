import type { EngineTask } from '@/lib/engine/types'
import type { TaskConstraint, ExternalRef } from '@/lib/types'

export function parseDateStr(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toTask(row: Record<string, unknown>): EngineTask {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    resource_id: row.resource_id as string,
    project_id: (row.project_id as string | null) ?? null,
    name: row.name as string,
    type: row.type as 'fixed' | 'fluid',
    status: row.status as 'pending' | 'in_progress' | 'completed',
    start_date: parseDateStr(row.start_date as string),
    end_date: parseDateStr(row.end_date as string),
    duration_hours: Number(row.duration_hours),
    actual_duration_hours:
      row.actual_duration_hours != null ? Number(row.actual_duration_hours) : null,
    position: (row.position as number | null) ?? null,
    task_group_id: (row.task_group_id as string | null) ?? null,
    segment_index: (row.segment_index as number | null) ?? null,
    constraints: Array.isArray(row.constraints)
      ? (row.constraints as TaskConstraint[])
      : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    external_ref: (row.external_ref as ExternalRef | null) ?? null,
    calendar_sync_enabled: Boolean(row.calendar_sync_enabled ?? false),
  }
}
