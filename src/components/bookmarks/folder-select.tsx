import { FolderIcon, HouseIcon } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FolderOption } from '@/lib/bookmarks/tree'

const INDENT_PX = 12

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
  const items = [
    { label: 'Top level', value: null as number | null, depth: -1 },
    ...options.map((o) => ({ label: o.name, value: o.id, depth: o.depth })),
  ]

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange(next)}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem
              key={item.value ?? 'root'}
              value={item.value}
              style={{ paddingLeft: 6 + Math.max(item.depth, 0) * INDENT_PX }}
            >
              {item.value === null ? <HouseIcon /> : <FolderIcon />}
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
