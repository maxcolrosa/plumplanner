'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  insertTask as engineInsertTask,
  deleteTask as engineDeleteTask,
  adjustTask as engineAdjustTask,
} from '@/lib/engine/scheduler'
import { compress as engineCompress } from '@/lib/engine/compress'
import { validateConstraints } from '@/lib/engine/constraints'
import type { EngineTask, EngineResource, TaskInput, ConstraintViolation } from '@/lib/engine/types'
import type { WorkingWeek, TaskConstraint, ExternalRef } from '@/lib/types'

// ---------------------------------------------------------------------------
// Date conversion helpers — module-level sync functions, NOT exported as
// server actions (Next.js requires all exports to be async in 'use server').
// ---------------------------------------------------------------------------

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseDateStr(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toEngineTask(row: Record<string, unknown>): EngineTask {
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
  }
}

function toDbRow(task: EngineTask) {
  return {
    id: task.id,
    org_id: task.org_id,
    resource_id: task.resource_id,
    project_id: task.project_id,
    name: task.name,
    type: task.type,
    status: task.status,
    start_date: toDateStr(task.start_date),
    end_date: toDateStr(task.end_date),
    duration_hours: task.duration_hours,
    actual_duration_hours: task.actual_duration_hours,
    position: task.position,
    task_group_id: task.task_group_id,
    segment_index: task.segment_index,
    // Cast to unknown first to satisfy Supabase's Json type requirement
    constraints: task.constraints as unknown as import('@/lib/types/database').Json,
    tags: task.tags,
    external_ref: task.external_ref as unknown as import('@/lib/types/database').Json | null,
  }
}

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

type ActionResult =
  | { tasks: EngineTask[]; violations: ConstraintViolation[] }
  | { error: string }

export interface InsertTaskInput {
  org_id: string
  resource_id: string
  atPosition: number
  name: string
  type: 'fixed' | 'fluid'
  start_date?: string // YYYY-MM-DD, fixed tasks only
  duration_hours: number
  project_id?: string | null
  constraints?: TaskConstraint[]
  tags?: string[]
  external_ref?: ExternalRef | null
}

export interface AdjustInput {
  start_date?: string // YYYY-MM-DD
  duration_hours?: number
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function fetchResourceAndTasks(
  resourceId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ resource: EngineResource; tasks: EngineTask[]; orgId: string } | null> {
  const { data: resourceRow } = await supabase
    .from('resources')
    .select('id, org_id, working_week')
    .eq('id', resourceId)
    .single()

  if (!resourceRow) return null

  const { data: taskRows } = await supabase
    .from('tasks')
    .select('*')
    .eq('resource_id', resourceId)

  return {
    resource: {
      id: resourceRow.id as string,
      working_week: resourceRow.working_week as WorkingWeek,
    },
    tasks: ((taskRows ?? []) as Record<string, unknown>[]).map(toEngineTask),
    orgId: resourceRow.org_id as string,
  }
}

async function persistAndBroadcast(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  resourceId: string,
  inputTasks: EngineTask[],
  outputTasks: EngineTask[]
): Promise<{ error?: string }> {
  // Diff IDs to find tasks removed by the engine (e.g. re-merged segments)
  const inputIds = new Set(inputTasks.map((t) => t.id))
  const outputIds = new Set(outputTasks.map((t) => t.id))
  const deletedIds = [...inputIds].filter((id) => !outputIds.has(id))

  if (deletedIds.length > 0) {
    const { error } = await admin.from('tasks').delete().in('id', deletedIds)
    if (error) return { error: error.message }
  }

  const upsertRows = outputTasks.map(toDbRow)
  const { error } = await admin.from('tasks').upsert(upsertRows)
  if (error) return { error: error.message }

  // Broadcast after successful persist
  await supabase.channel(`org:${orgId}:schedule`).send({
    type: 'broadcast',
    event: 'schedule:update',
    payload: { resource_id: resourceId, tasks: outputTasks },
  })

  return {}
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export async function insertTask(input: InsertTaskInput): Promise<ActionResult> {
  const supabase = await createClient()
  const admin = createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const fetched = await fetchResourceAndTasks(input.resource_id, supabase)
  if (!fetched) return { error: 'Resource not found' }

  const { resource, tasks, orgId } = fetched

  const taskInput: TaskInput = {
    id: crypto.randomUUID(),
    org_id: input.org_id,
    resource_id: input.resource_id,
    project_id: input.project_id ?? null,
    name: input.name,
    type: input.type,
    duration_hours: input.duration_hours,
    start_date: input.start_date ? parseDateStr(input.start_date) : undefined,
    constraints: input.constraints ?? [],
    tags: input.tags ?? [],
    external_ref: input.external_ref ?? null,
  }

  const now = new Date()
  const result = engineInsertTask(resource, tasks, taskInput, input.atPosition, now)
  const violations = validateConstraints(result)

  const { error } = await persistAndBroadcast(
    admin,
    supabase,
    orgId,
    input.resource_id,
    tasks,
    result
  )
  if (error) return { error }

  revalidatePath('/[orgSlug]/timeline', 'page')
  return { tasks: result, violations }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const admin = createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: taskRow } = await supabase
    .from('tasks')
    .select('resource_id')
    .eq('id', taskId)
    .single()

  if (!taskRow) return { error: 'Task not found' }

  const fetched = await fetchResourceAndTasks(taskRow.resource_id, supabase)
  if (!fetched) return { error: 'Resource not found' }

  const { resource, tasks, orgId } = fetched

  const result = engineDeleteTask(tasks, taskId)
  const violations = validateConstraints(result)

  const { error } = await persistAndBroadcast(
    admin,
    supabase,
    orgId,
    resource.id,
    tasks,
    result
  )
  if (error) return { error }

  revalidatePath('/[orgSlug]/timeline', 'page')
  return { tasks: result, violations }
}

export async function adjustTask(
  taskId: string,
  changes: AdjustInput
): Promise<ActionResult> {
  const supabase = await createClient()
  const admin = createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: taskRow } = await supabase
    .from('tasks')
    .select('resource_id')
    .eq('id', taskId)
    .single()

  if (!taskRow) return { error: 'Task not found' }

  const fetched = await fetchResourceAndTasks(taskRow.resource_id, supabase)
  if (!fetched) return { error: 'Resource not found' }

  const { resource, tasks, orgId } = fetched

  const engineChanges: { start_date?: Date; duration_hours?: number } = {
    duration_hours: changes.duration_hours,
    start_date: changes.start_date ? parseDateStr(changes.start_date) : undefined,
  }

  const now = new Date()
  const result = engineAdjustTask(resource, tasks, taskId, engineChanges, now)
  const violations = validateConstraints(result)

  const { error } = await persistAndBroadcast(
    admin,
    supabase,
    orgId,
    resource.id,
    tasks,
    result
  )
  if (error) return { error }

  revalidatePath('/[orgSlug]/timeline', 'page')
  return { tasks: result, violations }
}

export async function compressResource(
  resourceId: string,
  fromDate: string,
  remerge: boolean
): Promise<ActionResult> {
  const supabase = await createClient()
  const admin = createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const fetched = await fetchResourceAndTasks(resourceId, supabase)
  if (!fetched) return { error: 'Resource not found' }

  const { resource, tasks, orgId } = fetched

  const from = parseDateStr(fromDate)
  const result = engineCompress(resource, tasks, from, remerge)
  const violations = validateConstraints(result)

  const { error } = await persistAndBroadcast(
    admin,
    supabase,
    orgId,
    resourceId,
    tasks,
    result
  )
  if (error) return { error }

  revalidatePath('/[orgSlug]/timeline', 'page')
  return { tasks: result, violations }
}

export async function compressAll(orgId: string, fromDate: string): Promise<ActionResult> {
  const supabase = await createClient()
  const admin = createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: resourceRows } = await supabase
    .from('resources')
    .select('id, working_week')
    .eq('org_id', orgId)

  if (!resourceRows || resourceRows.length === 0) {
    return { error: 'No resources found' }
  }

  const from = parseDateStr(fromDate)
  const allResultTasks: EngineTask[] = []
  const allInputTasks: EngineTask[] = []

  for (const resourceRow of resourceRows as unknown as { id: string; working_week: WorkingWeek }[]) {
    const { data: taskRows } = await supabase
      .from('tasks')
      .select('*')
      .eq('resource_id', resourceRow.id)

    const resource: EngineResource = {
      id: resourceRow.id,
      working_week: resourceRow.working_week,
    }
    const tasks = ((taskRows ?? []) as Record<string, unknown>[]).map(toEngineTask)
    const result = engineCompress(resource, tasks, from, false)

    allInputTasks.push(...tasks)
    allResultTasks.push(...result)
  }

  const violations = validateConstraints(allResultTasks)

  // Persist all changes across resources
  const inputIds = new Set(allInputTasks.map((t) => t.id))
  const outputIds = new Set(allResultTasks.map((t) => t.id))
  const deletedIds = [...inputIds].filter((id) => !outputIds.has(id))

  if (deletedIds.length > 0) {
    const { error } = await admin.from('tasks').delete().in('id', deletedIds)
    if (error) return { error: error.message }
  }

  const { error } = await admin.from('tasks').upsert(allResultTasks.map(toDbRow))
  if (error) return { error: error.message }

  // Broadcast per resource after successful upsert
  for (const resourceRow of resourceRows as unknown as { id: string; working_week: WorkingWeek }[]) {
    const resourceTasks = allResultTasks.filter((t) => t.resource_id === resourceRow.id)
    await supabase.channel(`org:${orgId}:schedule`).send({
      type: 'broadcast',
      event: 'schedule:update',
      payload: { resource_id: resourceRow.id, tasks: resourceTasks },
    })
  }

  revalidatePath('/[orgSlug]/timeline', 'page')
  return { tasks: allResultTasks, violations }
}
