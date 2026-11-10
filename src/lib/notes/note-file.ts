import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type {
  BlockContent,
  DefinitionContent,
  List,
  ListItem,
  PhrasingContent,
  RootContent,
  Table,
} from 'mdast'
import type {
  Column,
  Content,
  ContentTable,
  ContentText,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'

import type { Note } from '@/db/schema'
import { noteLabel } from './tree'

// Downloading a note as a file: `.md` (the title as a heading, then the body)
// or a PDF built from the markdown with pdfmake (real, selectable text; see
// `components/notes/note-download.ts`, which loads pdfmake on demand).

/** A safe file name for the note (no extension). */
export function noteFileName(note: Note): string {
  const name = noteLabel(note)
    .replace(/[\\/:*?"<>|]|\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/, '')
  return name || 'note'
}

export function noteMarkdown(note: Note): string {
  const body = note.body.replace(/\s+$/, '')
  const text = note.title ? `# ${note.title}\n\n${body}` : body
  return `${text.trimEnd()}\n`
}

const MONO = 'Courier'
const TEXT = '#171717'
const MUTED = '#737373'
const BORDER = '#d4d4d4'
const SURFACE = '#f5f5f5'
const LINK = '#2563eb'
const PAGE_MARGIN = 56
const CONTENT_WIDTH = 595.28 - 2 * PAGE_MARGIN // A4
const HEADING_SIZES = [18, 15, 13, 12, 11, 11]

type Ctx = { tight: boolean }

type Run = ContentText
type RunStyle = Omit<ContentText, 'text'>

// Inline content as a flat list of styled runs: pdfmake doesn't carry a
// parent's style (bold, link, …) into nested text arrays.
function runs(nodes: Array<PhrasingContent>, style: RunStyle = {}): Array<Run> {
  return nodes.flatMap((node) => inline(node, style))
}

function inline(node: PhrasingContent, style: RunStyle): Array<Run> {
  switch (node.type) {
    case 'text':
      // remark-breaks: a single newline is a line break, as in the preview.
      return [{ ...style, text: node.value }]
    case 'break':
      return [{ ...style, text: '\n' }]
    case 'strong':
      return runs(node.children, { ...style, bold: true })
    case 'emphasis':
      return runs(node.children, { ...style, italics: true })
    case 'delete':
      return runs(node.children, { ...style, decoration: 'lineThrough' })
    case 'inlineCode':
      return [{ ...style, text: node.value, font: MONO, background: SURFACE }]
    case 'link':
      return runs(node.children, { ...style, ...linkStyle(node.url) })
    case 'linkReference':
      return runs(node.children, style)
    case 'image':
      return [{ ...style, ...linkStyle(node.url), text: node.alt || node.url }]
    case 'imageReference':
      return [{ ...style, text: node.alt ?? '' }]
    case 'footnoteReference':
      return [
        { ...style, text: `[${node.label ?? node.identifier}]`, sup: true },
      ]
    case 'html':
      // Shown as text, never rendered (like the preview).
      return [{ ...style, text: node.value }]
  }
}

function linkStyle(url: string): RunStyle {
  return { link: url, color: LINK, decoration: 'underline' }
}

function paragraph(children: Array<PhrasingContent>, ctx: Ctx): Content {
  return {
    text: runs(children),
    margin: [0, 0, 0, ctx.tight ? 2 : 8],
  }
}

function checkbox(checked: boolean): Column {
  const box = {
    type: 'rect' as const,
    x: 0,
    y: 3,
    w: 9,
    h: 9,
    r: 2,
    lineWidth: 0.8,
    lineColor: checked ? TEXT : MUTED,
    ...(checked && { color: TEXT }),
  }
  return {
    width: 15,
    canvas: checked
      ? [
          box,
          {
            type: 'polyline',
            points: [
              { x: 2.2, y: 7.6 },
              { x: 3.9, y: 9.3 },
              { x: 6.9, y: 5.6 },
            ],
            lineWidth: 1.2,
            lineColor: '#ffffff',
            lineCap: 'round',
          },
        ]
      : [box],
  }
}

function listItem(item: ListItem, parent: List, hasTasks: boolean): Content {
  const ctx = { tight: parent.spread !== true && item.spread !== true }
  const body = item.children.map((child) => block(child, ctx))
  if (!hasTasks) return body
  if (item.checked === null || item.checked === undefined) {
    return {
      columns: [
        { width: 15, text: '•' },
        { width: '*', stack: body },
      ],
      columnGap: 0,
    }
  }
  return {
    columns: [
      checkbox(item.checked),
      {
        width: '*',
        stack: body,
        ...(item.checked && { color: MUTED, decoration: 'lineThrough' }),
      },
    ],
    columnGap: 0,
  }
}

function list(node: List): Content {
  const hasTasks = node.children.some(
    (item) => item.checked !== null && item.checked !== undefined,
  )
  const items = node.children.map((item) => listItem(item, node, hasTasks))
  const margin: [number, number, number, number] = [0, 0, 0, 8]
  if (node.ordered) {
    return { ol: items, start: node.start ?? 1, margin }
  }
  return { ul: items, margin, ...(hasTasks && { type: 'none' as const }) }
}

function table(node: Table): ContentTable {
  const columns = Math.max(...node.children.map((row) => row.children.length))
  return {
    table: {
      headerRows: 1,
      widths: Array.from({ length: columns }, () => 'auto' as const),
      body: node.children.map((row, r) =>
        Array.from({ length: columns }, (_, c) => ({
          text: runs(row.children[c]?.children ?? []),
          bold: r === 0,
          alignment: node.align?.[c] ?? 'left',
          ...(r === 0 && { fillColor: SURFACE }),
        })),
      ),
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 0, 0, 10],
  }
}

function block(
  node: RootContent | BlockContent | DefinitionContent,
  ctx: Ctx,
): Content {
  switch (node.type) {
    case 'paragraph':
      return paragraph(node.children, ctx)
    case 'heading':
      return {
        text: runs(node.children),
        fontSize: HEADING_SIZES[node.depth - 1],
        bold: true,
        margin: [0, 8, 0, 6],
        outline: true,
      }
    case 'list':
      return list(node)
    case 'blockquote':
      return {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: node.children.map((child) => block(child, ctx)),
                color: MUTED,
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (i) => (i === 0 ? 2.5 : 0),
          vLineColor: () => BORDER,
          paddingLeft: () => 12,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 8],
      }
    case 'code':
      return {
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: node.value,
                font: MONO,
                fontSize: 9.5,
                lineHeight: 1.2,
                preserveLeadingSpaces: true,
                fillColor: SURFACE,
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 8,
          paddingBottom: () => 8,
        },
        margin: [0, 0, 0, 10],
      }
    case 'thematicBreak':
      return {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH,
            y2: 0,
            lineWidth: 0.5,
            lineColor: BORDER,
          },
        ],
        margin: [0, 6, 0, 14],
      }
    case 'table':
      return table(node)
    case 'html':
      return { text: node.value, margin: [0, 0, 0, 8] }
    case 'footnoteDefinition':
      return {
        columns: [
          { width: 20, text: `[${node.label ?? node.identifier}]` },
          { width: '*', stack: node.children.map((c) => block(c, ctx)) },
        ],
        fontSize: 9,
        color: MUTED,
      }
    case 'definition':
      return []
    default:
      // Inline content at block level (doesn't happen with this parser).
      return 'children' in node || 'value' in node
        ? runs([node as PhrasingContent])
        : []
  }
}

const edited = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** The pdfmake document for a note: path + edited date, title, body. */
export function notePdfDefinition(
  note: Note,
  path: Array<string>,
): TDocumentDefinitions {
  const tree = fromMarkdown(note.body, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  return {
    pageSize: 'A4',
    pageMargins: PAGE_MARGIN,
    info: { title: noteLabel(note) },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 11,
      lineHeight: 1.3,
      color: TEXT,
    },
    content: [
      {
        text: [...path, `Edited ${edited.format(note.updatedAt)}`].join(' / '),
        fontSize: 9,
        color: MUTED,
        margin: [0, 0, 0, note.title ? 4 : 18],
      },
      note.title
        ? {
            text: note.title,
            fontSize: 20,
            bold: true,
            lineHeight: 1.15,
            margin: [0, 0, 0, 18],
          }
        : [],
      tree.children.map((node) => block(node, { tight: false })),
    ],
    footer: (page, pages) =>
      pages > 1
        ? {
            text: `${page} / ${pages}`,
            alignment: 'center',
            fontSize: 8,
            color: MUTED,
          }
        : null,
  }
}
