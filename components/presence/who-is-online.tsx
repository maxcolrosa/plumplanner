import type { PresenceUser } from '@/hooks/use-presence'

export function WhoIsOnline({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null

  return (
    <div className="px-3 py-2">
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Online</div>
      <div className="flex flex-col gap-2">
        {users.map(user => (
          <div key={user.userId} className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: user.color }}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground truncate leading-none">{user.name}</div>
              <div className="text-xs text-muted-foreground leading-none mt-0.5">{user.page}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
