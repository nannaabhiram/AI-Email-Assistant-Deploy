import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { threadSummary } from '@/fixtures'
import { EmailSummary } from './EmailSummary'

const meta = { title: 'Mail/EmailSummary', component: EmailSummary, args: { summary: threadSummary, onSummarize: fn() } } satisfies Meta<typeof EmailSummary>
export default meta
type Story = StoryObj<typeof meta>

export const AiSummary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Stated facts')).toBeInTheDocument()
    await expect(canvas.getByText('Inferences (not stated)')).toBeInTheDocument()
  },
}
export const Stale: Story = { args: { stale: true } }
export const RuleBasedFallback: Story = { args: { summary: { ...threadSummary, source: 'rules', facts: [], inferences: [], decisions: [] } } }
export const NotYetSummarized: Story = {
  args: { summary: null },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Summarize thread/ }))
    await expect(args.onSummarize).toHaveBeenCalled()
  },
}
export const Loading: Story = { args: { summary: null, loading: true } }
