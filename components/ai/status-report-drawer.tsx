'use client'

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface StatusReportDrawerProps {
  open: boolean
  onClose: () => void
  orgId: string
}

type DrawerState = 'idle' | 'loading' | 'done' | 'error'

export function StatusReportDrawer({ open, onClose, orgId }: StatusReportDrawerProps) {
  const [state, setState] = useState<DrawerState>('idle')
  const [reportText, setReportText] = useState('')

  async function generate() {
    setState('loading')
    setReportText('')

    try {
      const response = await fetch('/api/ai/status-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })

      if (!response.ok || !response.body) {
        setState('error')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setReportText((prev) => prev + decoder.decode(value, { stream: true }))
      }

      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent side="right" className="w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Status Report</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {state === 'idle' && (
            <div className="flex items-center justify-center h-full">
              <Button onClick={generate}>Generate report</Button>
            </div>
          )}

          {(state === 'loading' || state === 'done') && (
            <div className="flex flex-col gap-4">
              {state === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {reportText}
              </div>
              {state === 'done' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  className="self-start"
                >
                  <RefreshCw className="w-3 h-3 mr-2" />
                  Regenerate
                </Button>
              )}
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-sm text-destructive">Failed to generate report.</p>
              <Button variant="outline" size="sm" onClick={generate}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
