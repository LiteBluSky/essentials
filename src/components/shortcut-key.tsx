import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SHORTCUT_DEFS, comboParts, useBindings } from '@/lib/shortcuts'
import type { ShortcutId } from '@/lib/shortcuts'

/**
 * The key a shortcut is on right now, as a `Kbd` hint (in buttons, empty
 * states…). Follows the user's own keys (shortcuts dialog), so never write
 * a shortcut's key as a literal.
 */
export function ShortcutKey({
  id,
  className,
}: {
  id: ShortcutId
  className?: string
}) {
  const changed = useBindings()
  const def = SHORTCUT_DEFS[id]
  const parts = comboParts(changed[id] ?? def.keys, def.twice)
  if (parts.length === 1) return <Kbd className={className}>{parts[0]}</Kbd>
  return (
    <KbdGroup className={className}>
      {parts.map((part, i) => (
        <Kbd key={i}>{part}</Kbd>
      ))}
    </KbdGroup>
  )
}
