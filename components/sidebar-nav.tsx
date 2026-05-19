'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  Users,
  BarChart3,
  Settings,
  LogOut,
  FileText,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Command,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { signOut } from '@/actions/auth'
import { createPortalSession } from '@/actions/billing'
import { usePresence } from '@/hooks/use-presence'
import { WhoIsOnline } from '@/components/presence/who-is-online'
import { StatusReportDrawer } from '@/components/ai/status-report-drawer'

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
  const [reportOpen, setReportOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const items: NavItem[] = [
    { label: 'Timeline', href: `/${orgSlug}/timeline`, icon: CalendarDays },
    { label: 'Resources', href: `/${orgSlug}/resources`, icon: Users },
    { label: 'Capacity', href: `/${orgSlug}/capacity`, icon: BarChart3 },
    { label: 'Settings', href: `/${orgSlug}/settings`, icon: Settings },
  ]

  async function handleManageBilling() {
    const result = await createPortalSession(orgId)
    if ('url' in result) {
      window.location.href = result.url
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <aside
        className={cn(
          'flex flex-col min-h-screen bg-sidebar border-r border-sidebar-border shrink-0',
          'transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden',
          collapsed ? 'w-[52px]' : 'w-56'
        )}
      >
        {/* Header */}
        <div className="flex items-center h-14 border-b border-sidebar-border shrink-0 px-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-[6px] bg-plum-cta shrink-0" />
            <span
              className={cn(
                'font-semibold text-[13px] text-sidebar-foreground truncate transition-opacity duration-100',
                collapsed ? 'opacity-0 w-0' : 'opacity-100'
              )}
            >
              {orgName}
            </span>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="ml-auto shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground transition-colors duration-150"
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-hidden">
          {items.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-2.5 py-1.5 rounded text-[13px] font-medium transition-colors duration-150 relative',
                  collapsed ? 'px-3 justify-center' : 'px-2.5',
                  isActive
                    ? 'bg-plum-accent-subtle text-plum-accent font-semibold'
                    : 'text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground'
                )}
              >
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-plum-accent rounded-full" />
                )}
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            )
          })}

          <button
            onClick={() => setReportOpen(true)}
            title={collapsed ? 'Status Report' : undefined}
            className={cn(
              'flex items-center gap-2.5 py-1.5 rounded text-[13px] font-medium transition-colors duration-150 w-full text-left',
              collapsed ? 'px-3 justify-center' : 'px-2.5',
              'text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground'
            )}
          >
            <FileText className="w-4 h-4 shrink-0" />
            {!collapsed && 'Status Report'}
          </button>
        </nav>

        {/* Who's online */}
        {!collapsed && <WhoIsOnline users={onlineUsers} />}

        {/* Bottom */}
        <div className="p-2 border-t border-sidebar-border space-y-0.5 shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <Command className="w-3 h-3 shrink-0" />
              <span>K — Quick add</span>
            </div>
          )}
          <button
            onClick={handleManageBilling}
            title={collapsed ? 'Manage billing' : undefined}
            className={cn(
              'flex items-center gap-2.5 py-1.5 rounded text-[13px] font-medium transition-colors duration-150 w-full text-left',
              collapsed ? 'px-3 justify-center' : 'px-2.5',
              'text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground'
            )}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            {!collapsed && 'Manage billing'}
          </button>
          <form action={signOut}>
            <button
              type="submit"
              title={collapsed ? 'Sign out' : undefined}
              className={cn(
                'flex items-center gap-2.5 py-1.5 rounded text-[13px] font-medium transition-colors duration-150 w-full text-left',
                collapsed ? 'px-3 justify-center' : 'px-2.5',
                'text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground'
              )}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && 'Sign out'}
            </button>
          </form>
        </div>
      </aside>

      <StatusReportDrawer
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        orgId={orgId}
      />
    </>
  )
}
