import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { ConfirmationDialog } from './ConfirmationDialog'

const meta = {
  title: 'UI/ConfirmationDialog',
  component: ConfirmationDialog,
  args: {
    open: true,
    title: 'Delete all synced email data?',
    description: 'Messages, analyses and tasks will be removed from MailPilot. Gmail is not affected.',
    confirmLabel: 'Delete data',
    destructive: true,
    onConfirm: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof ConfirmationDialog>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const RequiresTypedConfirmation: Story = {
  args: { requireText: 'DELETE' },
  play: async ({ args }) => {
    const confirm = await screen.findByRole('button', { name: 'Delete data' })
    await expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Type/), 'DELETE')
    await expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await expect(args.onConfirm).toHaveBeenCalled()
  },
}
export const Loading: Story = { args: { loading: true } }
