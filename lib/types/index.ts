export type PlanTier = 'starter' | 'team' | 'agency'
export type MemberRole = 'owner' | 'admin' | 'member'
export type TaskType = 'fixed' | 'fluid'
export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type IconType = 'person' | 'room' | 'equipment'
export type WorkingCapacity = 'full' | 'three_quarter' | 'half' | 'quarter' | 'none'
export type IntegrationProvider = 'google_calendar' | 'outlook' | 'slack' | 'github' | 'linear'

export interface WorkingWeek {
  mon: WorkingCapacity
  tue: WorkingCapacity
  wed: WorkingCapacity
  thu: WorkingCapacity
  fri: WorkingCapacity
  sat: WorkingCapacity
  sun: WorkingCapacity
}

export interface TaskConstraint {
  type: 'not_before_date' | 'not_before_task' | 'not_after_date' | 'no_split'
  value?: string
}

export interface ExternalRef {
  provider: 'github' | 'linear'
  id: string
  url: string
}

export const PLAN_LIMITS: Record<PlanTier, number> = {
  starter: 5,
  team: 15,
  agency: 25,
}

export const CAPACITY_HOURS: Record<WorkingCapacity, number> = {
  full: 8,
  three_quarter: 6,
  half: 4,
  quarter: 2,
  none: 0,
}
