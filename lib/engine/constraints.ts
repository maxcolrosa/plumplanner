import { toMidnightUTC } from '@/lib/engine/working-week'
import type { EngineTask, ConstraintViolation } from '@/lib/engine/types'

export function validateConstraints(tasks: EngineTask[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []

  for (const task of tasks) {
    for (const constraint of task.constraints) {
      switch (constraint.type) {
        case 'not_before_date': {
          const limit = toMidnightUTC(new Date(constraint.value!))
          if (task.start_date < limit) {
            violations.push({
              task_id: task.id,
              constraint_type: 'not_before_date',
              message: `Must not start before ${constraint.value}`,
            })
          }
          break
        }
        case 'not_after_date': {
          const limit = toMidnightUTC(new Date(constraint.value!))
          if (task.end_date > limit) {
            violations.push({
              task_id: task.id,
              constraint_type: 'not_after_date',
              message: `Must complete by ${constraint.value}`,
            })
          }
          break
        }
        case 'not_before_task': {
          const referenced = tasks.find(t => t.id === constraint.value)
          if (!referenced) {
            violations.push({
              task_id: task.id,
              constraint_type: 'not_before_task',
              message: `Referenced task not found`,
            })
          } else if (task.start_date < referenced.end_date) {
            violations.push({
              task_id: task.id,
              constraint_type: 'not_before_task',
              message: `Must start after task "${referenced.name}" completes`,
            })
          }
          break
        }
        case 'no_split':
          // Behavior modifier — no violation to report
          break
      }
    }
  }

  return violations
}
