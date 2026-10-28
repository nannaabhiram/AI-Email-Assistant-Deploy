import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { NavigationSidebar } from './NavigationSidebar'

const meta = {
  title: 'Layout/NavigationSidebar',
  component: NavigationSidebar,
  args: { badges: { '/approvals': 2 } },
  decorators: [(Story) => <div className="h-[640px] w-64 border-r border-border bg-surface"><Story /></div>],
} satisfies Meta<typeof NavigationSidebar>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole('navigation', { name: 'Main' })
    await expect(within(nav).getByLabelText('2 pending')).toBeInTheDocument()
    await expect(within(nav).getAllByRole('link').length).toBeGreaterThanOrEqual(13)
  },
}
export const NoBadges: Story = { args: { badges: {} } }
