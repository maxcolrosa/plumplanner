import type { CapacityKPIs } from '@/lib/capacity-utils'

export function KpiCards({ kpis }: { kpis: CapacityKPIs }) {
  const pct = Math.round(kpis.avgUtilization * 100)
  const utilizationColor = pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-green-500' : 'text-muted-foreground'

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <div className={`text-2xl font-bold ${utilizationColor}`}>{pct}%</div>
        <div className="text-xs text-muted-foreground mt-1">Team avg utilization</div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <div className={`text-2xl font-bold ${kpis.overloadedDays > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
          {kpis.overloadedDays}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Overloaded days</div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <div className="text-2xl font-bold text-muted-foreground">{Math.round(kpis.slackHours)}h</div>
        <div className="text-xs text-muted-foreground mt-1">Slack this week</div>
      </div>
    </div>
  )
}
