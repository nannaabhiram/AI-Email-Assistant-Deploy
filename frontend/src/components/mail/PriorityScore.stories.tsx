import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { analysis } from '@/fixtures'
import { PriorityScore } from './PriorityScore'

const meta = { title: 'Mail/PriorityScore', component: PriorityScore, args: { score: 82, confidence: 0.86 } } satisfies Meta<typeof PriorityScore>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('meter', { name: 'Priority score' })).toHaveAttribute('aria-valuenow', '82')
  },
}
export const WithBreakdown: Story = { args: { components: analysis.components, showBreakdown: true } }
export const LowConfidence: Story = { args: { score: 48, confidence: 0.32 } }
