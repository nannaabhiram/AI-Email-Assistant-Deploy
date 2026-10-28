import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from './Button'
import { Tooltip } from './Tooltip'

const meta = {
  title: 'UI/Tooltip',
  component: Tooltip,
  args: { content: 'Analysis was produced by deterministic rules', children: <Button variant="secondary">Rule-based</Button> },
} satisfies Meta<typeof Tooltip>
export default meta
type Story = StoryObj<typeof meta>

export const OnFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('button').focus()
    const tip = await canvas.findByRole('tooltip')
    await expect(canvas.getByRole('button')).toHaveAccessibleDescription(tip.textContent ?? '')
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('tooltip')).toBeNull()
  },
}
export const Bottom: Story = { args: { side: 'bottom' } }
