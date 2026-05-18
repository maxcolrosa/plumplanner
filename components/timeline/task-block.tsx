'use client'

import { useRef, useState, useEffect } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTimelineStore } from '@/lib/store/timeline'
import { DAY_WIDTH_PX, dateToPixel, pixelToDate, taskWidthPx } from '@/lib/timeline-utils'
import { adjustTask, reorderFluidTask } from '@/actions/schedule'
import type { EngineTask } from '@/lib/engine/types'

interface TaskBlockProps {
  task: EngineTask
  taskAreaRef: React.RefObject<HTMLDivElement | null>
  resourceTasks: EngineTask[]
}

function computeDropPosition(
  dropX: number,
  viewportStart: Date,
  dayWidthPx: number,
  tasks: EngineTask[]
): number {
  const dropDate = pixelToDate(dropX, viewportStart, dayWidthPx)
  return tasks
    .filter((t) => t.type === 'fluid')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .filter((t) => t.end_date < dropDate)
    .length
}

export function TaskBlock({ task, taskAreaRef, resourceTasks }: TaskBlockProps) {
  const viewportStart = useTimelineStore((s) => s.viewportStart)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const violations = useTimelineStore((s) => s.violations)
  const store = useTimelineStore((s) => s)

  const dayWidthPx = DAY_WIDTH_PX[zoomLevel]

  const taskRef = useRef<HTMLDivElement>(null)
  const [shaking, setShaking] = useState(false)
  const [resizeDays, setResizeDays] = useState<number | null>(null)

  // Clear shake animation after 400ms
  useEffect(() => {
    if (!shaking) return
    const timer = setTimeout(() => setShaking(false), 400)
    return () => clearTimeout(timer)
  }, [shaking])

  const rawLeft = dateToPixel(task.start_date, viewportStart, dayWidthPx)
  const rawWidth = Math.max(
    dayWidthPx,
    taskWidthPx(task.start_date, task.end_date, dayWidthPx),
  )

  // Skip rendering if task is entirely before or after the viewport
  const visibleWidth = rawWidth + Math.min(0, rawLeft)
  if (visibleWidth <= 0) return null

  const left = Math.max(0, rawLeft)
  // Use resize preview width if active, otherwise computed width
  const width = resizeDays !== null ? resizeDays * dayWidthPx : visibleWidth

  const hasViolation = violations.some((v) => v.task_id === task.id)
  const isContinuation =
    task.segment_index !== null && task.segment_index > 0

  const baseClasses =
    task.type === 'fixed'
      ? 'bg-timeline-fixed/20 border-2 border-timeline-fixed rounded'
      : 'bg-timeline-fluid/20 border border-timeline-fluid rounded cursor-grab'

  const continuationClasses = isContinuation ? 'border-l-2 border-dashed' : ''

  // ---------------------------------------------------------------------------
  // Drag-to-reorder (fluid tasks only)
  // ---------------------------------------------------------------------------

  async function handleDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { point: { x: number; y: number } }
  ) {
    store.setDragging(null)

    if (!taskAreaRef.current) return

    const areaRect = taskAreaRef.current.getBoundingClientRect()
    const dropX = info.point.x - areaRect.left

    const atPosition = computeDropPosition(dropX, viewportStart, dayWidthPx, resourceTasks)

    // Build optimistic reordered task list
    const fluidTasks = resourceTasks
      .filter((t) => t.type === 'fluid')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    const withoutDragged = fluidTasks.filter((t) => t.id !== task.id)
    const clampedPos = Math.min(atPosition, withoutDragged.length)
    withoutDragged.splice(clampedPos, 0, task)
    const reorderedFluid = withoutDragged.map((t, i) => ({ ...t, position: i }))

    const fixedTasks = resourceTasks.filter((t) => t.type === 'fixed')
    const optimisticTasks = [...fixedTasks, ...reorderedFluid]

    store.beginOptimistic(task.resource_id, optimisticTasks)

    try {
      const result = await reorderFluidTask(task.id, atPosition)
      if ('tasks' in result) {
        store.setTasks(task.resource_id, result.tasks)
        store.commitOptimistic()
      } else {
        store.revertOptimistic()
        setShaking(true)
      }
    } catch {
      store.revertOptimistic()
      setShaking(true)
    }
  }

  // ---------------------------------------------------------------------------
  // Resize handle (all tasks)
  // ---------------------------------------------------------------------------

  function startResize(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()

    if (!taskRef.current) return
    const taskLeft = taskRef.current.getBoundingClientRect().left

    const onMove = (ev: PointerEvent) => {
      const days = Math.max(1, Math.round((ev.clientX - taskLeft) / dayWidthPx))
      setResizeDays(days)
    }

    const onUp = async () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)

      setResizeDays((currentDays) => {
        const finalDays = currentDays ?? Math.max(1, Math.round(width / dayWidthPx))
        // Fire-and-forget async call after clearing preview
        adjustTask(task.id, { duration_hours: finalDays * 8 }).then((result) => {
          if (result && 'tasks' in result) {
            store.setTasks(task.resource_id, result.tasks)
          }
        })
        return null
      })
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const taskContent = (
    <>
      {task.type === 'fixed' && (
        <Lock className="h-3 w-3 shrink-0 mr-0.5 opacity-60" />
      )}
      <span className="overflow-hidden whitespace-nowrap text-ellipsis text-xs px-1 flex-1">
        {task.name}
      </span>
      {hasViolation && (
        <AlertTriangle className="absolute top-0.5 right-0.5 h-3 w-3 text-timeline-violation" />
      )}
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10"
        onPointerDown={startResize}
      />
    </>
  )

  return (
    <div
      ref={taskRef}
      style={{
        left,
        width,
        top: 4,
        height: 'calc(100% - 8px)',
        position: 'absolute',
      }}
      title={task.name}
      className={`${baseClasses} ${continuationClasses} ${shaking ? 'animate-shake' : ''} flex items-center px-1 overflow-hidden select-none`}
    >
      {task.type === 'fluid' ? (
        <motion.div
          drag="x"
          dragConstraints={taskAreaRef as React.RefObject<HTMLElement | null>}
          dragElastic={0.1}
          onDragStart={() => store.setDragging(task.id)}
          onDragEnd={handleDragEnd}
          animate={{ x: 0 }}
          style={{ width: '100%', height: '100%' }}
          className="flex items-center"
        >
          {taskContent}
        </motion.div>
      ) : (
        taskContent
      )}
    </div>
  )
}
