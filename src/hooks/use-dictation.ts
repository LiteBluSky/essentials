import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

/** The bits of the Web Speech API used here (not all in lib.dom yet). */
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const subscribe = () => () => {}

const ERRORS: Partial<Record<string, string>> = {
  'not-allowed':
    'The microphone is blocked. Allow it for this site (it needs https or localhost).',
  'service-not-allowed':
    'Speech recognition is not allowed here (it needs https or localhost).',
  'audio-capture': 'No microphone found.',
  // Also what Chromium forks without Google's speech service (Vivaldi,
  // Brave, Opera…) report, offline or not.
  network:
    "This browser's speech service isn't reachable (Vivaldi, Brave and Opera have none). Try Chrome, Edge or Safari, or your system's dictation (Win+H on Windows).",
}

/**
 * Dictation with the browser's own speech recognition (Web Speech API; in
 * Chrome / Edge / Safari, not Firefox). `start(text)` listens and calls
 * `onText` with `text` plus what's been said so far (interim results too,
 * so the words appear as you speak); it stops by itself after a pause.
 * `supported` is false on the server and in browsers without it.
 */
export function useDictation({
  onText,
  onError,
}: {
  onText: (text: string) => void
  onError: (message: string) => void
}) {
  const supported = useSyncExternalStore(
    subscribe,
    () => !!recognitionCtor(),
    () => false,
  )
  const [listening, setListening] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const callbacks = useRef({ onText, onError })
  callbacks.current = { onText, onError }

  /** Held (hold-to-speak): a pause doesn't end it, the release does. */
  const held = useRef(false)
  /** What `onText` last got, to carry on from when a held one restarts. */
  const lastText = useRef('')

  const stop = useCallback(() => {
    // abort: drop anything not yet delivered (e.g. after sending).
    held.current = false
    recognition.current?.abort()
    recognition.current = null
    setListening(false)
  }, [])

  const listen = useCallback((text: string): boolean => {
    const Ctor = recognitionCtor()
    if (!Ctor) return false
    const rec = new Ctor()
    rec.lang = navigator.language
    rec.continuous = false
    rec.interimResults = true
    const prefix = text && !/\s$/.test(text) ? `${text} ` : text
    lastText.current = text
    rec.onresult = (e) => {
      if (recognition.current !== rec) return
      let said = ''
      for (const result of Array.from(e.results)) {
        said += result[0].transcript
      }
      lastText.current = prefix + said.trimStart()
      callbacks.current.onText(lastText.current)
    }
    rec.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return
      held.current = false
      callbacks.current.onError(
        ERRORS[e.error] ?? `Speech recognition failed (${e.error}).`,
      )
    }
    rec.onend = () => {
      if (recognition.current !== rec) return
      recognition.current = null
      // Still held after a pause: listen on, after what's been said.
      if (held.current && listen(lastText.current)) return
      held.current = false
      setListening(false)
    }
    recognition.current = rec
    try {
      rec.start()
      return true
    } catch {
      recognition.current = null
      return false
    }
  }, [])

  /** Listens, appending to `text`. `hold`: until `finish` (hold-to-speak),
   * else until a pause. */
  const start = useCallback(
    (text: string, { hold = false }: { hold?: boolean } = {}) => {
      if (recognition.current) return
      held.current = hold
      setListening(listen(text))
    },
    [listen],
  )

  /** A held start becomes a plain one: it ends at the next pause (a tap on
   * the mic rather than a hold). */
  const release = useCallback(() => {
    held.current = false
  }, [])

  /** Stop listening gracefully (keeps what was just said). */
  const finish = useCallback(() => {
    held.current = false
    recognition.current?.stop()
  }, [])

  useEffect(() => () => recognition.current?.abort(), [])

  return { supported, listening, start, stop, finish, release }
}

export type Dictation = ReturnType<typeof useDictation>
