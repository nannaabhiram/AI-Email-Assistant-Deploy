import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SearchInput } from './SearchInput'

const meta = {
  title: 'UI/SearchInput',
  component: SearchInput,
  args: { label: 'Search mail', placeholder: 'Find the last quotation someone sent me', onSubmit: fn() },
} satisfies Meta<typeof SearchInput>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const box = within(canvasElement).getByRole('searchbox', { name: 'Search mail' })
    await userEvent.type(box, 'invoices from Adatum{enter}')
    await expect(args.onSubmit).toHaveBeenCalledWith('invoices from Adatum')
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Clear search' }))
    await expect(box).toHaveValue('')
  },
}
export const Large: Story = { args: { size: 'lg', defaultValue: 'emails that need a reply today' } }
export const Disabled: Story = { args: { disabled: true } }
