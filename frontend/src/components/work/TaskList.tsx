import { ListTodo } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import type { Task } from '@/lib/types'
import { TaskCard, type TaskCardProps } from './TaskCard'

export interface TaskListProps extends Omit<TaskCardProps, 'task'> {
  tasks: Task[] | undefined
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: ReactNode
  label?: string
  busyId?: string | null
}

export function TaskList({ tasks, loading, error, onRetry, emptyTitle = 'No tasks', emptyDescription, label = 'Tasks', busyId, ...handlers }: TaskListProps) {
  if (loading && !tasks) return <LoadingSkeleton lines={4} variant="card" label="Loading tasks" />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (!tasks || tasks.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} icon={<ListTodo className="h-6 w-6" aria-hidden />} />
  return (
    <ul aria-label={label} className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id}><TaskCard task={t} busy={busyId === t.id} {...handlers} /></li>
      ))}
    </ul>
  )
}
