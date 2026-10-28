import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { emailDetail } from '@/fixtures'
import { EmailThread } from './EmailThread'

const reply = { ...emailDetail, id: 'e1b', is_sent: true, from_name: 'You', from_address: 'you@example.org', body_text: 'Thanks Priya, reviewing section 4 today.', internal_date: '2026-10-28T08:30:00Z' }
const followUp = { ...emailDetail, id: 'e1c', body_text: 'Great, let me know if you need the redlined version.', internal_date: '2026-10-28T08:50:00Z' }

const meta = { title: 'Mail/EmailThread', component: EmailThread, args: { messages: [emailDetail, reply, followUp], currentId: 'e1c' } } satisfies Meta<typeof EmailThread>
export default meta
type Story = StoryObj<typeof meta>

export const Conversation: Story = {
  play: async ({ canvasElement }) => {
    const toggles = within(canvasElement).getAllByRole('button', { expanded: false })
    await userEvent.click(toggles[0]!)
    await expect(within(canvasElement).getAllByRole('button', { expanded: true })).toHaveLength(2)
  },
}
export const SingleMessage: Story = { args: { messages: [emailDetail], currentId: 'e1' } }
