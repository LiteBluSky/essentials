import { MicIcon } from 'lucide-react'
import { useRef } from 'react'

import { InputGroupButton } from '@/components/ui/input-group'
import type { Dictation } from '@/hooks/use-dictation'
import { cn } from '@/lib/utils'

/** A press at least this long (ms) is a hold: letting go stops. */
const HOLD_MS = 350

/**
 * The mic in Jarvis's fields, dictating into `value` (appended). Tap to
 * start (it stops after a pause) and tap again to stop; or hold it and
 * speak, and let go to stop (hold-to-speak: pauses don't end it). The
 * press doesn't take focus from the field, so a phone keeps its keyboard.
 * Not rendered where the browser has no speech recognition.
 */
export function DictateButton({
  dictation,
  value,
  disabled,
  size = 'icon-xs',
  className,
}: {
  dictation: Dictation
  value: string
  disabled?: boolean
  size?: 'icon-xs' | 'icon-sm'
  className?: string
}) {
  /** When this press started listening (null: it stopped it, or none). */
  const pressedAt = useRef<number | null>(null)
  if (!dictation.supported) return null
  const { listening } = dictation

  const letGo = (e: React.PointerEvent) => {
    const at = pressedAt.current
    pressedAt.current = null
    if (at === null) return
    if (e.timeStamp - at >= HOLD_MS) dictation.finish()
    else dictation.release() // A tap: listen until a pause.
  }

  return (
    <InputGroupButton
      type="button"
      size={size}
      className={cn(
        'touch-none select-none [-webkit-touch-callout:none]',
        className,
      )}
      variant={listening ? 'secondary' : 'ghost'}
      aria-label={listening ? 'Stop dictating' : 'Dictate (or hold to speak)'}
      aria-pressed={listening}
      title={listening ? 'Stop dictating' : 'Dictate (or hold to speak)'}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault() // Keep the focus (and a phone's keyboard).
        if (listening) {
          pressedAt.current = null
          dictation.finish()
          return
        }
        pressedAt.current = e.timeStamp
        dictation.start(value, { hold: true })
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      // A long press would open the phone's context menu.
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Pointer presses are handled above; this is Enter / Space.
        if (e.detail !== 0) return
        if (listening) dictation.finish()
        else dictation.start(value)
      }}
    >
      <MicIcon className={listening ? 'animate-pulse text-destructive' : ''} />
    </InputGroupButton>
  )
}
