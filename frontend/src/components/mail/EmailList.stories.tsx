import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { NOW, emailItems } from '@/fixtures'
import { ApiError } from '@/lib/api'
import { EmailList } from './EmailList'

const meta = { title: 'Mail/EmailList', component: EmailList, args: { emails: emailItems, onOpen: fn(), now: NOW } } satisfies Meta<typeof EmailList>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithSelection: Story = { args: { selectedId: 'e2', selectable: true, checkedIds: new Set(['e4']) } }
export const Loading: Story = { args: { emails: undefined, loading: true } }
export const Empty: Story = { args: { emails: [], emptyTitle: 'No high-priority emails', emptyDescription: 'You are all caught up.' } }
export const ErrorState: Story = { args: { emails: undefined, error: new ApiError(503, 'service_unavailable', 'Database temporarily unavailable'), onRetry: fn() } }
