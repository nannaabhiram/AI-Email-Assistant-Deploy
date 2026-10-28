import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { briefing } from '@/fixtures'
import { DailyBriefingCard } from './DailyBriefingCard'

const meta = { title: 'Insights/DailyBriefingCard', component: DailyBriefingCard, args: { briefing, onGenerate: fn() } } satisfies Meta<typeof DailyBriefingCard>
export default meta
type Story = StoryObj<typeof meta>

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Overdue \(1\)/)).toBeInTheDocument()
    await expect(canvas.getByText('Recommended actions')).toBeInTheDocument()
  },
}
export const Compact: Story = { args: { compact: true } }
export const RuleBased: Story = { args: { briefing: { ...briefing, source: 'rules', narrative: null } } }
export const Empty: Story = { args: { briefing: null } }
export const Generating: Story = { args: { briefing: null, generating: true } }
