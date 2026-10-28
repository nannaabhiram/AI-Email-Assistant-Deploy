import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { Button } from './Button'
import { Toast, useToast } from './Toast'

function Trigger() {
  const toast = useToast()
  return (
    <div className="flex gap-2">
      <Button onClick={() => toast.success('Draft saved', 'Version 3 created.')}>Success toast</Button>
      <Button variant="danger" onClick={() => toast.error('Send failed', 'Gmail rate limit; retry is safe.')}>Error toast</Button>
    </div>
  )
}

const meta = {
  title: 'UI/Toast',
  component: Toast,
  args: { toast: { id: 1, tone: 'success', title: 'Approval recorded', description: 'The reply will be sent shortly.' }, onDismiss: () => undefined },
} satisfies Meta<typeof Toast>
export default meta
type Story = StoryObj<typeof meta>

export const Success: Story = {}
export const ErrorTone: Story = { args: { toast: { id: 2, tone: 'error', title: 'Could not reach the DGX server', description: 'Analysis will be retried automatically.' } } }
export const Warning: Story = { args: { toast: { id: 3, tone: 'warning', title: 'Approval expired' } } }
export const Interactive: Story = {
  render: () => <Trigger />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Error toast' }))
    await expect(await screen.findByText('Send failed')).toBeInTheDocument()
  },
}
