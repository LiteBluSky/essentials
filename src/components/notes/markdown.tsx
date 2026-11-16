import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { ReferenceChip } from '@/components/reference'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/components/ui/toast'
import { readReference, remarkReferences } from '@/lib/references'

// GFM (tables, task lists, strikethrough, autolinks) + single newlines kept
// as line breaks, so a plain-text note reads exactly as it was typed. Raw HTML
// in a note is shown as text, never rendered. `@type(name#id)` references
// become clickable chips. Code blocks get a copy button.
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
    pre: ({ node: _node, ...props }) => <CodeBlock {...props} />,
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

/** How long the copy button shows its tick. */
const COPIED_MS = 1500

/** A code block with a button (top right, outside what scrolls) that copies
 * its text. Shown on hover / focus with a mouse, always on touch screens;
 * never printed. */
function CodeBlock(props: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    const text = (ref.current?.textContent ?? '').replace(/\n$/, '')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.add({ title: 'Code copied', type: 'success' })
    } catch {
      toast.add({ title: "Couldn't copy code", type: 'error' })
    }
  }

  return (
    <div data-code-block className="group/code">
      <pre ref={ref} {...props} />
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label={copied ? 'Copied' : 'Copy code'}
        title="Copy code"
        className="absolute top-1.5 right-1.5 opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 print:hidden"
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}
