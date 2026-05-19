'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useResourcesStore } from '@/lib/store/resources'
import { reassignTask, reorderFluidTask } from '@/actions/schedule'
import type { EngineTask } from '@/lib/engine/types'

interface Props {
  task: EngineTask
  fromResourceId: string
}

export function ResourceTaskCard({ task, fromResourceId }: Props) {
  // Fix 1: Fine-grained selectors — no whole-store subscription
  const tasks = useResourcesStore(s => s.tasks)
  const beginOptimistic = useResourcesStore(s => s.beginOptimistic)
  const commitOptimistic = useResourcesStore(s => s.commitOptimistic)
  const revertOptimistic = useResourcesStore(s => s.revertOptimistic)
  const setTasks = useResourcesStore(s => s.setTasks)

  const [shaking, setShaking] = useState(false)
  // Fix 3: Ref for shake timeout to prevent memory leaks
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
    }
  }, [])

  function findDrop(px: number, py: number): { resourceId: string; position: number } | null {
    const columns = document.querySelectorAll<HTMLElement>('[data-resource-id]')
    for (const col of columns) {
      const rect = col.getBoundingClientRect()
      if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) continue
      // Fix 4: Guard non-null assertion
      const resourceId = col.dataset.resourceId
      if (!resourceId) continue
      const cards = col.querySelectorAll<HTMLElement>('[data-task-id]')
      let position = 0
      for (const card of cards) {
        if (card.dataset.taskId === task.id) continue // skip self
        const cr = card.getBoundingClientRect()
        if (py > cr.top + cr.height / 2) position++
      }
      return { resourceId, position }
    }
    return null
  }

  async function handleDragEnd(_: unknown, info: { point: { x: number; y: number } }) {
    const drop = findDrop(info.point.x, info.point.y)
    if (!drop) return

    beginOptimistic()

    let failed = false
    if (drop.resourceId !== fromResourceId) {
      // Optimistic: move card between columns — Fix 1: use tasks selector value
      const newSource = (tasks[fromResourceId] ?? []).filter(t => t.id !== task.id)
      const newTarget = [
        ...(tasks[drop.resourceId] ?? []).slice(0, drop.position),
        { ...task, resource_id: drop.resourceId },
        ...(tasks[drop.resourceId] ?? []).slice(drop.position),
      ]
      setTasks(fromResourceId, newSource)
      setTasks(drop.resourceId, newTarget)

      const result = await reassignTask(task.id, drop.resourceId, drop.position)
      if ('error' in result) {
        failed = true
      } else {
        setTasks(fromResourceId, result.sourceTasks)
        setTasks(drop.resourceId, result.targetTasks)
      }
    } else {
      // Same-column reorder
      const result = await reorderFluidTask(task.id, drop.position)
      if ('error' in result) {
        failed = true
      } else {
        setTasks(fromResourceId, result.tasks)
      }
    }

    if (failed) {
      revertOptimistic()
      setShaking(true)
      // Fix 3: Clear any existing timeout before setting a new one
      if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
      shakeTimeoutRef.current = setTimeout(() => setShaking(false), 400)
    } else {
      commitOptimistic()
    }
  }

  return (
    <motion.div
      data-task-id={task.id}
      drag
      // Fix 2: Removed dragSnapToOrigin — card stays where dropped; store update
      // will unmount/remount it in the correct column naturally.
      animate={shaking ? { x: [0, -6, 6, -6, 6, 0] } : { x: 0 }}
      transition={shaking ? { duration: 0.4 } : undefined}
      onDragEnd={handleDragEnd}
      whileDrag={{ opacity: 0.8, scale: 1.02, zIndex: 50 }}
      className="rounded border border-primary/30 bg-primary/10 px-2 py-2 text-xs cursor-grab active:cursor-grabbing select-none"
    >
      <div className="font-medium text-foreground truncate">{task.name}</div>
      <div className="text-muted-foreground mt-0.5">{task.duration_hours}h</div>
    </motion.div>
  )
}
