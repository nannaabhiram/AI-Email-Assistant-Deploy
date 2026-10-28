import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { NOW, tasks } from '@/fixtures'
import { TaskCard } from './TaskCard'

const meta = {
  title: 'Work/TaskCard',
  component: TaskCard,
  args: { task: tasks[0]!, now: NOW, onToggleDone: fn(), onConfirm: fn(), onDismiss: fn(), onDelete: fn(), onOpenSource: fn() },
} satisfies Meta<typeof TaskCard>
export default meta
type Story = StoryObj<typeof meta>

export const OpenWithEvidence: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('checkbox', { name: /Mark .* as done/ }))
    await expect(args.onToggleDone).toHaveBeenCalledWith(tasks[0])
  },
}
export const SuggestedNeedsConfirmation: Story = {
  args: { task: tasks[1]! },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Confirm task' }))
    await expect(args.onConfirm).toHaveBeenCalled()
  },
}
export const Overdue: Story = { args: { task: tasks[2]! } }
export const Done: Story = { args: { task: tasks[3]! } }
export const Busy: Story = { args: { busy: true } }
