import type { Meta, StoryObj } from '@storybook/react-vite'
import { MoreHorizontal } from 'lucide-react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Button } from './Button'
import { DropdownMenu } from './DropdownMenu'

const onArchive = fn()
const meta = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  args: {
    label: 'Email actions',
    items: [
      { label: 'Propose archive', onSelect: onArchive },
      { label: 'Propose label', onSelect: fn() },
      { label: 'Unavailable action', onSelect: fn(), disabled: true },
      { label: 'Delete draft', onSelect: fn(), destructive: true },
    ],
    trigger: (props) => <Button variant="secondary" {...props}><MoreHorizontal className="h-4 w-4" aria-hidden /> Actions</Button>,
  },
} satisfies Meta<typeof DropdownMenu>
export default meta
type Story = StoryObj<typeof meta>

export const KeyboardNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Actions/ }))
    const menu = canvas.getByRole('menu', { name: 'Email actions' })
    await expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(within(menu).getByRole('menuitem', { name: 'Propose label' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{Enter}')
    await expect(onArchive).toHaveBeenCalled()
  },
}
