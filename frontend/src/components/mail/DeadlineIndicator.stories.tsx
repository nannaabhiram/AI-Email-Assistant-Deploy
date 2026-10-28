import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { NOW } from '@/fixtures'
import { DeadlineIndicator } from './DeadlineIndicator'

const at = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString()
const meta = { title: 'Mail/DeadlineIndicator', component: DeadlineIndicator, args: { dueAt: at(54), now: NOW } } satisfies Meta<typeof DeadlineIndicator>
export default meta
type Story = StoryObj<typeof meta>

export const Upcoming: Story = {}
export const DueSoon: Story = { args: { dueAt: at(5) } }
export const Overdue: Story = {
  args: { dueAt: at(-20) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Overdue/)).toBeInTheDocument()
  },
}
export const Inferred: Story = { args: { dueAt: at(300), dateType: 'inferred', text: 'valid for 15 days' } }
export const Completed: Story = { args: { dueAt: at(-20), done: true } }
