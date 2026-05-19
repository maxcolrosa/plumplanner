import { Fragment } from 'react'
import type { CapacityCell } from '@/lib/capacity-utils'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function cellBg(cell: CapacityCell): string {
  if (cell.capacityHours === 0) return 'bg-muted/20 text-muted-foreground'
  if (cell.overloaded) return 'bg-red-500/80 text-white'
  if (cell.utilization >= 0.8) return 'bg-amber-500/75 text-white'
  if (cell.bookedHours > 0) return 'bg-green-500/60 text-white'
  return 'bg-muted/20 text-muted-foreground'
}

interface Props {
  weekDays: Date[]
  resources: Array<{ id: string; name: string }>
  cells: CapacityCell[]
}

export function CapacityHeatmap({ weekDays, resources, cells }: Props) {
  if (resources.length === 0) {
    return <p className="text-sm text-muted-foreground">No resources.</p>
  }

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `140px repeat(5, 1fr)` }}
    >
      {/* Header */}
      <div />
      {DAY_LABELS.map((label, i) => (
        <div key={label} className="text-center text-xs font-medium text-muted-foreground py-1">
          {label} {weekDays[i].getUTCDate()}
        </div>
      ))}

      {/* Resource rows */}
      {resources.map(resource => (
        <Fragment key={resource.id}>
          <div className="flex items-center text-xs text-foreground truncate pr-2 h-9">
            {resource.name}
          </div>
          {[0, 1, 2, 3, 4].map(dayIndex => {
            const cell = cells.find(c => c.resourceId === resource.id && c.dayIndex === dayIndex)
            if (!cell) {
              return <div key={dayIndex} className="rounded h-9 bg-muted/20" />
            }
            const tooltip = cell.tasks.length > 0
              ? cell.tasks.map(t => `${t.name} (${Math.round(t.hours)}h)`).join('\n')
              : 'No tasks'
            return (
              <div
                key={dayIndex}
                title={tooltip}
                className={`rounded h-9 flex items-center justify-center text-xs font-medium ${cellBg(cell)}`}
              >
                {cell.bookedHours > 0 ? `${Math.round(cell.bookedHours)}h` : '—'}
              </div>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}
