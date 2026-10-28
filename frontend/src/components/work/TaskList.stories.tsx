import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { NOW, tasks } from '@/fixtures'
import { ApiError } from '@/lib/api'
import { TaskList } from './TaskList'

const meta = { title: 'Work/TaskList', component: TaskList, args: { tasks, now: NOW, onToggleDone: fn(), onConfirm: fn(), onDismiss: fn() } } satisfies Meta<typeof TaskList>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = { args: { tasks: undefined, loading: true } }
export const Empty: Story = { args: { tasks: [], emptyTitle: 'Nothing due', emptyDescription: 'Tasks extracted from your email will appear here.' } }
export const ErrorState: Story = { args: { tasks: undefined, error: new ApiError(500, 'internal_error', 'Could not load tasks'), onRetry: fn() } }
