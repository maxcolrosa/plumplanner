'use client'

import { useState, useEffect } from 'react'
import { QuickAddDialog } from './quick-add-dialog'

interface QuickAddProviderProps {
  children: React.ReactNode
  orgId: string
  orgSlug: string
}

export function QuickAddProvider({ children, orgId, orgSlug }: QuickAddProviderProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      {children}
      <QuickAddDialog
        open={open}
        onClose={() => setOpen(false)}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </>
  )
}
