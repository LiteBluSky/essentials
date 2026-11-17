import { useEffect, useRef, useSyncExternalStore } from 'react'

// Every keyboard shortcut that can be changed, in one place. Each has an id,
// the scope it works in and its default key. The user's own keys are kept
// per browser (localStorage `shortcuts`: id → key) and edited in the
// shortcuts dialog (`?`: click a key, press the new one).
//
// A key ("combo") is written as the pressed character with its modifiers in
// front: `j`, `G` (= Shift+g), `?`, `Ctrl+k`, `Ctrl+O` (= Ctrl+Shift+o),
// `Alt+h`, `Delete`, `Shift+Enter`. Ctrl also stands for ⌘ on macOS.
//
// Key handlers don't compare `e.key` themselves:
//   - `isShortcut(e, id)` for a single shortcut, or
//   - `shortcutKey(e, scopes)` in a `switch`: it gives the *default* key of
//     whichever shortcut of those scopes the pressed key is now bound to, so
//     the cases stay written with the defaults (`case 'j':`).
// Enter, Esc, the arrows, Tab and the digits are fixed (not listed here).

export type ShortcutScope =
  | 'global'
  | 'tree'
  | 'bookmarks'
  | 'tasks'
  | 'passwords'
  | 'viewer'
  | 'chat'
  | 'calendar'
  | 'strips'
  | 'finances'
  | 'days'
  | 'editor'

type Def = {
  scope: ShortcutScope
  keys: string
  /** What it does, for the "also used by" warning. */
  label: string
  /** Pressed twice in a row (vim's `gg`). */
  twice?: boolean
}

const def = (
  scope: ShortcutScope,
  keys: string,
  label: string,
  twice = false,
): Def => ({ scope, keys, label, twice })

export const SHORTCUT_DEFS = {
  // Anywhere.
  'global.search': def('global', 'Ctrl+k', 'Search this app'),
  'global.newFolder': def('global', 'Ctrl+g', 'New folder'),
  'global.globalSearch': def('global', 'z', 'Search everything'),
  'global.appSwitcher': def('global', 'f', 'Switch app'),
  'global.profile': def('global', 'p', 'Switch profile'),
  'global.theme': def('global', 'T', 'Next theme'),
  'global.assistant': def('global', 's', 'Ask the assistant'),
  'global.hideAssistant': def('global', 'S', 'Hide the assistant panel'),
  'global.newChat': def('global', 'Ctrl+O', 'New chat'),
  'global.prevApp': def('global', 'Alt+h', 'Previous app'),
  'global.nextApp': def('global', 'Alt+l', 'Next app'),
  'global.help': def('global', '?', 'Keyboard shortcuts'),
  'global.confirm': def('global', 'd', 'Confirm a delete'),

  // The folder trees (Bookmarks, Notes, Tasks, Contacts).
  'tree.down': def('tree', 'j', 'Next row'),
  'tree.up': def('tree', 'k', 'Previous row'),
  'tree.collapse': def('tree', 'h', 'Collapse folder / go to parent'),
  'tree.expand': def('tree', 'l', 'Expand folder / into first child'),
  'tree.first': def('tree', 'g', 'First row', true),
  'tree.last': def('tree', 'G', 'Last row'),
  'tree.nextItem': def('tree', 'n', 'Next item'),
  'tree.prevItem': def('tree', 'N', 'Previous item'),
  'tree.open': def('tree', 'o', 'Open / toggle folder'),
  'tree.edit': def('tree', 'r', 'Edit'),
  'tree.new': def('tree', 'a', 'New item'),
  'tree.delete': def('tree', 'd', 'Delete'),
  'tree.cut': def('tree', 'x', 'Cut'),
  'tree.paste': def('tree', 'p', 'Paste'),
  'tree.searchBox': def('tree', '/', 'Search this app'),
  'tree.clearSearch': def('tree', 'q', 'Clear search'),
  'tree.collapseAll': def('tree', 'H', 'Collapse all folders'),
  'bookmarks.favorite': def('bookmarks', 'F', 'Add / remove favourite'),
  'tasks.complete': def('tasks', 'c', 'Complete / reopen'),
  'tasks.showDone': def('tasks', 't', 'Completed / open tasks'),
  'tasks.layout': def('tasks', 'v', 'Folders / one list'),
  'tasks.calendar': def('tasks', 'i', 'Calendar of the month'),
  'passwords.copyUsername': def('passwords', 'u', 'Copy the username'),
  'passwords.copyPassword': def('passwords', 'c', 'Copy the password'),
  'passwords.openSite': def('passwords', 'O', 'Open the website'),
  'passwords.reveal': def('passwords', 'v', 'Show / hide the password'),
  'passwords.lock': def('passwords', 'L', 'Lock the passwords'),

  // An open note / task / contact.
  'viewer.edit': def('viewer', 'e', 'Edit'),
  'viewer.delete': def('viewer', 'd', 'Delete'),
  'viewer.complete': def('viewer', 'c', 'Complete / reopen the task'),
  'viewer.scrollDown': def('viewer', 'j', 'Scroll the note down'),
  'viewer.scrollUp': def('viewer', 'k', 'Scroll the note up'),

  // Chat.
  'chat.next': def('chat', 'j', 'Next (older) conversation'),
  'chat.prev': def('chat', 'k', 'Previous (newer) conversation'),
  'chat.first': def('chat', 'g', 'Latest conversation', true),
  'chat.last': def('chat', 'G', 'Oldest conversation'),
  'chat.new': def('chat', 'a', 'New chat'),
  'chat.delete': def('chat', 'd', 'Delete the conversation'),
  'chat.pin': def('chat', 'P', 'Pin / unpin the conversation'),

  // Calendar (the month; left / right / up / down also step through the
  // colours in the strip form).
  'calendar.left': def('calendar', 'h', 'Previous day'),
  'calendar.right': def('calendar', 'l', 'Next day'),
  'calendar.up': def('calendar', 'k', 'Same day last week'),
  'calendar.down': def('calendar', 'j', 'Same day next week'),
  'calendar.weekStart': def('calendar', 'b', 'Beginning of the week'),
  'calendar.weekEnd': def('calendar', 'e', 'End of the week'),
  'calendar.nextMonth': def('calendar', 'm', 'Next month'),
  'calendar.prevMonth': def('calendar', 'M', 'Previous month'),
  'calendar.today': def('calendar', 't', 'Today'),
  'calendar.new': def('calendar', 'a', 'New strip'),
  'calendar.list': def('calendar', 'i', 'List every strip'),
  'calendar.tasks': def('calendar', 'o', "The day's tasks"),
  'calendar.delete': def('calendar', 'd', 'Delete the selected strip'),
  // Its strip list.
  'strips.down': def('strips', 'j', 'Next strip'),
  'strips.up': def('strips', 'k', 'Previous strip'),
  'strips.first': def('strips', 'g', 'First strip', true),
  'strips.last': def('strips', 'G', 'Last strip'),
  'strips.go': def('strips', 'o', 'Go to the strip'),
  'strips.edit': def('strips', 'e', 'Edit the strip'),
  'strips.delete': def('strips', 'd', 'Delete the strip'),
  'strips.filter': def('strips', '/', 'Filter the strips'),

  // Finances.
  'finances.add': def('finances', 'a', 'Add money'),
  'finances.nextMonth': def('finances', 'm', 'Next month'),
  'finances.prevMonth': def('finances', 'M', 'Previous month'),
  'finances.thisMonth': def('finances', 't', 'This month'),
  'finances.recurring': def('finances', 'u', 'Recurring tab'),
  'finances.budgets': def('finances', 'b', 'Budgets tab'),
  'finances.savings': def('finances', 'g', 'Savings tab'),
  'finances.advice': def('finances', 'r', 'Advice'),

  // Tasks' due date picker and month calendar.
  'days.prevDay': def('days', 'h', 'Previous day'),
  'days.nextDay': def('days', 'l', 'Next day'),
  'days.nextWeek': def('days', 'j', 'Next week'),
  'days.prevWeek': def('days', 'k', 'Previous week'),
  'days.nextMonth': def('days', 'm', 'Next month'),
  'days.prevMonth': def('days', 'M', 'Previous month'),
  'days.nextYear': def('days', 'y', 'Next year'),
  'days.prevYear': def('days', 'Y', 'Previous year'),
  'days.newTask': def('days', 'a', 'New task that day'),

  // Writing a note.
  'editor.bold': def('editor', 'Ctrl+b', 'Bold'),
  'editor.italic': def('editor', 'Ctrl+i', 'Italic'),
  'editor.link': def('editor', 'Ctrl+k', 'Link'),
  'editor.format': def('editor', 'Ctrl+m', 'Format the line'),
  'editor.save': def('editor', 'Ctrl+s', 'Save and show the note'),
} satisfies Record<string, Def>

export type ShortcutId = keyof typeof SHORTCUT_DEFS

const DEFS: Record<ShortcutId, Def> = SHORTCUT_DEFS
const IDS = Object.keys(DEFS) as Array<ShortcutId>

export const MOD_LABEL = 'Ctrl'

// ---- The user's keys (per browser) -----------------------------------------

type Bindings = Partial<Record<ShortcutId, string>>

const STORAGE_KEY = 'shortcuts'
const NONE: Bindings = {}
let bindings: Bindings | null = null
const listeners = new Set<() => void>()

function load(): Bindings {
  if (bindings) return bindings
  if (typeof window === 'undefined') return NONE
  const loaded: Bindings = {}
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}',
    )
    if (stored && typeof stored === 'object') {
      for (const [id, combo] of Object.entries(stored)) {
        if (Object.hasOwn(DEFS, id) && typeof combo === 'string' && combo) {
          loaded[id as ShortcutId] = combo
        }
      }
    }
  } catch {
    // Storage blocked or garbled: the defaults.
  }
  bindings = loaded
  return loaded
}

function store(next: Bindings) {
  bindings = next
  try {
    if (Object.keys(next).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not kept beyond this page; fine.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Changed in another tab.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    bindings = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The key a shortcut is on now. */
export function binding(id: ShortcutId): string {
  return load()[id] ?? DEFS[id].keys
}

/** Puts a shortcut on another key (its default = back to normal). */
export function setBinding(id: ShortcutId, combo: string) {
  const next = { ...load() }
  if (combo === DEFS[id].keys) delete next[id]
  else next[id] = combo
  store(next)
}

export function resetBinding(id: ShortcutId) {
  setBinding(id, DEFS[id].keys)
}

export function resetBindings() {
  store({})
}

/** Re-renders when a key changes; the changed keys (id → combo). The server
 * and the first client render use the defaults. */
export function useBindings(): Bindings {
  return useSyncExternalStore(subscribe, load, () => NONE)
}

// ---- Reading a key press ---------------------------------------------------

type KeyLike = {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const NOT_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'Dead',
  'Process',
  'Unidentified',
])

/** The combo a key event stands for, or null for a bare modifier. */
export function comboOf(e: KeyLike): string | null {
  if (NOT_KEYS.has(e.key)) return null
  const mod = e.ctrlKey || e.metaKey
  let key = e.key
  if (mod || e.altKey) {
    // Alt changes the character on some layouts: go by the physical key.
    const code = /^(?:Key|Digit)([A-Z0-9])$/.exec(e.code)
    if (e.altKey && code) key = code[1]
    if (key.length === 1) {
      key = e.shiftKey ? key.toUpperCase() : key.toLowerCase()
    }
  }
  if (key === ' ') key = 'Space'
  const shift = e.shiftKey && key.length > 1
  return `${mod ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${shift ? 'Shift+' : ''}${key}`
}

function hasModifier(combo: string) {
  return /^(Ctrl|Alt)\+./.test(combo)
}

function isTyping(target: EventTarget | null) {
  return (
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * Whether the event is this shortcut's key. A key without Ctrl / Alt never
 * counts while typing in a field (it's just a character there).
 */
export function isShortcut(
  e: KeyLike & { target: EventTarget | null },
  id: ShortcutId,
) {
  const combo = comboOf(e)
  if (combo === null || combo !== binding(id)) return false
  return hasModifier(combo) || !isTyping(e.target)
}

/**
 * For a `switch` over the keys of `scopes`: the default key of the shortcut
 * the pressed key is bound to. A default key whose shortcut moved elsewhere
 * gives null (it does nothing now), as does any other key with Ctrl / Alt;
 * anything else (Enter, arrows, digits…) comes back as `e.key`.
 * The default keys of the scopes given must not repeat.
 */
export function shortcutKey(
  e: KeyLike,
  scopes: ReadonlyArray<ShortcutScope>,
): string | null {
  const combo = comboOf(e)
  if (combo === null) return null
  let freed = false
  for (const id of IDS) {
    const d = DEFS[id]
    if (!scopes.includes(d.scope)) continue
    if (binding(id) === combo) return d.keys
    if (d.keys === combo) freed = true
  }
  if (freed || hasModifier(combo)) return null
  return e.key
}

// ---- Showing a key ---------------------------------------------------------

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Delete: 'Del',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
}

/** A combo as the keys to show: `Ctrl+O` → Ctrl, Shift, O; `G` → Shift, G. */
export function comboParts(combo: string, twice = false): Array<string> {
  const parts: Array<string> = []
  let rest = combo
  for (const [prefix, label] of [
    ['Ctrl+', MOD_LABEL],
    ['Alt+', 'Alt'],
    ['Shift+', 'Shift'],
  ]) {
    if (rest.startsWith(prefix) && rest.length > prefix.length) {
      parts.push(label)
      rest = rest.slice(prefix.length)
    }
  }
  if (rest.length === 1 && rest !== rest.toLowerCase()) {
    parts.push('Shift', rest)
  } else if (rest.length === 1 && parts.length) {
    parts.push(rest.toUpperCase())
  } else {
    parts.push(KEY_LABELS[rest] ?? rest)
  }
  return twice ? [...parts, ...parts] : parts
}

/** A shortcut's key as text ("Ctrl+K", "g g", "Shift+T"), for tooltips. */
export function shortcutLabel(id: ShortcutId, combo = binding(id)) {
  const once = comboParts(combo).join('+')
  return DEFS[id].twice ? `${once} ${once}` : once
}

/** The same, live: re-renders when the key is changed. */
export function useShortcutLabel(id: ShortcutId) {
  const changed = useBindings()
  return shortcutLabel(id, changed[id] ?? DEFS[id].keys)
}

/** For several tooltips in one component: `label(id)`, live. */
export function useShortcutLabels() {
  const changed = useBindings()
  return (id: ShortcutId) => shortcutLabel(id, changed[id] ?? DEFS[id].keys)
}

// ---- Conflicts -------------------------------------------------------------

const TREE_APPS: ReadonlyArray<ShortcutScope> = [
  'bookmarks',
  'tasks',
  'passwords',
]

function together(a: ShortcutScope, b: ShortcutScope) {
  return (
    a === b ||
    a === 'global' ||
    b === 'global' ||
    (a === 'tree' && TREE_APPS.includes(b)) ||
    (b === 'tree' && TREE_APPS.includes(a))
  )
}

/** Other shortcuts on the same key that are live at the same time. Only
 * reported for a key the user changed (some defaults share a key on
 * purpose: `p` pastes when something is cut, else switches profile). */
export function conflictsOf(id: ShortcutId, changed: Bindings) {
  const combo = changed[id] ?? DEFS[id].keys
  return IDS.filter(
    (other) =>
      other !== id &&
      (changed[other] ?? DEFS[other].keys) === combo &&
      together(DEFS[id].scope, DEFS[other].scope) &&
      (id in changed || other in changed),
  )
}

// ---- Hooks and helpers -----------------------------------------------------

/** Page-level shortcuts that also work while typing (Ctrl+K, Ctrl+G). */
export function useShortcuts(
  handlers: Partial<Record<ShortcutId, () => void>>,
  enabled = true,
) {
  // Keep the listener stable while always calling the latest handlers.
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      // The note editor uses Ctrl+B etc. for formatting and marks them handled.
      if (e.defaultPrevented) return
      for (const id of Object.keys(latest.current) as Array<ShortcutId>) {
        const handler = latest.current[id]
        if (handler && isShortcut(e, id)) {
          e.preventDefault()
          handler()
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/** Ctrl+Shift+O (⌘⇧O): a new chat with the assistant, from anywhere (even
 * while typing): Chat's page starts one, the desktop panel starts one, and
 * elsewhere (no panel) it opens a new chat in Chat. */
export function isNewChatKey(e: KeyboardEvent) {
  return isShortcut(e, 'global.newChat')
}

/** Alt+H / Alt+L (previous / next app): -1 / 1, else null. */
export function appSwitchStep(e: KeyboardEvent): -1 | 1 | null {
  if (isShortcut(e, 'global.prevApp')) return -1
  if (isShortcut(e, 'global.nextApp')) return 1
  return null
}

/** Focus the chat message box once it's rendered. */
export function focusChatComposer(within: ParentNode = document) {
  requestAnimationFrame(() =>
    within
      .querySelector<HTMLTextAreaElement>('[data-chat-composer] textarea')
      ?.focus(),
  )
}
