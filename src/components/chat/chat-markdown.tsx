import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

// An answer's markdown (GFM + line breaks, like the notes preview, with the
// same `.markdown` styles). Links open in a new tab; raw HTML stays text.
const PLUGINS = [remarkGfm, remarkBreaks]

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={PLUGINS}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
