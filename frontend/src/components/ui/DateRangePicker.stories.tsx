import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { DateRangePicker, rangeForDays, type DateRange } from './DateRangePicker'

function RangeDemo({ initial }: { initial: DateRange }) {
  const [value, setValue] = useState(initial)
  return <DateRangePicker value={value} onChange={setValue} label="Analytics period" />
}
const meta = { title: 'UI/DateRangePicker', component: RangeDemo, args: { initial: rangeForDays(30) } } satisfies Meta<typeof RangeDemo>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const btn = within(canvasElement).getByRole('button', { name: '7 days' })
    await userEvent.click(btn)
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
  },
}
export const InvalidRange: Story = { args: { initial: { from: '2026-10-20', to: '2026-10-01' } } }
