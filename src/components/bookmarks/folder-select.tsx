import { useState } from 'react'
import { ChevronDownIcon, FolderIcon, HouseIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { FolderOption } from '@/lib/bookmarks/tree'

const INDENT_PX = 12

type Item = {
  label: string
  value: number | null
  depth: number
  /** Ancestor names, shown while filtering (the indent is lost then). */
  path: string
}

function toItems(options: Array<FolderOption>): Array<Item> {
  const ancestors: Array<string> = []
  const items: Array<Item> = [
    { label: 'Top level', value: null, depth: -1, path: '' },
  ]
  for (const o of options) {
    ancestors.length = o.depth
    items.push({
      label: o.name,
      value: o.id,
      depth: o.depth,
      path: ancestors.join(' / '),
    })
    ancestors.push(o.name)
  }
  return items
}

// Match on the folder name only (item values are ids).
function filterByName(
  _value: string,
  search: string,
  keywords?: Array<string>,
) {
  const name = keywords?.[0]?.toLowerCase() ?? ''
  return name.includes(search.trim().toLowerCase()) ? 1 : 0
}

/** Folder picker with type-to-filter (shadcn Command in a Popover). */
export function FolderSelect({
  id,
  value,
  onChange,
  options,
  invalid,
}: {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  options: Array<FolderOption>
  invalid?: boolean
}) {
  const items = toItems(options)
  const selected = items.find((i) => i.value === value) ?? items[0]
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filtering = search.trim() !== ''

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverTrigger
        id={id}
        aria-invalid={invalid}
        render={
          <Button
            variant="outline"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected.value === null ? <HouseIcon /> : <FolderIcon />}
          <span className="truncate">{selected.label}</span>
        </span>
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Command filter={filterByName}>
          <CommandInput
            placeholder="Search folders…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No folders found.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value ?? 'root'}
                  value={String(item.value ?? 'root')}
                  keywords={[item.label]}
                  data-checked={item.value === selected.value}
                  onSelect={() => {
                    onChange(item.value)
                    setOpen(false)
                    setSearch('')
                  }}
                  style={{
                    paddingLeft: filtering
                      ? undefined
                      : 8 + Math.max(item.depth, 0) * INDENT_PX,
                  }}
                >
                  {item.value === null ? <HouseIcon /> : <FolderIcon />}
                  <span className="truncate">{item.label}</span>
                  {filtering && item.path && (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.path}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
