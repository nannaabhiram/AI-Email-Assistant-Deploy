import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PriorityBadge } from './PriorityBadge'

const meta = { title: 'Mail/PriorityBadge', component: PriorityBadge, args: { priority: 'HIGH' } } satisfies Meta<typeof PriorityBadge>
export default meta
type Story = StoryObj<typeof meta>

export const High: Story = {
  play: async ({ canvasElement }) => {
    // Priority must be readable as text, not only colour.
    await expect(within(canvasElement).getByText('High')).toBeInTheDocument()
  },
}
export const Medium: Story = { args: { priority: 'MEDIUM' } }
export const Low: Story = { args: { priority: 'LOW' } }
export const OverriddenByUser: Story = { args: { priority: 'LOW', overridden: true, size: 'md' } }
export const NotAnalysed: Story = { args: { priority: null } }
