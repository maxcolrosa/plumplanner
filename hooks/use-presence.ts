'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export interface PresenceUser {
  userId: string
  name: string
  page: string
  color: string
}

const PAGE_LABELS: Record<string, string> = {
  timeline: 'Timeline',
  resources: 'Resources',
  capacity: 'Capacity',
  settings: 'Settings',
}

function pageLabel(pathname: string): string {
  const segment = pathname.split('/').at(-1) ?? ''
  return PAGE_LABELS[segment] ?? 'App'
}

function userColor(userId: string): string {
  const palette = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6']
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

export function usePresence(orgId: string, userId: string, userName: string): PresenceUser[] {
  const pathname = usePathname()
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`org:${orgId}:presence`, {
      config: { presence: { key: userId } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string; page: string }>()
        const users: PresenceUser[] = Object.entries(state).map(([uid, presences]) => {
          const latest = presences[presences.length - 1]
          return { userId: uid, name: latest.name, page: latest.page, color: userColor(uid) }
        })
        setOnlineUsers(users)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name: userName, page: pageLabel(pathname) })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId, userId, userName])

  // Re-track on page navigation without re-subscribing
  useEffect(() => {
    channelRef.current?.track({ name: userName, page: pageLabel(pathname) })
  }, [pathname, userName])

  return onlineUsers
}
