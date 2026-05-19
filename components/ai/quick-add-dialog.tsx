'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { parseQuickAddAction } from '@/actions/ai'

interface QuickAddDialogProps {
  open: boolean
  onClose: () => void
  orgId: string
  orgSlug: string
}

export function QuickAddDialog({ open, onClose, orgId, orgSlug }: QuickAddDialogProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClose() {
    setText('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setError(null)

    startTransition(async () => {
      const result = await parseQuickAddAction(text.trim(), orgId)

      if ('error' in result) {
        setError(result.error)
        return
      }

      const params = new URLSearchParams({
        qa_name: result.name,
        qa_resource: result.resource_id,
        qa_duration: String(result.duration_hours),
        qa_type: result.type,
        ...(result.start_date ? { qa_start: result.start_date } : {}),
      })

      handleClose()
      router.push(`/${orgSlug}/timeline?${params.toString()}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Add Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='e.g. "3h design review for Alice next Monday"'
            autoFocus
            disabled={isPending}
          />
          {error && (
            <p className="text-sm text-destructive">
              {error} — try: &ldquo;2h meeting for Alice tomorrow&rdquo;
            </p>
          )}
          <Button type="submit" disabled={isPending || !text.trim()}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Parsing…
              </>
            ) : (
              'Add Task'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
