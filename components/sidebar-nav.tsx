'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Users, BarChart3, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { usePresence } from '@/hooks/use-presence'
import { WhoIsOnline } from '@/components/presence/who-is-online'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface SidebarNavProps {
  orgSlug: string
  orgName: string
  orgId: string
  userId: string
  userName: string
}

export function SidebarNav({ orgSlug, orgName, orgId, userId, userName }: SidebarNavProps) {
  const pathname = usePathname()
  const onlineUsers = usePresence(orgId, userId, userName)

  const items: NavItem[] = [
    { label: 'Timeline', href: `/${orgSlug}/timeline`, icon: CalendarDays },
    { label: 'Resources', href: `/${orgSlug}/resources`, icon: Users },
    { label: 'Capacity', href: `/${orgSlug}/capacity`, icon: BarChart3 },
    { label: 'Settings', href: `/${orgSlug}/settings`, icon: Settings },
  ]

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <div className="w-6 h-6 rounded-md bg-primary" />
        <span className="font-semibold text-sm text-sidebar-foreground truncate">{orgName}</span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-accent/50'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <WhoIsOnline users={onlineUsers} />

      <div className="p-2 border-t border-sidebar-border">
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit" className="w-full justify-start gap-2.5 text-sidebar-foreground">
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  )
}
