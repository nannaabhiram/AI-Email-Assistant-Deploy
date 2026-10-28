import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Pagination } from './Pagination'

const meta = { title: 'UI/Pagination', component: Pagination, args: { total: 132, limit: 50, offset: 0, onChange: fn() } } satisfies Meta<typeof Pagination>
export default meta
type Story = StoryObj<typeof meta>

export const FirstPage: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Previous/ })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }))
    await expect(args.onChange).toHaveBeenCalledWith(50)
  },
}
export const LastPage: Story = { args: { offset: 100 } }
export const Disabled: Story = { args: { offset: 50, disabled: true } }
