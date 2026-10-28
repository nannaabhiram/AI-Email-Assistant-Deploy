import { Table2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { EmptyState, LoadingSkeleton } from '@/components/ui/States'

export interface ChartSeries {
  key: string
  label: string
}

export interface AnalyticsChartProps {
  title: string
  description?: string
  kind: 'line' | 'bar'
  data: Record<string, string | number>[]
  xKey: string
  series: ChartSeries[]
  loading?: boolean
  height?: number
  formatX?: (value: string) => string
}

/** Validated two-slot categorical palette (see index.css); identity also carried by legend + table. */
const SERIES_COLORS = ['var(--mp-series-1)', 'var(--mp-series-2)']
const AXIS = { stroke: 'var(--mp-text-subtle)', fontSize: 12 }

export function AnalyticsChart({ title, description, kind, data, xKey, series, loading, height = 240, formatX }: AnalyticsChartProps) {
  const [showTable, setShowTable] = useState(false)
  const titleId = useId()
  const fmt = formatX ?? ((v: string) => v)
  return (
    <figure aria-labelledby={titleId} className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <figcaption id={titleId} className="text-sm font-semibold text-fg">{title}</figcaption>
          {description && <p className="text-xs text-fg-subtle">{description}</p>}
        </div>
        <Button variant="ghost" size="sm" aria-pressed={showTable} onClick={() => setShowTable((s) => !s)} leftIcon={<Table2 className="h-4 w-4" aria-hidden />}>
          {showTable ? 'Show chart' : 'Show table'}
        </Button>
      </div>
      {series.length > 1 && !showTable && (
        <ul className="mb-2 flex flex-wrap gap-4 text-xs text-fg-muted" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES_COLORS[i % 2], height: 2 }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {loading ? (
        <LoadingSkeleton variant="card" lines={1} label={`Loading ${title}`} />
      ) : data.length === 0 ? (
        <EmptyState title="No data for this period" className="py-8" />
      ) : showTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="text-xs text-fg-muted">
              <tr><th scope="col" className="py-1 pr-4 font-medium">{xKey}</th>{series.map((s) => <th key={s.key} scope="col" className="py-1 pr-4 text-right font-medium">{s.label}</th>)}</tr>
            </thead>
            <tbody className="text-fg">
              {data.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  <th scope="row" className="py-1 pr-4 font-normal">{fmt(String(row[xKey]))}</th>
                  {series.map((s) => <td key={s.key} className="py-1 pr-4 text-right tabular-nums">{row[s.key] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title}. Use “Show table” for the underlying values.`}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'line' ? (
              <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey={xKey} tickFormatter={fmt} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  labelFormatter={(v) => fmt(String(v))}
                  contentStyle={{ background: 'var(--mp-surface-raised)', border: '1px solid var(--mp-border)', borderRadius: 8, color: 'var(--mp-text)', fontSize: 12 }}
                  cursor={{ stroke: 'var(--mp-border-strong)' }}
                />
                {series.map((s, i) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES_COLORS[i % 2]} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, stroke: 'var(--mp-surface)', strokeWidth: 2 }} isAnimationActive={false} />
                ))}
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey={xKey} tickFormatter={fmt} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: 'var(--mp-surface-muted)' }}
                  contentStyle={{ background: 'var(--mp-surface-raised)', border: '1px solid var(--mp-border)', borderRadius: 8, color: 'var(--mp-text)', fontSize: 12 }}
                />
                {series.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLORS[i % 2]} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  )
}
