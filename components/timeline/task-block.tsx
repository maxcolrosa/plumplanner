'use client'

import { Lock, AlertTriangle } from 'lucide-react'
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

  const rawLeft = dateToPixel(task.start_date, viewportStart, dayWidthPx)
  const rawWidth = Math.max(
    dayWidthPx,
    taskWidthPx(task.start_date, task.end_date, dayWidthPx),
  )

  // Skip rendering if task is entirely before or after the viewport
  const visibleWidth = rawWidth + Math.min(0, rawLeft) // shrinks width when rawLeft < 0
  if (visibleWidth <= 0) return null

  const left = Math.max(0, rawLeft)
  const width = visibleWidth

  const hasViolation = violations.some((v) => v.task_id === task.id)
  const isContinuation =
    task.segment_index !== null && task.segment_index > 0

  const baseClasses =
    task.type === 'fixed'
      ? 'bg-timeline-fixed/20 border-2 border-timeline-fixed rounded'
      : 'bg-timeline-fluid/20 border border-timeline-fluid rounded cursor-grab'

  // border-l-dashed is not a valid Tailwind class; use border-l-2 border-dashed instead
  const continuationClasses = isContinuation ? 'border-l-2 border-dashed' : ''

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
        <AlertTriangle className="absolute top-0.5 right-0.5 h-3 w-3 text-timeline-violation" />
      )}
    </div>
  )
}
