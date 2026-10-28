import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { draft, draftVersions } from '@/fixtures'
import { DraftEditor } from './DraftEditor'

const meta = {
  title: 'Work/DraftEditor',
  component: DraftEditor,
  args: { draft, versions: draftVersions, onSave: fn(), onRegenerate: fn(), onRequestApproval: fn(), onDiscard: fn() },
} satisfies Meta<typeof DraftEditor>
export default meta
type Story = StoryObj<typeof meta>

export const Editing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const body = canvas.getByLabelText(/Message/)
    await userEvent.clear(body)
    await userEvent.type(body, 'Hi Priya, I will review it today.')
    await expect(canvas.getByRole('button', { name: /Request send approval/ })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: /Save changes/ }))
    await expect(args.onSave).toHaveBeenCalledWith(expect.objectContaining({ body: 'Hi Priya, I will review it today.', to: ['priya.nair@northwind.example'] }))
  },
}
export const ValidationErrors: Story = {
  args: { onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const to = canvas.getByRole('textbox', { name: 'To' })
    await userEvent.clear(to)
    await userEvent.type(to, 'not-an-address')
    await userEvent.clear(canvas.getByLabelText(/Message/))
    await userEvent.click(canvas.getByRole('button', { name: /Save changes/ }))
    await expect(await canvas.findByText('Invalid address: not-an-address')).toBeInTheDocument()
    await expect(canvas.getByText('The message body is empty')).toBeInTheDocument()
    await expect(args.onSave).not.toHaveBeenCalled()
  },
}
export const CompareVersions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Compare current draft with'), '1')
    await expect(canvas.getByLabelText('Differences')).toHaveTextContent('[added]')
  },
}
export const RegenerateCustomTone: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Tone'), 'custom')
    const regen = canvas.getByRole('button', { name: /Regenerate draft/ })
    await expect(regen).toBeDisabled()
    await userEvent.type(canvas.getByLabelText('Describe the tone'), 'Warm but brief')
    await userEvent.click(regen)
    await expect(args.onRegenerate).toHaveBeenCalledWith('custom', 'Warm but brief', null)
  },
}
export const PendingApproval: Story = { args: { draft: { ...draft, status: 'pending_approval' } } }
export const Sent: Story = { args: { draft: { ...draft, status: 'sent' } } }
export const AiUnavailable: Story = { args: { aiAvailable: false } }
export const Saving: Story = { args: { saving: true, requesting: true } }
