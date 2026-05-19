'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { insertTask } from '@/actions/schedule'
import { useTimelineStore } from '@/lib/store/timeline'

interface AddTaskDialogProps {
  open: boolean
  onClose: () => void
  resources: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string; color: string }>
  orgId: string
}

function todayUTCString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddTaskDialog({
  open,
  onClose,
  resources,
  projects,
  orgId,
}: AddTaskDialogProps) {
  const [name, setName] = useState('')
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '')
  const [type, setType] = useState<'fluid' | 'fixed'>('fluid')
  const [durationHours, setDurationHours] = useState(8)
  const [startDate, setStartDate] = useState(todayUTCString())
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const tasks = useTimelineStore((s) => s.tasks)
  const setTasks = useTimelineStore((s) => s.setTasks)
  const setViolations = useTimelineStore((s) => s.setViolations)

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName('')
      setResourceId(resources[0]?.id ?? '')
      setType('fluid')
      setDurationHours(8)
      setStartDate(todayUTCString())
      setProjectId(null)
      setError(null)
    }
  }, [open, resources])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsedDuration = Number(durationHours)
    if (!parsedDuration || parsedDuration <= 0) {
      setError('Duration must be greater than 0')
      return
    }

    const fluidTasksForResource = (tasks[resourceId] ?? []).filter(
      (t) => t.type === 'fluid'
    )

    startTransition(async () => {
      try {
        const result = await insertTask({
          org_id: orgId,
          resource_id: resourceId,
          atPosition: fluidTasksForResource.length,
          name,
          type,
          duration_hours: parsedDuration,
          start_date: type === 'fixed' ? startDate : undefined,
          project_id: projectId ?? undefined,
        })

        if ('error' in result) {
          setError(result.error)
          return
        }

        setTasks(resourceId, result.tasks)
        setViolations(result.violations)
        onClose()
        toast.success('Task added')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-name">Name</Label>
            <Input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Task name"
              required
              autoFocus
            />
          </div>

          {/* Resource */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-resource">Resource</Label>
            <select
              id="task-resource"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
            >
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <Label id="type-label">Type</Label>
            <div role="group" aria-labelledby="type-label" className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="task-type"
                  value="fluid"
                  checked={type === 'fluid'}
                  onChange={() => setType('fluid')}
                />
                Fluid
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="task-type"
                  value="fixed"
                  checked={type === 'fixed'}
                  onChange={() => setType('fixed')}
                />
                Fixed
              </label>
            </div>
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-duration">Duration (hours)</Label>
            <Input
              id="task-duration"
              type="number"
              min={0.5}
              step={0.5}
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              required
            />
          </div>

          {/* Start date — only for fixed tasks */}
          {type === 'fixed' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-start-date">Start Date</Label>
              <Input
                id="task-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
          )}

          {/* Project */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-project">Project</Label>
            <select
              id="task-project"
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || null)}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* No resources hint */}
          {resources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Create a resource first before adding tasks.
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending || !name.trim() || !resourceId}>
              {isPending ? 'Adding…' : 'Add Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
