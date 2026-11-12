import { MicIcon } from 'lucide-react'

import { InputGroupButton } from '@/components/ui/input-group'
import type { Dictation } from '@/hooks/use-dictation'

/**
 * The mic in Jarvis's fields: tap to dictate into `value` (appended), tap
 * again to stop (it also stops after a pause). Not rendered where the
 * browser has no speech recognition.
 */
export function DictateButton({
  dictation,
  value,
  disabled,
  size = 'icon-xs',
}: {
  dictation: Dictation
  value: string
  disabled?: boolean
  size?: 'icon-xs' | 'icon-sm'
}) {
  if (!dictation.supported) return null
  const { listening } = dictation
  return (
    <InputGroupButton
      type="button"
      size={size}
      variant={listening ? 'secondary' : 'ghost'}
      aria-label={listening ? 'Stop dictating' : 'Dictate'}
      aria-pressed={listening}
      title={listening ? 'Stop dictating' : 'Dictate'}
      disabled={disabled}
      onClick={() => (listening ? dictation.finish() : dictation.start(value))}
    >
      <MicIcon className={listening ? 'animate-pulse text-destructive' : ''} />
    </InputGroupButton>
  )
}
