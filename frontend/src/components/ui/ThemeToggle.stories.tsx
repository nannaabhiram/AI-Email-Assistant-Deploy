import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ThemeToggle } from './ThemeToggle'

const meta = { title: 'UI/ThemeToggle', component: ThemeToggle } satisfies Meta<typeof ThemeToggle>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dark = canvas.getByRole('radio', { name: 'Dark theme' })
    await userEvent.click(dark)
    await expect(dark).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(canvas.getByRole('radio', { name: 'Light theme' }))
    await expect(canvas.getByRole('radio', { name: 'Light theme' })).toHaveAttribute('aria-checked', 'true')
  },
}
