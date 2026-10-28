import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { NOW, approvals } from '@/fixtures'
import { ApprovalCard } from './ApprovalCard'

const meta = {
  title: 'Work/ApprovalCard',
  component: ApprovalCard,
  args: { approval: approvals[0]!, now: NOW, onApprove: fn(), onReject: fn(), onCancel: fn(), onRetry: fn() },
} satisfies Meta<typeof ApprovalCard>
export default meta
type Story = StoryObj<typeof meta>

export const SendReplyRequiresReview: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const approve = canvas.getByRole('button', { name: 'Approve and send' })
    await expect(approve).toBeDisabled()
    await expect(canvas.getByLabelText('Exact message to be sent')).toHaveTextContent('priya.nair@northwind.example')
    await userEvent.click(canvas.getByRole('checkbox', { name: /reviewed the exact recipients/ }))
    await userEvent.click(approve)
    await expect(args.onApprove).toHaveBeenCalledWith(approvals[0])
  },
}
export const Rejecting: Story = {
  args: { onApprove: fn(), onReject: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Reject' }))
    await expect(args.onReject).toHaveBeenCalled()
    await expect(args.onApprove).not.toHaveBeenCalled()
  },
}
export const ProposedArchive: Story = { args: { approval: approvals[1]! } }
export const Succeeded: Story = { args: { approval: approvals[2]! } }
export const FailedWithRetry: Story = { args: { approval: approvals[3]! } }
export const Expired: Story = { args: { approval: { ...approvals[0]!, expires_at: '2026-10-27T00:00:00Z' } } }
export const Busy: Story = { args: { busy: true, approval: approvals[1]! } }
