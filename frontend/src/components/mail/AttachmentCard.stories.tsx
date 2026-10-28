import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { attachments } from '@/fixtures'
import { AttachmentCard } from './AttachmentCard'

const meta = { title: 'Mail/AttachmentCard', component: AttachmentCard, args: { attachment: attachments[0]!, onExtract: fn(), expanded: true } } satisfies Meta<typeof AttachmentCard>
export default meta
type Story = StoryObj<typeof meta>

export const Analysed: Story = {}
export const BlockedExecutable: Story = {
  args: { attachment: attachments[1]! },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Blocked')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /Analyse/ })).toBeNull()
  },
}
export const NotAnalysed: Story = {
  args: { attachment: attachments[2]! },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Analyse' }))
    await expect(args.onExtract).toHaveBeenCalledWith('att3')
  },
}
export const Extracting: Story = { args: { attachment: { ...attachments[2]!, extraction_status: 'pending' }, extracting: true } }
export const Failed: Story = { args: { attachment: { ...attachments[2]!, extraction_status: 'failed', extraction_error: 'Malformed PDF: EOF marker not found' } } }
