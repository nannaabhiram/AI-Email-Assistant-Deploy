import type { Meta, StoryObj } from '@storybook/react-vite'
import { SenderIdentity } from './SenderIdentity'

const meta = { title: 'Mail/SenderIdentity', component: SenderIdentity, args: { name: 'Priya Nair', email: 'priya.nair@northwind.example' } } satisfies Meta<typeof SenderIdentity>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Vip: Story = { args: { vip: true, size: 'lg' } }
export const AddressOnly: Story = { args: { name: null, email: 'no-reply@accounts.example' } }
export const Unknown: Story = { args: { name: null, email: null } }
