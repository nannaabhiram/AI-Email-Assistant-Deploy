import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Tabs } from './Tabs'

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  args: {
    label: 'Task views',
    tabs: [
      { id: 'open', label: 'Open', count: 4, content: <p>Open tasks</p> },
      { id: 'suggested', label: 'Needs confirmation', count: 2, content: <p>Suggested tasks</p> },
      { id: 'done', label: 'Done', content: <p>Completed tasks</p> },
    ],
  },
} satisfies Meta<typeof Tabs>
export default meta
type Story = StoryObj<typeof meta>

export const ArrowKeys: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('tab', { name: /Open/ }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('tab', { name: /Needs confirmation/ })).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Suggested tasks')
    await userEvent.keyboard('{End}')
    await expect(canvas.getByRole('tab', { name: 'Done' })).toHaveFocus()
  },
}
