import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { ReferenceChip } from '@/components/reference'
import { Checkbox } from '@/components/ui/checkbox'
import { readReference, remarkReferences } from '@/lib/references'

// GFM (tables, task lists, strikethrough, autolinks) + single newlines kept
// as line breaks, so a plain-text note reads exactly as it was typed. Raw HTML
// in a note is shown as text, never rendered. `@type(name#id)` references
// become clickable chips.
const PLUGINS = [remarkGfm, remarkBreaks, remarkReferences]

export function Markdown({
  children,
  onToggleTask,
}: {
  children: string
  /** Called with the task item's source offset when its box is clicked. */
  onToggleTask?: (offset: number) => void
}) {
  const components: Components = {
    span: ({ node: _node, ...props }) => {
      const reference = readReference(
        (props as Record<string, unknown>)['data-ref'],
      )
      return reference ? (
        <ReferenceChip reference={reference} />
      ) : (
        <span {...props} />
      )
    },
    a: ({ node: _node, ...props }) => (
      <a {...props} target="_blank" rel="noreferrer" />
    ),
    input: ({ node: _node, type, checked }) =>
      type === 'checkbox' ? (
        <Checkbox
          data-task-checkbox
          checked={!!checked}
          disabled={!onToggleTask}
          aria-label={checked ? 'Done' : 'To do'}
        />
      ) : null,
    li: ({ node, className, children: content, ...props }) => {
      const offset = node?.position?.start.offset
      const isTask = className?.includes('task-list-item')
      return (
        <li
          {...props}
          className={className}
          onClick={
            isTask && onToggleTask && offset !== undefined
              ? (e) => {
                  // Only this item's own box (nested lists have their own).
                  const box = (e.target as Element).closest(
                    '[data-task-checkbox]',
                  )
                  if (box?.closest('li') === e.currentTarget) {
                    onToggleTask(offset)
                  }
                }
              : undefined
          }
        >
          {content}
        </li>
      )
    },
  }

  return (
    <div className="markdown prose prose-neutral max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={PLUGINS} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
