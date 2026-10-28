import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { NOW, emailItems } from '@/fixtures'
import { EmailListItem } from './EmailListItem'

const meta = {
  title: 'Mail/EmailListItem',
  component: EmailListItem,
  args: { email: emailItems[0]!, onOpen: fn(), now: NOW },
  decorators: [(Story) => <ul className="max-w-2xl rounded-lg border border-border bg-surface"><Story /></ul>],
} satisfies Meta<typeof EmailListItem>
export default meta
type Story = StoryObj<typeof meta>

export const HighPriorityVip: Story = {
  play: async ({ canvasElement, args }) => {
    const row = within(canvasElement).getByRole('button', { name: /HIGH priority/ })
    row.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onOpen).toHaveBeenCalledWith('e1')
  },
}
export const SuspiciousRuleBased: Story = { args: { email: emailItems[1]! } }
export const ReplyNeeded: Story = { args: { email: emailItems[2]! } }
export const Newsletter: Story = { args: { email: emailItems[3]! } }
export const AnalysisPending: Story = { args: { email: emailItems[4]! } }
export const Selected: Story = { args: { selected: true } }
export const Selectable: Story = {
  args: { selectable: true, onCheckedChange: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('checkbox'))
    await expect(args.onCheckedChange).toHaveBeenCalledWith('e1', true)
  },
}
