import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { FilterBar } from './FilterBar'

const OPTIONS = [
  { id: 'HIGH', label: 'High' }, { id: 'MEDIUM', label: 'Medium' }, { id: 'LOW', label: 'Low' },
  { id: 'unread', label: 'Unread' }, { id: 'reply', label: 'Needs reply' }, { id: 'risky', label: 'Suspicious' },
]

function FilterDemo({ initial = [] as string[] }) {
  const [active, setActive] = useState(initial)
  const [sort, setSort] = useState('priority')
  return (
    <div className="space-y-2">
      <FilterBar label="Inbox filters" options={OPTIONS} active={active} onChange={setActive}
        sort={{ value: sort, onChange: setSort, options: [{ id: 'priority', label: 'Priority' }, { id: 'newest', label: 'Newest' }] }} />
      <output className="text-xs text-fg-subtle">Active: {active.join(', ') || 'none'}</output>
    </div>
  )
}

const meta = { title: 'Layout/FilterBar', component: FilterDemo } satisfies Meta<typeof FilterDemo>
export default meta
type Story = StoryObj<typeof meta>

export const PriorityFilters: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const high = canvas.getByRole('button', { name: 'High' })
    await userEvent.click(high)
    await expect(high).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByText('Active: HIGH')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }))
    await expect(canvas.getByText('Active: none')).toBeInTheDocument()
  },
}
export const Preselected: Story = { args: { initial: ['HIGH', 'unread'] } }
