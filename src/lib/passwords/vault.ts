import { gcm } from '@noble/ciphers/aes.js'
import { bytesToUtf8, randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { useSyncExternalStore } from 'react'

// The Passwords vault, in the browser only. The master password derives a
// key (scrypt) that seals each entry's password and notes (AES-256-GCM, a
// fresh nonce each time); the server stores only the sealed text, the salt,
// the scrypt parameters and a sealed check value. Pure JS (@noble), not
// WebCrypto, so it also works over plain http on the LAN, where
// `crypto.subtle` doesn't exist. The key lives in memory: a reload, Lock
// (`L`) or `IDLE_LOCK_MS` without a key press or click locks it again.
// Forgetting the master password loses the passwords: there's no recovery.

/** scrypt's cost: 2^15 × 8 = 32 MiB, about a second in the browser. */
export const KDF = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 } as const
export type KdfParams = { N: number; r: number; p: number; dkLen: number }

/** Locks itself after this long without a key press or click. */
export const IDLE_LOCK_MS = 15 * 60 * 1000

/** What `check` seals: opening it proves the master password. */
const CHECK = 'vault-check-v1'

/** The encrypted part of an entry. */
export type Secret = { password: string; notes: string }

export type VaultRow = { salt: string; kdf: string; check: string }

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

async function deriveKey(master: string, salt: Uint8Array, kdf: KdfParams) {
  return scryptAsync(master.normalize('NFKC'), salt, kdf)
}

/** `base64(nonce ‖ ciphertext ‖ tag)`. */
function seal(key: Uint8Array, text: string) {
  const nonce = randomBytes(12)
  const sealed = gcm(key, nonce).encrypt(utf8ToBytes(text))
  const out = new Uint8Array(nonce.length + sealed.length)
  out.set(nonce)
  out.set(sealed, nonce.length)
  return toBase64(out)
}

/** Throws when the key is wrong or the text was tampered with. */
function unseal(key: Uint8Array, text: string) {
  const bytes = fromBase64(text)
  return bytesToUtf8(
    gcm(key, bytes.subarray(0, 12)).decrypt(bytes.subarray(12)),
  )
}

// ---- The key in memory -----------------------------------------------------

let key: Uint8Array | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function setKey(next: Uint8Array | null) {
  key?.fill(0)
  key = next
  clearTimeout(timer)
  if (key) timer = setTimeout(lockVault, IDLE_LOCK_MS)
  listeners.forEach((listener) => listener())
}

export function lockVault() {
  setKey(null)
}

/** Some activity: the idle lock starts over. */
export function touchVault() {
  if (!key) return
  clearTimeout(timer)
  timer = setTimeout(lockVault, IDLE_LOCK_MS)
}

export function isUnlocked() {
  return key !== null
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Re-renders when the vault locks or unlocks (locked on the server). */
export function useUnlocked() {
  return useSyncExternalStore(subscribe, isUnlocked, () => false)
}

/** Sets up a new vault: the row to save, and it's unlocked. */
export async function createVault(master: string): Promise<VaultRow> {
  const salt = randomBytes(16)
  const derived = await deriveKey(master, salt, KDF)
  const row = {
    salt: toBase64(salt),
    kdf: JSON.stringify(KDF),
    check: seal(derived, CHECK),
  }
  setKey(derived)
  return row
}

/** Unlocks with the master password; false if it's wrong. */
export async function unlockVault(master: string, vault: VaultRow) {
  const derived = await deriveKey(
    master,
    fromBase64(vault.salt),
    JSON.parse(vault.kdf) as KdfParams,
  )
  try {
    if (unseal(derived, vault.check) !== CHECK) return false
  } catch {
    return false
  }
  setKey(derived)
  return true
}

function currentKey() {
  if (!key) throw new Error('The vault is locked')
  return key
}

export function sealSecret(secret: Secret) {
  touchVault()
  return seal(currentKey(), JSON.stringify(secret))
}

export function openSecret(sealed: string): Secret {
  touchVault()
  const parsed = JSON.parse(unseal(currentKey(), sealed)) as Partial<Secret>
  return { password: parsed.password ?? '', notes: parsed.notes ?? '' }
}

/**
 * A new master password: a new salt and key, every secret sealed again
 * with it (the caller saves it all at once). Needs the vault unlocked.
 */
export async function rekeyVault(
  master: string,
  sealed: Array<{ id: number; secret: string }>,
) {
  const old = currentKey()
  const secrets = sealed.map((s) => ({ id: s.id, text: unseal(old, s.secret) }))
  const salt = randomBytes(16)
  const derived = await deriveKey(master, salt, KDF)
  const vault = {
    salt: toBase64(salt),
    kdf: JSON.stringify(KDF),
    check: seal(derived, CHECK),
  }
  const entries = secrets.map((s) => ({
    id: s.id,
    secret: seal(derived, s.text),
  }))
  return { vault, entries, commit: () => setKey(derived) }
}

// ---- Generating -------------------------------------------------------------

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!#$%&*+-=?@^_'
const ALL = LOWER + UPPER + DIGITS + SYMBOLS

/** A random index below `n`, without modulo bias. */
function randomBelow(n: number) {
  const limit = Math.floor(256 / n) * n
  for (;;) {
    const [b] = crypto.getRandomValues(new Uint8Array(1))
    if (b < limit) return b % n
  }
}

/** A strong random password (no look-alike characters), with at least one
 * of each kind. */
export function generatePassword(length = 20) {
  for (;;) {
    const chars = Array.from({ length }, () => ALL[randomBelow(ALL.length)])
    const password = chars.join('')
    if (
      [LOWER, UPPER, DIGITS, SYMBOLS].every((set) =>
        chars.some((c) => set.includes(c)),
      )
    ) {
      return password
    }
  }
}
