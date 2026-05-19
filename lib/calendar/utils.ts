import type { EngineTask } from '@/lib/engine/types'
import type { CalendarEvent } from './types'

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function buildCalendarEvent(task: EngineTask): CalendarEvent {
  const label = task.type === 'fixed' ? 'Fixed task' : 'Fluid task'
  return {
    title: task.name,
    startDate: formatDate(task.start_date),
    endDate: formatDate(task.end_date),
    description: `${task.duration_hours} working hours · ${label}`,
  }
}

export function autoMatchResource(
  userName: string,
  userEmail: string,
  resources: Array<{ id: string; name: string; icon_type: string }>
): string | null {
  const personResources = resources.filter((r) => r.icon_type === 'person')
  const nameLower = userName.toLowerCase()
  const emailPrefix = (userEmail.includes('@') ? userEmail.split('@')[0] : userEmail).toLowerCase()

  const matches = personResources.filter((r) => {
    const rName = r.name.toLowerCase()
    return (
      nameLower.includes(rName) ||
      rName.includes(nameLower) ||
      emailPrefix.includes(rName) ||
      rName.includes(emailPrefix)
    )
  })

  return matches.length === 1 ? matches[0].id : null
}
