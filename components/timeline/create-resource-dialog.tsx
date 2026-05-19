'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { createResource } from '@/actions/resources'

interface CreateResourceDialogProps {
  open: boolean
  onClose: () => void
  orgId: string
}

type IconType = 'person' | 'room' | 'equipment'

const ICON_OPTIONS: Array<{ value: IconType; label: string }> = [
  { value: 'person', label: 'Person' },
  { value: 'room', label: 'Room' },
  { value: 'equipment', label: 'Equipment' },
]

export function CreateResourceDialog({
  open,
  onClose,
  orgId,
}: CreateResourceDialogProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [iconType, setIconType] = useState<IconType>('person')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName('')
      setIconType('person')
      setError(null)
    }
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const result = await createResource(orgId, name, iconType)

        if ('error' in result) {
          setError(result.error)
          return
        }

        onClose()
        router.refresh()
        toast.success('Resource created')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Resource</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-name">Name</Label>
            <Input
              id="resource-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Resource name"
              required
              autoFocus
            />
          </div>

          {/* Icon type */}
          <div className="flex flex-col gap-1.5">
            <Label id="icon-type-label">Type</Label>
            <div role="group" aria-labelledby="icon-type-label" className="flex items-center gap-4">
              {ICON_OPTIONS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="icon-type"
                    value={value}
                    checked={iconType === value}
                    onChange={() => setIconType(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Creating…' : 'Create Resource'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
