'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { initiateCalendarConnect, disconnectCalendar, matchResource } from '@/actions/integrations'

interface Props {
  orgId: string
  orgSlug: string
  googleConnected: boolean
  outlookConnected: boolean
  myResourceId: string | null
  resources: Array<{ id: string; name: string }>
  resourceUserId: string | null
  allResourceLinks?: Array<{ resourceId: string; resourceName: string; userEmail: string | null }>
  isAdmin: boolean
}

export function CalendarSettings({
  orgId,
  orgSlug,
  googleConnected,
  outlookConnected,
  myResourceId,
  resources,
  isAdmin,
  allResourceLinks = [],
}: Props) {
  const [, startTransition] = useTransition()
  const [selectedResourceId, setSelectedResourceId] = useState(myResourceId ?? '')

  function connect(provider: 'google_calendar' | 'outlook') {
    startTransition(async () => {
      const result = await initiateCalendarConnect(provider, orgSlug)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      window.location.href = result.url
    })
  }

  function disconnect(provider: 'google_calendar' | 'outlook') {
    startTransition(async () => {
      const result = await disconnectCalendar(provider, orgId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${provider === 'google_calendar' ? 'Google Calendar' : 'Outlook'} disconnected`)
      window.location.reload()
    })
  }

  function saveResourceMatch() {
    if (!selectedResourceId) return
    startTransition(async () => {
      const result = await matchResource(selectedResourceId, orgId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Resource updated')
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Calendar connections</h2>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-muted-foreground">Sync tasks to your Google Calendar</p>
          </div>
          {googleConnected ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-600 font-medium">Connected</span>
              <Button variant="outline" size="sm" onClick={() => disconnect('google_calendar')}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => connect('google_calendar')}>
              Connect Google Calendar
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Microsoft Outlook</p>
            <p className="text-xs text-muted-foreground">Sync tasks to your Outlook calendar</p>
          </div>
          {outlookConnected ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-600 font-medium">Connected</span>
              <Button variant="outline" size="sm" onClick={() => disconnect('outlook')}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => connect('outlook')}>
              Connect Outlook
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Your resource</h2>
        <p className="text-sm text-muted-foreground">
          Calendar events sync to the calendar of the user linked to a resource.
          Select which resource represents you.
        </p>
        <div className="flex items-center gap-3">
          <select
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedResourceId}
            onChange={(e) => setSelectedResourceId(e.target.value)}
          >
            <option value="">— No resource selected —</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={saveResourceMatch} disabled={!selectedResourceId}>
            Save
          </Button>
        </div>
      </section>

      {isAdmin && allResourceLinks.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Resource — user mapping (admin)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium">Resource</th>
                <th className="pb-2 text-left font-medium">Linked user</th>
              </tr>
            </thead>
            <tbody>
              {allResourceLinks.map((link) => (
                <tr key={link.resourceId} className="border-b last:border-0">
                  <td className="py-2">{link.resourceName}</td>
                  <td className="py-2 text-muted-foreground">
                    {link.userEmail ?? <span className="italic">Not linked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
