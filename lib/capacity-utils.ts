import type { EngineTask } from '@/lib/engine/types'

export type WorkingWeekConfig = {
  mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number
}

export interface CapacityCell {
  resourceId: string
  dayIndex: number        // 0=Mon … 4=Fri
  bookedHours: number
  capacityHours: number
  utilization: number
  overloaded: boolean
  tasks: Array<{ id: string; name: string; hours: number }>
}

export interface CapacityKPIs {
  avgUtilization: number
  overloadedDays: number
  slackHours: number
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    return d
  })
}

export function taskDayContributionHours(task: EngineTask, day: Date): number {
  const dayMs = day.getTime()
  const startMs = task.start_date.getTime()
  const endMs = task.end_date.getTime()
  if (dayMs < startMs || dayMs > endMs) return 0
  const calendarDays = Math.round((endMs - startMs) / 86_400_000) + 1
  return task.duration_hours / calendarDays
}

export function computeWeekCells(
  weekDays: Date[],
  resources: Array<{ id: string; name: string; working_week: WorkingWeekConfig }>,
  tasks: EngineTask[]
): CapacityCell[] {
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
  const cells: CapacityCell[] = []

  for (const [dayIndex, day] of weekDays.entries()) {
    const dayKey = DAY_KEYS[dayIndex]
    for (const resource of resources) {
      const capacityHours = resource.working_week[dayKey] ?? 0
      const resourceTasks = tasks.filter(t => t.resource_id === resource.id)
      const taskContributions = resourceTasks
        .map(t => ({ id: t.id, name: t.name, hours: taskDayContributionHours(t, day) }))
        .filter(t => t.hours > 0)
      const bookedHours = taskContributions.reduce((sum, t) => sum + t.hours, 0)
      const utilization = capacityHours > 0 ? bookedHours / capacityHours : 0
      cells.push({
        resourceId: resource.id,
        dayIndex,
        bookedHours,
        capacityHours,
        utilization,
        overloaded: bookedHours > capacityHours,
        tasks: taskContributions,
      })
    }
  }
  return cells
}

export function computeKPIs(cells: CapacityCell[]): CapacityKPIs {
  const activeCells = cells.filter(c => c.capacityHours > 0)
  const avgUtilization = activeCells.length > 0
    ? activeCells.reduce((sum, c) => sum + c.utilization, 0) / activeCells.length
    : 0
  const overloadedDays = cells.filter(c => c.overloaded).length
  const slackHours = activeCells
    .filter(c => !c.overloaded)
    .reduce((sum, c) => sum + (c.capacityHours - c.bookedHours), 0)
  return { avgUtilization, overloadedDays, slackHours }
}

export function formatWeekParam(weekStart: Date): string {
  const y = weekStart.getUTCFullYear()
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const startOfW1 = new Date(jan4)
  startOfW1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const weekNum = Math.round((weekStart.getTime() - startOfW1.getTime()) / (7 * 86_400_000)) + 1
  return `${y}-W${String(weekNum).padStart(2, '0')}`
}

export function parseWeekParam(param: string | null): Date {
  if (!param) return currentWeekMonday()
  const match = param.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return currentWeekMonday()
  const year = Number(match[1])
  const week = Number(match[2])
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const startOfW1 = new Date(jan4)
  startOfW1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const weekStart = new Date(startOfW1)
  weekStart.setUTCDate(startOfW1.getUTCDate() + (week - 1) * 7)
  return weekStart
}

function currentWeekMonday(): Date {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff))
}
