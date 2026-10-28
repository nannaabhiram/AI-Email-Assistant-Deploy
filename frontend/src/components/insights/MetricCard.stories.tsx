import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertTriangle, ArrowUp } from 'lucide-react'
import { MetricCard } from './MetricCard'

const meta = { title: 'Insights/MetricCard', component: MetricCard, args: { label: 'High priority', value: 7, tone: 'high', icon: <ArrowUp className="h-4 w-4" /> } } satisfies Meta<typeof MetricCard>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Linked: Story = { args: { href: '/inbox', hint: '2 new since this morning' } }
export const Warning: Story = { args: { label: 'Overdue commitments', value: 3, tone: 'warning', icon: <AlertTriangle className="h-4 w-4" /> } }
export const Loading: Story = { args: { loading: true } }
export const NoData: Story = { args: { value: null, tone: 'neutral' } }
