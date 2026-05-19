'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useResourcesStore } from '@/lib/store/resources'
import { reassignTask, reorderFluidTask } from '@/actions/schedule'
import type { EngineTask } from '@/lib/engine/types'

interface Props {
  task: EngineTask
  fromResourceId: string
  orgId: string
}

export function ResourceTaskCard({ task, fromResourceId }: Props) {
  const store = useResourcesStore(s => s)
  const [shaking, setShaking] = useState(false)

  function findDrop(px: number, py: number): { resourceId: string; position: number } | null {
    const columns = document.querySelectorAll<HTMLElement>('[data-resource-id]')
    for (const col of columns) {
      const rect = col.getBoundingClientRect()
      if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) continue
      const resourceId = col.dataset.resourceId!
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

    store.beginOptimistic()

    let failed = false
    if (drop.resourceId !== fromResourceId) {
      // Optimistic: move card between columns
      const newSource = (store.tasks[fromResourceId] ?? []).filter(t => t.id !== task.id)
      const newTarget = [
        ...(store.tasks[drop.resourceId] ?? []).slice(0, drop.position),
        { ...task, resource_id: drop.resourceId },
        ...(store.tasks[drop.resourceId] ?? []).slice(drop.position),
      ]
      store.setTasks(fromResourceId, newSource)
      store.setTasks(drop.resourceId, newTarget)

      const result = await reassignTask(task.id, drop.resourceId, drop.position)
      if ('error' in result) {
        failed = true
      } else {
        store.setTasks(fromResourceId, result.sourceTasks)
        store.setTasks(drop.resourceId, result.targetTasks)
      }
    } else {
      // Same-column reorder — reorderFluidTask(taskId, atPosition)
      const result = await reorderFluidTask(task.id, drop.position)
      if ('error' in result) {
        failed = true
      } else {
        store.setTasks(fromResourceId, result.tasks)
      }
    }

    if (failed) {
      store.revertOptimistic()
      setShaking(true)
      setTimeout(() => setShaking(false), 400)
    } else {
      store.commitOptimistic()
    }
  }

  return (
    <motion.div
      data-task-id={task.id}
      drag
      dragSnapToOrigin
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
