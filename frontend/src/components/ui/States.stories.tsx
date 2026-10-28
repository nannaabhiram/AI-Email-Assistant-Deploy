import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ApiError } from '@/lib/api'
import { Button } from './Button'
import { Card, EmptyState, ErrorState, LoadingSkeleton } from './States'

const meta = {
  title: 'UI/States (Empty, Error, Loading)',
  component: EmptyState,
  args: { title: 'Inbox zero', description: 'No high-priority emails right now.' },
} satisfies Meta<typeof EmptyState>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = { args: { action: <Button size="sm">Sync now</Button> } }
export const LoadingList: Story = { render: () => <LoadingSkeleton variant="list" lines={4} /> }
export const LoadingCards: Story = { render: () => <LoadingSkeleton variant="card" lines={2} /> }
const retry = fn()
export const ErrorWithRetry: Story = {
  render: () => <ErrorState error={new ApiError(500, 'internal_error', 'An unexpected error occurred', {}, 'req-123abc')} onRetry={retry} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Try again' }))
    await expect(retry).toHaveBeenCalled()
  },
}
export const Offline: Story = { render: () => <ErrorState error={new ApiError(0, 'network_error', 'Cannot reach the MailPilot server.')} onRetry={() => undefined} /> }
export const PermissionError: Story = { render: () => <ErrorState error={new ApiError(403, 'permission_upgrade_required', 'Sending requires granting Gmail send permission')} /> }
export const CardContainer: Story = { render: () => <Card title="Pending approvals" description="Nothing is sent without you">Card body</Card> }
