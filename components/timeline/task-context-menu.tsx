'use client'

import { useTransition } from 'react'
import { CalendarPlus, CalendarX, RefreshCw, Trash2, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { toggleCalendarSync, retryCalendarSync } from '@/actions/integrations'
import { deleteTask } from '@/actions/schedule'
import { useTimelineStore } from '@/lib/store/timeline'

interface TaskContextMenuProps {
  taskId: string
  resourceId: string
  calendarSyncEnabled: boolean
  calendarAvailable: boolean  // resource has linked user with calendar connected
  hasSyncError: boolean
}

export function TaskContextMenu({
  taskId,
  resourceId,
  calendarSyncEnabled,
  calendarAvailable,
  hasSyncError,
}: TaskContextMenuProps) {
  const [, startTransition] = useTransition()
  const setTasks = useTimelineStore((s) => s.setTasks)
  const setViolations = useTimelineStore((s) => s.setViolations)
  const setTaskSyncErrors = useTimelineStore((s) => s.setTaskSyncErrors)
  const taskSyncErrors = useTimelineStore((s) => s.taskSyncErrors)

  function handleCalendarToggle() {
    startTransition(async () => {
      const result = await toggleCalendarSync(taskId, !calendarSyncEnabled)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      if (!calendarSyncEnabled) {
        toast.success('Task added to calendar')
      } else {
        toast.success('Task removed from calendar')
        const next = new Set(taskSyncErrors)
        next.delete(taskId)
        setTaskSyncErrors(next)
      }
    })
  }

  function handleRetry() {
    startTransition(async () => {
      const result = await retryCalendarSync(taskId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      const next = new Set(taskSyncErrors)
      next.delete(taskId)
      setTaskSyncErrors(next)
      toast.success('Calendar sync retried')
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTask(taskId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setTasks(resourceId, result.tasks)
      setViolations(result.violations)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 absolute top-0.5 right-0.5 z-20 bg-background/80 hover:bg-background"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {hasSyncError ? (
          <DropdownMenuItem onClick={handleRetry}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Retry sync
          </DropdownMenuItem>
        ) : calendarSyncEnabled ? (
          <DropdownMenuItem onClick={handleCalendarToggle}>
            <CalendarX className="h-3.5 w-3.5 mr-2" />
            Remove from calendar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={handleCalendarToggle}
            disabled={!calendarAvailable}
            title={!calendarAvailable ? 'Connect a calendar in Settings first' : undefined}
          >
            <CalendarPlus className="h-3.5 w-3.5 mr-2" />
            Add to calendar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
