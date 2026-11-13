import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyboardIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AppFooter } from '@/components/app-footer'
import { AppNav } from '@/components/app-nav'
import { JarvisSidebar } from '@/components/assistant-sidebar'
import { AdviceDialog } from '@/components/finances/advice-dialog'
import { BudgetsDialog } from '@/components/finances/budgets-dialog'
import { EntriesList } from '@/components/finances/entries-list'
import { EntryDialog } from '@/components/finances/entry-dialog'
import { FinancesMenu } from '@/components/finances/finances-menu'
import { MonthReport } from '@/components/finances/month-report'
import { QuickEntry } from '@/components/finances/quick-entry'
import { ShortcutsDialog } from '@/components/finances/shortcuts-dialog'
import { SubscriptionsDialog } from '@/components/finances/subscriptions-dialog'
import { GlobalSearch } from '@/components/global-search'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Kbd } from '@/components/ui/kbd'
import { toast } from '@/components/ui/toast'
import type { FinanceEntry } from '@/db/schema'
import { useAppSwitch } from '@/hooks/use-app-switch'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { APP_NAME } from '@/lib/config'
import { UNCATEGORIZED } from '@/lib/finances/categories'
import { addMonth, monthLabel, monthOf } from '@/lib/finances/money'
import { monthLines, totalsByCurrency } from '@/lib/finances/summary'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import {
  categorizeFinanceEntries,
  financesQueryOptions,
} from '@/server/finances.functions'

// The Finances app: type what you spent or got ("12.50 coffee", "+1800
// payroll") and see the month at a glance: in, out, left, and a circle of
// where it went. Subscriptions are charged on their own; past months keep
// only their totals per category. The AI is only used when asked (the
// auto-categorize toggle, "Categorize", Advice).
export const Route = createFileRoute('/finances')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(financesQueryOptions),
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
    ]),
  head: () => ({ meta: [{ title: `Finances · ${APP_NAME}` }] }),
  component: FinancesPage,
})

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function FinancesPage() {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(financesQueryOptions)
  const { data: aiAvailable } = useSuspenseQuery(assistantEnabledQueryOptions)
  const [month, setMonth] = useState(data.month)
  const inputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState<FinanceEntry | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [subsOpen, setSubsOpen] = useState(false)
  const [budgetsOpen, setBudgetsOpen] = useState(false)
  const [adviceOpen, setAdviceOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const dialogOpen =
    editorOpen ||
    subsOpen ||
    budgetsOpen ||
    adviceOpen ||
    helpOpen ||
    searchOpen ||
    settingsOpen

  const past = month < data.month
  const totals = useMemo(
    () => totalsByCurrency(monthLines(month, data.entries, data.reports)),
    [month, data],
  )
  const entries = useMemo(
    () => data.entries.filter((e) => monthOf(e.day) === month),
    [month, data],
  )
  const budgets = useMemo(
    () => new Map(data.budgets.map((b) => [b.category, b.cents])),
    [data.budgets],
  )
  const uncategorized = entries.filter(
    (e) => e.category === UNCATEGORIZED && e.title.trim(),
  )

  const categorize = useMutation({
    mutationFn: (ids: Array<number>) =>
      categorizeFinanceEntries({ data: { ids } }),
    onSuccess: async ({ done }) => {
      await queryClient.invalidateQueries(financesQueryOptions)
      toast.add({
        title: done
          ? `${done} categorized`
          : `${ASSISTANT_NAME} couldn't tell what they were`,
        type: done ? 'success' : 'warning',
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't categorize",
        description: error.message,
        type: 'error',
      }),
  })

  // Keys (not while typing or with a dialog open; listed in
  // finances/shortcuts-dialog.tsx).
  const switchApp = useAppSwitch()
  useEffect(() => {
    if (dialogOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      const actions: Record<string, (() => void) | undefined> = {
        a: () => inputRef.current?.focus(),
        m: () => setMonth((m) => addMonth(m, 1)),
        M: () => setMonth((m) => addMonth(m, -1)),
        t: () => setMonth(data.month),
        u: () => setSubsOpen(true),
        b: () => setBudgetsOpen(true),
        r: aiAvailable ? () => setAdviceOpen(true) : undefined,
        z: () => setSearchOpen(true),
        '?': () => setHelpOpen(true),
        H: () => switchApp(-1),
        L: () => switchApp(1),
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4 max-lg:flex-col max-lg:items-stretch">
        <AppNav />
        <div className="flex justify-between gap-2">
          {aiAvailable && (
            <Button variant="outline" onClick={() => setAdviceOpen(true)}>
              <SparklesIcon data-icon="inline-start" />
              Advice
              <Kbd className="max-lg:hidden">r</Kbd>
            </Button>
          )}
          <ButtonGroup aria-label="Settings">
            <Button
              variant="outline"
              size="icon"
              aria-label="Search everything"
              title="Search everything (z)"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </Button>
            <FinancesMenu
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
              onSubscriptions={() => setSubsOpen(true)}
              onBudgets={() => setBudgetsOpen(true)}
              uncategorized={aiAvailable ? uncategorized.length : 0}
              onCategorize={() =>
                categorize.mutate(uncategorized.map((e) => e.id))
              }
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              onClick={() => setHelpOpen(true)}
            >
              <KeyboardIcon />
            </Button>
            <ThemeToggle />
          </ButtonGroup>
        </div>
      </header>

      <QuickEntry today={data.today} inputRef={inputRef} />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-medium">{monthLabel(month)}</h1>
        <ButtonGroup aria-label="Month">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            title="Previous month (M)"
            onClick={() => setMonth((m) => addMonth(m, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            disabled={month === data.month}
            onClick={() => setMonth(data.month)}
          >
            This month
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            title="Next month (m)"
            onClick={() => setMonth((m) => addMonth(m, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </ButtonGroup>
      </div>

      {totals.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nothing in {monthLabel(month)}</EmptyTitle>
            <EmptyDescription>
              {past
                ? 'Nothing was recorded that month.'
                : 'Type what you spend above, like “12.50 coffee”, or “+1800 payroll” for money in.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <MonthReport totals={totals} budgets={budgets} />
      )}

      {past
        ? totals.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Past months keep only their totals per category.
            </p>
          )
        : entries.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Entries
              </h2>
              <EntriesList
                entries={entries}
                onOpen={(entry) => {
                  setEditing(entry)
                  setEditorOpen(true)
                }}
              />
            </section>
          )}

      <EntryDialog
        entry={editing}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
      <SubscriptionsDialog
        open={subsOpen}
        onOpenChange={setSubsOpen}
        subscriptions={data.subscriptions}
        today={data.today}
      />
      <BudgetsDialog
        open={budgetsOpen}
        onOpenChange={setBudgetsOpen}
        budgets={data.budgets}
      />
      <AdviceDialog
        open={adviceOpen}
        onOpenChange={setAdviceOpen}
        month={month}
      />
      <AppFooter />
      <JarvisSidebar enabled={!dialogOpen} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  )
}
