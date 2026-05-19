'use client'

export function QuickAddProvider({
  children,
  orgId: _orgId,
  orgSlug: _orgSlug,
}: {
  children: React.ReactNode
  orgId: string
  orgSlug: string
}) {
  return <>{children}</>
}
