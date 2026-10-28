import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'

const meta = { title: 'UI/Avatar', component: Avatar, args: { name: 'Priya Nair', email: 'priya.nair@northwind.example' } } satisfies Meta<typeof Avatar>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Vip: Story = { args: { vip: true, size: 'lg' } }
export const EmailOnly: Story = { args: { name: null, email: 'digest@newsletter.example', size: 'sm' } }
