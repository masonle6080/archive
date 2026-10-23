import { useEffect, useState } from 'react'
import type { Category, PostSummary } from '../../../shared/types'
import { EntryCard } from '@renderer/components/EntryCard'
import { FadeIn } from '@renderer/components/FadeIn'
import { Divider } from '@renderer/components/Divider'

function CategoryDescription({
  category,
  onChanged
}: {
  category: Category
  onChanged: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(category.description ?? '')

  useEffect(() => setValue(category.description ?? ''), [category.description])

  async function commit(): Promise<void> {
    setEditing(false)
    if (value.trim() === (category.description ?? '')) return
    await window.api.categories.updateDescription(category.id, value.trim())
    onChanged()
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue(category.description ?? '')
            setEditing(false)
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        placeholder="What goes here…"
        rows={2}
        className="w-full text-sm text-ink-600 bg-transparent outline-none border-b border-line-200 placeholder:text-ink-300 mb-8 resize-none"
      />
    )
  }

  return category.description ? (
    <p
      onClick={() => setEditing(true)}
      className="text-sm text-ink-500 mb-8 cursor-text hover:text-ink-700 transition-colors"
    >
      {category.description}
    </p>
  ) : (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-ink-400 hover:text-accent-600 mb-8 transition-colors"
    >
      + Add description
    </button>
  )
}

export function EntryListView({
  category,
  refreshToken,
  onOpenEntry,
  onNewEntry,
  onCategoriesChanged
}: {
  category: Category | null
  refreshToken: number
  onOpenEntry: (slug: string) => void
  onNewEntry: () => void
  onCategoriesChanged: () => void
}): JSX.Element {
  const [entries, setEntries] = useState<PostSummary[] | null>(null)

  useEffect(() => {
    setEntries(null)
    window.api.posts.list(category?.id ?? null).then(setEntries)
  }, [category?.id, refreshToken])

  return (
    <div>
      <h2 className="font-serif font-medium text-2xl text-ink-800 mb-2">{category?.name ?? 'All'}</h2>

      {category && <CategoryDescription category={category} onChanged={onCategoriesChanged} />}
      {!category && <div className="mb-8" />}

      {entries === null && <p className="text-sm text-ink-400">Loading…</p>}

      {entries?.length === 0 && (
        <p className="text-sm text-ink-500 mb-8">Nothing here yet.</p>
      )}

      <div className="flex flex-col gap-8 mb-8">
        {entries?.map((entry, i) => (
          <FadeIn key={entry.id}>
            <EntryCard entry={entry} onOpen={onOpenEntry} />
            {entries && i < entries.length - 1 && <Divider className="mt-8" />}
          </FadeIn>
        ))}
      </div>

      <button
        onClick={onNewEntry}
        className="inline-flex items-center h-8 px-3 rounded-lg text-sm font-medium bg-accent-600 text-paper hover:bg-accent-500 transition-colors"
      >
        + New entry
      </button>
    </div>
  )
}
