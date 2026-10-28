import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { emailDetail, riskyAnalysis } from '@/fixtures'
import { EmailDetailHeader } from './EmailDetailHeader'

const meta = {
  title: 'Mail/EmailDetailHeader',
  component: EmailDetailHeader,
  args: { email: emailDetail, vip: true, onBack: fn(), onReply: fn(), onReanalyze: fn() },
} satisfies Meta<typeof EmailDetailHeader>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const SuspiciousMessage: Story = {
  args: {
    vip: false,
    email: { ...emailDetail, subject: 'URGENT: update payroll bank details today', from_name: 'CEO Office', from_address: 'ceo.office@contoso-payroll.example', reply_to: 'payments@other-domain.example', analysis: riskyAnalysis },
  },
}
export const Reanalysing: Story = { args: { reanalyzing: true } }
export const UserOverride: Story = { args: { email: { ...emailDetail, analysis: { ...emailDetail.analysis!, user_override_priority: 'MEDIUM', effective_priority: 'MEDIUM' } } } }
