import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { TopNavigation } from './TopNavigation'

const meta = {
  title: 'Layout/TopNavigation',
  component: TopNavigation,
  args: { userEmail: 'you@example.org', unreadNotifications: 3, onSearch: fn(), onOpenMenu: fn(), onOpenNotifications: fn(), onProfile: fn(), onSignOut: fn() },
} satisfies Meta<typeof TopNavigation>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search mail' }), 'invoices{enter}')
    await expect(args.onSearch).toHaveBeenCalledWith('invoices')
    await userEvent.click(canvas.getByRole('button', { name: /Account/ }))
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Sign out' }))
    await expect(args.onSignOut).toHaveBeenCalled()
  },
}
export const NoNotifications: Story = { args: { unreadNotifications: 0 } }
