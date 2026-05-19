'use client'

import { User, Building2, Wrench } from 'lucide-react'
import { useResourcesStore } from '@/lib/store/resources'
import { ResourceTaskCard } from './resource-task-card'

const ICONS = {
  person: User,
  room: Building2,
  equipment: Wrench,
} as const

interface Props {
  resource: { id: string; name: string; icon_type: string }
}

export function ResourceColumn({ resource }: Props) {
  const tasks = useResourcesStore(s => s.tasks[resource.id] ?? [])
  const fluidTasks = tasks
    .filter(t => t.type === 'fluid')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const fixedTasks = tasks.filter(t => t.type === 'fixed')
  const Icon = ICONS[resource.icon_type as keyof typeof ICONS] ?? User

  return (
    <div
      data-resource-id={resource.id}
      className="flex flex-col w-56 shrink-0 rounded-lg border border-border bg-muted/20 p-3 min-h-48"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm text-foreground truncate">{resource.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{fluidTasks.length}</span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {fluidTasks.map(task => (
          <ResourceTaskCard
            key={task.id}
            task={task}
            fromResourceId={resource.id}
          />
        ))}
      </div>

      {fixedTasks.length > 0 && (
        <>
          <div className="mt-3 mb-1.5 text-xs text-muted-foreground uppercase tracking-wide border-t border-border pt-2">
            Fixed
          </div>
          {fixedTasks.map(task => (
            <div
              key={task.id}
              className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1.5 text-xs text-foreground mb-1"
            >
              🔒 {task.name}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
