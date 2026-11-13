import { Label, Pie, PieChart } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { CATEGORIES, category } from '@/lib/finances/categories'
import { formatMoney } from '@/lib/finances/money'
import type { CurrencyTotals, Line } from '@/lib/finances/summary'

// A month at a glance, per currency: what came in, went out and is left,
// and where it went (a circle chart + the categories, with budgets).

const chartConfig = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, { label: c.label, color: c.color }]),
) satisfies ChartConfig

export function MonthReport({
  totals,
  budgets,
}: {
  totals: Array<CurrencyTotals>
  budgets: Map<string, number>
}) {
  return (
    <div className="flex flex-col gap-8">
      {totals.map((t) => (
        <CurrencyReport
          key={t.currency}
          totals={t}
          // Budgets are in euros.
          budgets={t.currency === 'EUR' ? budgets : new Map()}
          showCurrency={totals.length > 1}
        />
      ))}
    </div>
  )
}

function CurrencyReport({
  totals,
  budgets,
  showCurrency,
}: {
  totals: CurrencyTotals
  budgets: Map<string, number>
  showCurrency: boolean
}) {
  const money = (cents: number) => formatMoney(cents, totals.currency)
  const left = totals.income - totals.spent
  const data = totals.expenses.map((l) => ({
    category: l.category,
    amount: l.cents / 100,
    fill: `var(--color-${l.category})`,
  }))
  return (
    <section className="flex flex-col gap-4">
      {showCurrency && (
        <h2 className="text-sm font-medium text-muted-foreground">
          {totals.currency}
        </h2>
      )}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="In" value={money(totals.income)} />
        <Stat label="Out" value={money(totals.spent)} />
        <Stat
          label="Left"
          value={formatMoney(left, totals.currency)}
          className={cn(left < 0 ? 'text-destructive' : 'text-success')}
        />
      </dl>
      {data.length > 0 && (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <ChartContainer
            config={chartConfig}
            className="aspect-square w-full max-w-60 shrink-0"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="category"
                    formatter={(value, name) => (
                      <div className="flex w-full justify-between gap-4">
                        <span>{category(String(name)).label}</span>
                        <span className="font-mono tabular-nums">
                          {money(Math.round(Number(value) * 100))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="amount"
                nameKey="category"
                innerRadius="62%"
                strokeWidth={2}
              >
                <Label
                  content={({ viewBox }) =>
                    viewBox && 'cx' in viewBox ? (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-lg font-semibold"
                        >
                          {money(totals.spent)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy + 20}
                          className="fill-muted-foreground text-xs"
                        >
                          spent
                        </tspan>
                      </text>
                    ) : null
                  }
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <CategoryList
            lines={totals.expenses}
            total={totals.spent}
            budgets={budgets}
            money={money}
          />
        </div>
      )}
      {totals.incomes.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Income</h3>
          <CategoryList
            lines={totals.incomes}
            total={totals.income}
            budgets={new Map()}
            money={money}
          />
        </div>
      )}
    </section>
  )
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-lg font-semibold tabular-nums', className)}>
        {value}
      </dd>
    </div>
  )
}

function CategoryList({
  lines,
  total,
  budgets,
  money,
}: {
  lines: Array<Line>
  total: number
  budgets: Map<string, number>
  money: (cents: number) => string
}) {
  return (
    <ul className="flex w-full flex-col gap-1.5">
      {lines.map((l) => {
        const c = category(l.category)
        const budget = budgets.get(l.category)
        const over = budget !== undefined && l.cents > budget
        return (
          <li key={l.category} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: c.color }}
            />
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {total > 0 ? Math.round((l.cents / total) * 100) : 0}%
            </span>
            <span
              className={cn(
                'w-32 text-right tabular-nums',
                over && 'text-destructive',
              )}
            >
              {money(l.cents)}
              {budget !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {' '}
                  / {money(budget)}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
