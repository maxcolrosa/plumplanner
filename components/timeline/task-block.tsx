'use client'

import { useRef, useState, useEffect } from 'react'
import { Lock, AlertTriangle, CalendarX } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTimelineStore } from '@/lib/store/timeline'
import { DAY_WIDTH_PX, dateToPixel, pixelToDate, taskWidthPx } from '@/lib/timeline-utils'
import { adjustTask, reorderFluidTask } from '@/actions/schedule'
import type { EngineTask } from '@/lib/engine/types'
import { TaskContextMenu } from './task-context-menu'

interface TaskBlockProps {
  task: EngineTask
  taskAreaRef: React.RefObject<HTMLDivElement | null>
  resourceTasks: EngineTask[]
  calendarAvailable: boolean
}

function computeDropPosition(
  dropX: number,
  viewportStart: Date,
  dayWidthPx: number,
  tasks: EngineTask[],
  excludeId: string
): number {
  const dropDate = pixelToDate(dropX, viewportStart, dayWidthPx)
  return tasks
    .filter((t) => t.type === 'fluid' && t.id !== excludeId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .filter((t) => t.end_date < dropDate)
    .length
}

export function TaskBlock({ task, taskAreaRef, resourceTasks, calendarAvailable }: TaskBlockProps) {
  const viewportStart = useTimelineStore((s) => s.viewportStart)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const violations = useTimelineStore((s) => s.violations)
  const setDragging = useTimelineStore((s) => s.setDragging)
  const beginOptimistic = useTimelineStore((s) => s.beginOptimistic)
  const commitOptimistic = useTimelineStore((s) => s.commitOptimistic)
  const revertOptimistic = useTimelineStore((s) => s.revertOptimistic)
  const setTasks = useTimelineStore((s) => s.setTasks)
  const setViolations = useTimelineStore((s) => s.setViolations)
  const taskSyncErrors = useTimelineStore((s) => s.taskSyncErrors)
  const hasSyncError = taskSyncErrors.has(task.id)

  const dayWidthPx = DAY_WIDTH_PX[zoomLevel]

  const taskRef = useRef<HTMLDivElement>(null)
  const resizeDaysRef = useRef<number | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const inflightRef = useRef(false)
  const isInteractingRef = useRef(false)
  const [shaking, setShaking] = useState(false)
  const [resizeDays, setResizeDays] = useState<number | null>(null)

  // Clean up resize listeners if component unmounts during an active resize
  useEffect(() => {
    return () => { resizeCleanupRef.current?.() }
  }, [])

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
    setDragging(null)

    if (!taskAreaRef.current) return

    const areaRect = taskAreaRef.current.getBoundingClientRect()
    const dropX = info.point.x - areaRect.left

    const atPosition = computeDropPosition(dropX, viewportStart, dayWidthPx, resourceTasks, task.id)

    // In-flight gate: prevent concurrent rapid drags from corrupting the snapshot
    if (inflightRef.current) return
    inflightRef.current = true

    // Interaction mutex: prevent simultaneous drag + resize from corrupting store state
    if (isInteractingRef.current) {
      inflightRef.current = false
      return
    }
    isInteractingRef.current = true

    // Build optimistic reordered task list
    const fluidTasks = resourceTasks
      .filter((t) => t.type === 'fluid')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    const withoutDragged = fluidTasks.filter((t) => t.id !== task.id)

    // Guard against stale resourceTasks — if dragged task not found, bail out
    const dragged = fluidTasks.find((t) => t.id === task.id)
    if (!dragged) {
      inflightRef.current = false
      isInteractingRef.current = false
      return
    }

    const clampedPos = Math.min(atPosition, withoutDragged.length)
    withoutDragged.splice(clampedPos, 0, task)
    const reorderedFluid = withoutDragged.map((t, i) => ({ ...t, position: i }))

    const fixedTasks = resourceTasks.filter((t) => t.type === 'fixed')
    const optimisticTasks = [...fixedTasks, ...reorderedFluid]

    beginOptimistic(task.resource_id, optimisticTasks)

    try {
      const result = await reorderFluidTask(task.id, atPosition)
      if ('tasks' in result) {
        setTasks(task.resource_id, result.tasks)
        setViolations(result.violations)
        commitOptimistic()
      } else {
        revertOptimistic()
        setShaking(true)
      }
    } catch {
      revertOptimistic()
      setShaking(true)
    } finally {
      inflightRef.current = false
      isInteractingRef.current = false
    }
  }

  // ---------------------------------------------------------------------------
  // Resize handle (all tasks)
  // ---------------------------------------------------------------------------

  function startResize(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()

    // Interaction mutex: prevent simultaneous drag + resize from corrupting store state
    if (isInteractingRef.current) return
    isInteractingRef.current = true

    if (!taskRef.current) {
      isInteractingRef.current = false
      return
    }
    const taskLeft = taskRef.current.getBoundingClientRect().left

    const onMove = (ev: PointerEvent) => {
      const days = Math.max(1, Math.round((ev.clientX - taskLeft) / dayWidthPx))
      resizeDaysRef.current = days
      setResizeDays(days)
    }

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      resizeCleanupRef.current = null
    }
    resizeCleanupRef.current = cleanup

    const onUp = async () => {
      cleanup()

      const finalDays = resizeDaysRef.current ?? Math.max(1, Math.round(width / dayWidthPx))
      resizeDaysRef.current = null

      try {
        const result = await adjustTask(task.id, { duration_hours: finalDays * 8 })
        if (result && 'tasks' in result) {
          setTasks(task.resource_id, result.tasks)
        } else {
          setShaking(true)
        }
      } catch {
        setShaking(true)
      } finally {
        setResizeDays(null)
        isInteractingRef.current = false
      }
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
        <AlertTriangle className={`absolute top-0.5 h-3 w-3 text-timeline-violation ${hasSyncError ? 'right-11' : 'right-8'}`} />
      )}
      {hasSyncError && (
        <CalendarX className="absolute top-0.5 right-8 h-3 w-3 text-amber-500" />
      )}
      <TaskContextMenu
        taskId={task.id}
        resourceId={task.resource_id}
        calendarSyncEnabled={task.calendar_sync_enabled ?? false}
        calendarAvailable={calendarAvailable}
        hasSyncError={hasSyncError}
      />
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
      className={`group ${baseClasses} ${continuationClasses} ${shaking ? 'animate-shake' : ''} flex items-center px-1 overflow-hidden select-none`}
    >
      {task.type === 'fluid' ? (
        <motion.div
          drag="x"
          dragConstraints={taskAreaRef as React.RefObject<HTMLElement | null>}
          dragElastic={0.1}
          onDragStart={() => setDragging(task.id)}
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
