// Deleted links and notes go to their app's bin, where they can be restored
// for a day before they're purged (lazily, whenever a bin is read or added to).
export const BIN_TTL_MS = 24 * 60 * 60 * 1000

// Anything deleted before this is past keeping.
export function binCutoff(now = Date.now()) {
  return new Date(now - BIN_TTL_MS)
}

// "in 21 h" / "in 40 min" until a binned item is purged.
export function binExpiry(deletedAt: Date, now = Date.now()) {
  const minutes = Math.max(
    1,
    Math.ceil((deletedAt.getTime() + BIN_TTL_MS - now) / 60_000),
  )
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`
}

// Folder id → "Parent / Child" names, for showing where an item was.
export function folderPathOf(
  all: Array<{ id: number; name: string; parentId: number | null }>,
) {
  const byId = new Map(all.map((f) => [f.id, f]))
  return (id: number | null) => {
    const names: Array<string> = []
    const seen = new Set<number>()
    let current = id
    while (current !== null && !seen.has(current)) {
      seen.add(current)
      const folder = byId.get(current)
      if (!folder) break
      names.unshift(folder.name)
      current = folder.parentId
    }
    return names.join(' / ')
  }
}
