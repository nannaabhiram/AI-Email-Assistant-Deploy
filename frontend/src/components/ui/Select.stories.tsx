import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Select } from './Select'

const options = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'formal', label: 'Formal' },
]
const meta = { title: 'UI/Select', component: Select, args: { label: 'Reply tone', options } } satisfies Meta<typeof Select>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByLabelText('Reply tone')
    await userEvent.selectOptions(select, 'formal')
    await expect(select).toHaveValue('formal')
  },
}
export const WithPlaceholder: Story = { args: { placeholder: 'Choose a tone', defaultValue: '' } }
export const ErrorState: Story = { args: { error: 'Choose a tone' } }
export const Disabled: Story = { args: { disabled: true } }
