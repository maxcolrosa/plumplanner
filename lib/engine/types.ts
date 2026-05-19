import type { WorkingWeek, TaskConstraint, ExternalRef } from '@/lib/types'

export interface EngineResource {
  id: string
  working_week: WorkingWeek
}

export interface EngineTask {
  id: string
  org_id: string
  resource_id: string
  project_id: string | null
  name: string
  type: 'fixed' | 'fluid'
  status: 'pending' | 'in_progress' | 'completed'
  start_date: Date
  end_date: Date
  duration_hours: number
  actual_duration_hours: number | null
  position: number | null        // null for fixed tasks
  task_group_id: string | null   // links split segments
  segment_index: number | null   // 0 = original, 1+ = continuation
  constraints: TaskConstraint[]
  tags: string[]
  external_ref: ExternalRef | null
  calendar_sync_enabled?: boolean   // ADD THIS LINE
}

export interface TaskInput {
  id: string                     // pre-generated UUID (caller's responsibility)
  org_id: string
  resource_id: string
  project_id?: string | null
  name: string
  type: 'fixed' | 'fluid'
  start_date?: Date              // fixed tasks only
  duration_hours: number
  constraints?: TaskConstraint[]
  tags?: string[]
  external_ref?: ExternalRef | null
}

export interface ConstraintViolation {
  task_id: string
  constraint_type: 'not_before_date' | 'not_before_task' | 'not_after_date'
  message: string
}
