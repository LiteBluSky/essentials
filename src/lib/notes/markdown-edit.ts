// Markdown editing helpers for the note textarea. Pure functions return an
// Edit (replace value[start, end) with `text`, then select [selStart, selEnd));
// applyEdit performs it through the browser so undo/redo keeps working.

export type Edit = {
  start: number
  end: number
  text: string
  selStart: number
  selEnd: number
}

type Sel = { value: string; start: number; end: number }

const LIST_PREFIX = /^(\s*)(?:([-*+])|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/

function lineStart(value: string, at: number) {
  return value.lastIndexOf('\n', at - 1) + 1
}

function lineEnd(value: string, at: number) {
  const i = value.indexOf('\n', at)
  return i === -1 ? value.length : i
}

/** Bold, italic, code…: wrap the selection in `marker`, or unwrap it. */
export function toggleWrap({ value, start, end }: Sel, marker: string): Edit {
  const m = marker.length
  const inner = value.slice(start, end)
  if (
    value.slice(start - m, start) === marker &&
    value.slice(end, end + m) === marker
  ) {
    return {
      start: start - m,
      end: end + m,
      text: inner,
      selStart: start - m,
      selEnd: end - m,
    }
  }
  if (
    inner.length > 2 * m &&
    inner.startsWith(marker) &&
    inner.endsWith(marker)
  ) {
    const text = inner.slice(m, -m)
    return { start, end, text, selStart: start, selEnd: start + text.length }
  }
  return {
    start,
    end,
    text: marker + inner + marker,
    selStart: start + m,
    selEnd: end + m,
  }
}

/** `[selection](url)` with "url" selected, ready to paste over. */
export function insertLink({ value, start, end }: Sel): Edit {
  const label = value.slice(start, end) || 'link'
  const text = `[${label}](url)`
  const urlAt = start + label.length + 3
  return { start, end, text, selStart: urlAt, selEnd: urlAt + 3 }
}

export type LineStyle = 'bullet' | 'number' | 'task' | 'quote' | 'heading'

const LINE_PREFIX: Record<LineStyle, RegExp> = {
  bullet: /^\s*[-*+]\s+(?!\[[ xX]\])/,
  number: /^\s*\d+[.)]\s+/,
  task: /^\s*[-*+]\s+\[[ xX]\]\s+/,
  quote: /^\s*>\s?/,
  heading: /^#{1,6}\s+/,
}

/** Turns the selected lines into a list/quote/heading, or back to text. */
export function toggleLines(
  { value, start, end }: Sel,
  style: LineStyle,
): Edit {
  const from = lineStart(value, start)
  const to = lineEnd(value, end)
  const lines = value.slice(from, to).split('\n')
  const remove = lines.every(
    (line) => !line.trim() || LINE_PREFIX[style].test(line),
  )

  let n = 0
  const next = lines.map((line) => {
    if (!line.trim()) return line
    // Strip whatever list/quote/heading prefix is there before adding ours.
    const indent = /^\s*/.exec(line)![0]
    const bare = line
      .replace(LIST_PREFIX, '')
      .replace(LINE_PREFIX.quote, '')
      .replace(LINE_PREFIX.heading, '')
    if (remove) return indent + bare
    n++
    const prefix = {
      bullet: '- ',
      number: `${n}. `,
      task: '- [ ] ',
      quote: '> ',
      heading: '## ',
    }[style]
    return style === 'heading' ? prefix + bare : indent + prefix + bare
  })
  const text = next.join('\n')
  // A caret stays at the end of its line; a selection covers the new lines.
  return start === end
    ? {
        start: from,
        end: to,
        text,
        selStart: from + next[0].length,
        selEnd: from + next[0].length,
      }
    : { start: from, end: to, text, selStart: from, selEnd: from + text.length }
}

/**
 * Enter inside a list item: start the next item (same indent, next number,
 * new unchecked box). Enter on an empty item ends the list. Null = let the
 * browser insert a plain newline.
 */
export function continueList({ value, start, end }: Sel): Edit | null {
  if (start !== end) return null
  const from = lineStart(value, start)
  const line = value.slice(from, start)
  const match = LIST_PREFIX.exec(line)
  if (!match) return null
  const [prefix, indent, , num, delim, task] = match
  // Unmatched groups are undefined at runtime (the types say string).
  const bullet = match[2] as string | undefined

  // Empty item: drop its marker and leave a blank line, so the next text
  // isn't read as part of the last item.
  if (line.length === prefix.length && lineEnd(value, start) === start) {
    return {
      start: from,
      end: start,
      text: '\n',
      selStart: from + 1,
      selEnd: from + 1,
    }
  }
  const marker = bullet ?? `${Number(num) + 1}${delim}`
  const text = `\n${indent}${marker} ${task ? '[ ] ' : ''}`
  return {
    start,
    end,
    text,
    selStart: start + text.length,
    selEnd: start + text.length,
  }
}

const INDENT = '  '

/** Tab / Shift+Tab: indent or outdent the selected lines by two spaces. */
export function indentLines(
  { value, start, end }: Sel,
  outdent: boolean,
): Edit {
  const from = lineStart(value, start)
  const to = lineEnd(value, end)
  const lines = value.slice(from, to).split('\n')
  const next = lines.map((line) =>
    outdent ? line.replace(/^ {1,2}|^\t/, '') : INDENT + line,
  )
  const text = next.join('\n')
  const firstShift = next[0].length - lines[0].length
  return {
    start: from,
    end: to,
    text,
    selStart: Math.max(from, start + firstShift),
    selEnd:
      start === end
        ? Math.max(from, start + firstShift)
        : end + text.length - (to - from),
  }
}

/**
 * Flips the checkbox of the task list item that starts at `offset` (from the
 * markdown parser's source positions). Null when there's no box there.
 */
export function toggleTaskAt(body: string, offset: number): string | null {
  const match = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(body.slice(offset))
  if (!match) return null
  const at = offset + match[1].length
  const next = match[2] === ' ' ? 'x' : ' '
  return body.slice(0, at) + next + body.slice(at + 1)
}

export function applyEdit(el: HTMLTextAreaElement, edit: Edit) {
  el.focus()
  if (edit.start === edit.end && !edit.text) {
    el.setSelectionRange(edit.selStart, edit.selEnd)
    return
  }
  el.setSelectionRange(edit.start, edit.end)
  // execCommand keeps the native undo stack; fall back where it's missing.
  const ok =
    edit.text === ''
      ? document.execCommand('delete')
      : document.execCommand('insertText', false, edit.text)
  if (!ok) {
    el.setRangeText(edit.text, edit.start, edit.end, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  el.setSelectionRange(edit.selStart, edit.selEnd)
}
