import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Input, Textarea } from './Input'

const meta = { title: 'UI/Input', component: Input, args: { label: 'Email address', placeholder: 'you@example.org' } } satisfies Meta<typeof Input>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Email address')
    await userEvent.type(input, 'sam@example.org')
    await expect(input).toHaveValue('sam@example.org')
  },
}
export const WithHint: Story = { args: { hint: 'We only use this to identify your account.' } }
export const Required: Story = { args: { required: true } }
export const ErrorState: Story = {
  args: { error: 'Enter a valid email address', defaultValue: 'not-an-email' },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText(/Email address/)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveAccessibleDescription('Enter a valid email address')
  },
}
export const Disabled: Story = { args: { disabled: true, defaultValue: 'locked@example.org' } }
export const MultilineTextarea: Story = { render: () => <Textarea label="Message" rows={5} hint="Plain text only." /> }
