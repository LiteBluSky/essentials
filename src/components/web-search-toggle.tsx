import { GlobeIcon } from 'lucide-react'

import { InputGroupButton } from '@/components/ui/input-group'
import { ASSISTANT_NAME } from '@/lib/assistant'

/**
 * Lets Jarvis search the web for the next request only: off by default,
 * and the box switches it back off as soon as the request is sent.
 */
export function WebSearchToggle({
  on,
  onChange,
  disabled,
  size = 'icon-sm',
}: {
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  size?: 'icon-xs' | 'icon-sm'
}) {
  const label = on
    ? 'Web search on for this message (tap to turn off)'
    : `Let ${ASSISTANT_NAME} search the web for this message`
  return (
    <InputGroupButton
      type="button"
      size={size}
      variant={on ? 'outline' : 'ghost'}
      aria-label={label}
      aria-pressed={on}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <GlobeIcon className={on ? 'text-primary' : ''} />
    </InputGroupButton>
  )
}
