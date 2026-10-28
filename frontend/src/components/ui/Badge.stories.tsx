import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'
import { Badge } from './Badge'

const meta = { title: 'UI/Badge', component: Badge, args: { children: 'Needs review' } } satisfies Meta<typeof Badge>
export default meta
type Story = StoryObj<typeof meta>

export const AllTones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['neutral', 'primary', 'success', 'warning', 'danger', 'info', 'outline'] as const).map((tone) => <Badge key={tone} tone={tone}>{tone}</Badge>)}
    </div>
  ),
}
export const Warning: Story = { args: { tone: 'warning' } }
export const AvatarVariants: Story = {
  name: 'Avatar (sizes, VIP)',
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar name="Priya Nair" email="priya.nair@northwind.example" size="sm" />
      <Avatar name="Arjun Mehta" email="arjun.mehta@fabrikam.example" />
      <Avatar name="Priya Nair" email="priya.nair@northwind.example" size="lg" vip />
      <Avatar email="digest@newsletter.example" />
    </div>
  ),
}
