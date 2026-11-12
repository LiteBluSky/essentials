import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { ReferenceChip } from '@/components/reference'
import { readReference, remarkReferences } from '@/lib/references'

// An answer's markdown (GFM + line breaks, like the notes preview, with the
// same `.markdown` styles). Links open in a new tab; raw HTML stays text;
// `@type(name#id)` references become clickable chips.
const PLUGINS = [remarkGfm, remarkBreaks, remarkReferences]

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={PLUGINS}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
