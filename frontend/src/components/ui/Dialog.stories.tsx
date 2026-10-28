import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, within } from 'storybook/test'
import { Button } from './Button'
import { Dialog } from './Dialog'

function DialogDemo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size={size}
        title="Disconnect Gmail account"
        description="MailPilot will stop syncing and revoke its Google access."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => setOpen(false)}>Disconnect</Button></>}
      >
        <p className="text-sm text-fg">Synced data is kept unless you choose to delete it.</p>
      </Dialog>
    </>
  )
}

const meta = { title: 'UI/Dialog', component: DialogDemo } satisfies Meta<typeof DialogDemo>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Open dialog' })
    await userEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Disconnect Gmail account' })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await userEvent.keyboard('{Escape}')
    await expect(screen.queryByRole('dialog')).toBeNull()
    await expect(opener).toHaveFocus()
  },
}
export const Large: Story = { args: { size: 'lg' } }
