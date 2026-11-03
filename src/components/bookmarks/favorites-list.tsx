import { GlobeIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import type { Link } from '@/db/schema'
import { hostname } from '@/lib/bookmarks/tree'
import type { OpenEditor } from './editor'
import { LinkMenu } from './bookmark-tree'

// Up to 9 favourite links above the tree; key 1-9 opens the matching one.
// Each row has the same hover menu as the link in the tree.
export function FavoritesList({
  favorites,
  onEdit,
  onToggleFavorite,
}: {
  favorites: Array<Link>
  onEdit: OpenEditor
  onToggleFavorite: (linkId: number) => void
}) {
  if (!favorites.length) return null
  return (
    <section aria-labelledby="favorites-heading" className="flex flex-col">
      <h2
        id="favorites-heading"
        className="px-2.5 pb-1 text-sm font-medium text-muted-foreground"
      >
        Favourites
      </h2>
      <ul className="flex flex-col">
        {favorites.map((link, i) => (
          <li key={link.id} className="group/row flex items-center gap-1">
            <Button
              variant="ghost"
              className="min-w-0 flex-1 justify-start"
              nativeButton={false}
              render={
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.description ?? link.url}
                />
              }
            >
              <Kbd>{i + 1}</Kbd>
              <GlobeIcon />
              <span className="truncate">{link.title}</span>
              <span className="truncate text-muted-foreground">
                {hostname(link.url)}
              </span>
            </Button>
            <LinkMenu
              link={link}
              onEdit={onEdit}
              onToggleFavorite={onToggleFavorite}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
