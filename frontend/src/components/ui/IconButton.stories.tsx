import type { Meta, StoryObj } from '@storybook/react-vite'
import { RefreshCw, Trash2 } from 'lucide-react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { IconButton } from './IconButton'

const meta = {
  title: 'UI/IconButton',
  component: IconButton,
  args: { label: 'Refresh', icon: <RefreshCw className="h-4 w-4" aria-hidden />, onClick: fn() },
} satisfies Meta<typeof IconButton>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Refresh' })
    await userEvent.hover(button)
    await expect(within(canvasElement).getByRole('tooltip')).toHaveTextContent('Refresh')
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalled()
  },
}
export const Destructive: Story = { args: { label: 'Delete', icon: <Trash2 className="h-4 w-4" aria-hidden />, variant: 'danger' } }
export const Loading: Story = { args: { loading: true } }
export const Disabled: Story = { args: { disabled: true } }
