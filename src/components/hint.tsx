import type { ReactElement, ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * A shadcn tooltip on one element (instead of a native `title`): the
 * element itself is the trigger (no wrapper in the DOM), so it keeps its
 * ref, keys and data attributes. Nothing (no label) = no tooltip. The
 * delay comes from the `TooltipProvider` in `__root.tsx`. Not on touch
 * screens (there's no hover): what it says must also be in the element's
 * `aria-label` or text.
 */
export function Hint({
  label,
  side,
  children,
}: {
  label: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactElement
}) {
  if (label === undefined || label === null || label === '') return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
