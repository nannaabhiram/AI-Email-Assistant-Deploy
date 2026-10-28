import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { volumeData } from '@/fixtures'
import { AnalyticsChart } from './AnalyticsChart'

const meta = {
  title: 'Insights/AnalyticsChart',
  component: AnalyticsChart,
  args: {
    title: 'Email volume', description: 'Received and sent per day', kind: 'line', data: volumeData, xKey: 'day',
    series: [{ key: 'received', label: 'Received' }, { key: 'sent', label: 'Sent' }], formatX: (v: string) => v.slice(5),
  },
} satisfies Meta<typeof AnalyticsChart>
export default meta
type Story = StoryObj<typeof meta>

export const VolumeLine: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show table' }))
    await expect(canvas.getByRole('table')).toBeInTheDocument()
    await expect(canvas.getAllByRole('row')).toHaveLength(volumeData.length + 1)
  },
}
export const PriorityBars: Story = {
  args: { title: 'Priority distribution', kind: 'bar', xKey: 'priority', series: [{ key: 'count', label: 'Emails' }], data: [{ priority: 'High', count: 14 }, { priority: 'Medium', count: 41 }, { priority: 'Low', count: 120 }], formatX: undefined },
}
export const Loading: Story = { args: { loading: true } }
export const Empty: Story = { args: { data: [] } }
