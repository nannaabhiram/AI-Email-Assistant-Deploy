import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { NOW, approvals } from '@/fixtures'
import { ApiError } from '@/lib/api'
import { ApprovalQueue } from './ApprovalQueue'

const meta = { title: 'Work/ApprovalQueue', component: ApprovalQueue, args: { approvals, now: NOW, onApprove: fn(), onReject: fn(), onCancel: fn(), onRetry: fn() } } satisfies Meta<typeof ApprovalQueue>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = { args: { approvals: undefined, loading: true } }
export const Empty: Story = { args: { approvals: [] } }
export const ErrorState: Story = { args: { approvals: undefined, error: new ApiError(0, 'network_error', 'Cannot reach the MailPilot server.'), onRetryLoad: fn() } }
