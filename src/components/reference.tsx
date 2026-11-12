import { Badge } from '@/components/ui/badge'
import { useOpenReference } from '@/hooks/use-open-reference'
import { APPS } from '@/lib/apps'
import { REFERENCE_TYPES, splitReferences } from '@/lib/references'
import type { Reference } from '@/lib/references'

/** A `@type(name)` reference as a chip: its app's icon and the name. A click
 * opens the item (see `useOpenReference`). */
export function ReferenceChip({ reference }: { reference: Reference }) {
  const open = useOpenReference()
  const Icon = APPS.find((a) => a.path === `/${reference.app}`)?.icon
  const label = REFERENCE_TYPES.find((t) => t.type === reference.type)?.label

  return (
    <Badge
      variant="secondary"
      className="cursor-pointer align-baseline hover:bg-secondary/80"
      title={`Open ${label?.toLowerCase()} “${reference.name}”`}
      render={
        <button
          type="button"
          onClick={(e) => {
            // Not the row / list item around it.
            e.stopPropagation()
            void open(reference)
          }}
        />
      }
    >
      {Icon && <Icon data-icon="inline-start" />}
      {reference.name || 'Untitled'}
    </Badge>
  )
}

/** Plain text (kept as typed, newlines included by the caller's
 * `whitespace-pre-wrap`) with its references as chips. */
export function ReferenceText({ children }: { children: string }) {
  return (
    <>
      {splitReferences(children).map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <ReferenceChip key={i} reference={part} />
        ),
      )}
    </>
  )
}
