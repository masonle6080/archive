import type { PostSummary } from '../../../shared/types'
import { mediaUrl } from '@renderer/lib/media'
import { formatDate } from '@renderer/lib/date'
import { TagList } from './TagList'

export function EntryCard({
  entry,
  onOpen
}: {
  entry: PostSummary
  onOpen: (slug: string) => void
}): JSX.Element {
  return (
    <button onClick={() => onOpen(entry.slug)} className="block w-full text-left group">
      <article className="flex gap-6 items-start">
        {entry.coverImagePath && (
          <img
            src={mediaUrl(entry.coverImagePath)}
            alt=""
            className="w-32 h-32 object-cover rounded-sm shrink-0 sepia-[.15] saturate-[.85]"
          />
        )}
        <div className="min-w-0">
          <p className="text-xs text-bark-400 tracking-wide mb-1">{formatDate(entry.createdAt)}</p>
          <h3 className="font-serif text-xl text-bark-800 group-hover:text-terracotta-600 transition-colors mb-1">
            {entry.title}
          </h3>
          {entry.excerpt && (
            <p className="text-sm text-bark-500 leading-relaxed mb-2 line-clamp-2">
              {entry.excerpt}
            </p>
          )}
          <TagList tags={entry.categories} />
        </div>
      </article>
    </button>
  )
}
