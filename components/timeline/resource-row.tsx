'use client'

import { useRef } from 'react'
import { User, Building2, Wrench } from 'lucide-react'
import { useTimelineStore } from '@/lib/store/timeline'
import { TaskBlock } from './task-block'
import type { EngineTask } from '@/lib/engine/types'

const EMPTY_TASKS: EngineTask[] = []

interface ResourceRowProps {
  resource: {
    id: string
    name: string
    icon_type: 'person' | 'room' | 'equipment'
    user_id: string | null
  }
}

const ICON_MAP = {
  person: User,
  room: Building2,
  equipment: Wrench,
} as const

export function ResourceRow({ resource }: ResourceRowProps) {
  const tasks = useTimelineStore((s) => s.tasks[resource.id] ?? EMPTY_TASKS)
  const connectedUserIds = useTimelineStore((s) => s.connectedUserIds)
  const taskAreaRef = useRef<HTMLDivElement>(null)

  const calendarAvailable = resource.user_id != null && connectedUserIds.has(resource.user_id)

  const Icon = ICON_MAP[resource.icon_type]

  return (
    <div className="flex border-b">
      {/* Resource name column — sticky left */}
      <div className="w-48 shrink-0 sticky left-0 z-20 bg-background flex items-center gap-2 px-3 text-sm font-medium h-16 border-r">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{resource.name}</span>
      </div>

      {/* Task area */}
      <div ref={taskAreaRef} className="relative h-16 flex-1 overflow-visible">
        {tasks.map((task) => (
          <TaskBlock
            key={task.id}
            task={task}
            taskAreaRef={taskAreaRef}
            resourceTasks={tasks}
            calendarAvailable={calendarAvailable}
          />
        ))}
      </div>
    </div>
  )
}
