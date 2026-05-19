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
      className="flex flex-col w-56 shrink-0 rounded-xl border border-border bg-card p-3 min-h-[12rem]"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-border">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="font-semibold text-[13px] text-foreground truncate flex-1">{resource.name}</span>
        <span className="text-[10px] font-bold text-plum-accent bg-plum-accent-subtle px-1.5 py-0.5 rounded-[5px]">
          {fluidTasks.length}
        </span>
      </div>

      {/* Fluid tasks */}
      <div className="flex flex-col gap-1.5 flex-1">
        {fluidTasks.map(task => (
          <ResourceTaskCard
            key={task.id}
            task={task}
            fromResourceId={resource.id}
          />
        ))}
        {fluidTasks.length === 0 && (
          <div className="flex-1 flex items-center justify-center border border-dashed border-border rounded-lg min-h-[5rem]">
            <span className="text-[11px] text-muted-foreground">No tasks</span>
          </div>
        )}
      </div>

      {/* Fixed tasks section */}
      {fixedTasks.length > 0 && (
        <>
          <div className="mt-3 mb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-t border-border pt-2.5">
            Fixed
          </div>
          {fixedTasks.map(task => (
            <div
              key={task.id}
              className="rounded-[6px] border border-timeline-fixed-border bg-timeline-fixed/10 px-2 py-1.5 text-[11px] text-timeline-fixed mb-1 flex items-center gap-1.5"
            >
              <span className="text-[10px]">🔒</span>
              <span className="truncate">{task.name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
