'use client'

import { Lock } from 'lucide-react'
import { useTimelineStore } from '@/lib/store/timeline'
import { DAY_WIDTH_PX, dateToPixel, taskWidthPx } from '@/lib/timeline-utils'
import type { EngineTask } from '@/lib/engine/types'

interface TaskBlockProps {
  task: EngineTask
}

export function TaskBlock({ task }: TaskBlockProps) {
  const viewportStart = useTimelineStore((s) => s.viewportStart)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const violations = useTimelineStore((s) => s.violations)

  const dayWidthPx = DAY_WIDTH_PX[zoomLevel]

  const left = dateToPixel(task.start_date, viewportStart, dayWidthPx)
  const width = Math.max(
    dayWidthPx,
    taskWidthPx(task.start_date, task.end_date, dayWidthPx),
  )

  const hasViolation = violations.some((v) => v.task_id === task.id)
  const isContinuation =
    task.segment_index !== null && task.segment_index > 0

  const baseClasses =
    task.type === 'fixed'
      ? 'bg-timeline-fixed/20 border-2 border-timeline-fixed rounded'
      : 'bg-timeline-fluid/20 border border-timeline-fluid rounded cursor-grab'

  const continuationClasses = isContinuation ? 'border-l-dashed' : ''

  return (
    <div
      style={{
        left,
        width,
        top: 4,
        height: 'calc(100% - 8px)',
        position: 'absolute',
      }}
      title={task.name}
      className={`${baseClasses} ${continuationClasses} flex items-center px-1 overflow-hidden select-none`}
    >
      {task.type === 'fixed' && (
        <Lock className="h-3 w-3 shrink-0 mr-0.5 opacity-60" />
      )}
      <span className="overflow-hidden whitespace-nowrap text-ellipsis text-xs px-1 flex-1">
        {task.name}
      </span>
      {hasViolation && (
        <span className="absolute top-0.5 right-0.5 text-xs text-timeline-violation">
          ⚠
        </span>
      )}
    </div>
  )
}
