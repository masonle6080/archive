import { useEffect, useState } from 'react'
import type { Category } from '../../../shared/types'
import type { Route } from '@renderer/lib/route'
import { todaysJournalLine } from '@renderer/lib/journalLine'

export function Sidebar({
  categories,
  route,
  onSelectHome,
  onSelectSettings,
  onSelectCategory,
  onCategoriesChanged
}: {
  categories: Category[]
  route: Route
  onSelectHome: () => void
  onSelectSettings: () => void
  onSelectCategory: (id: number | null) => void
  onCategoriesChanged: () => void
}): JSX.Element {
  const [order, setOrder] = useState<Category[]>(categories)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => setOrder(categories), [categories])

  const tabClass = (active: boolean, favorite = false): string =>
    [
      'w-full text-left px-3 py-2 rounded-sm text-sm tracking-wide transition-colors',
      active
        ? 'text-terracotta-600 font-medium'
        : favorite
          ? 'text-bark-800 font-semibold hover:text-bark-900'
          : 'text-bark-500 hover:text-bark-700'
    ].join(' ')

  // Where `draggedId` would land if dropped on `targetId` — null if that
  // wouldn't actually move anything (dragging onto itself, or onto the row
  // immediately after it, which resolves to the same position once the
  // dragged item is removed and reinserted).
  function resolveDropIndex(targetId: number): number | null {
    if (draggedId === null || draggedId === targetId) return null
    const fromIndex = order.findIndex((c) => c.id === draggedId)
    const toIndex = order.findIndex((c) => c.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return null

    // Removing the dragged item shifts everything after it left by one, so when
    // dragging downward the target's original index now points one slot past
    // where the highlight (drawn at the target's top edge) should indicate.
    const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex
    return insertAt === fromIndex ? null : insertAt
  }

  function handleDrop(targetId: number): void {
    setDragOverId(null)
    const insertAt = resolveDropIndex(targetId)
    if (insertAt === null) return

    const fromIndex = order.findIndex((c) => c.id === draggedId)
    const next = [...order]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(insertAt, 0, moved)

    setOrder(next)
    setDraggedId(null)
    window.api.categories.reorder(next.map((c) => c.id)).then(onCategoriesChanged)
  }

  function startRename(c: Category): void {
    setRenamingId(c.id)
    setRenameValue(c.name)
  }

  async function commitRename(): Promise<void> {
    if (renamingId === null) return
    const name = renameValue.trim()
    if (name) await window.api.categories.rename(renamingId, name)
    setRenamingId(null)
    onCategoriesChanged()
  }

  async function remove(c: Category): Promise<void> {
    const warning =
      c.count > 0
        ? `Delete "${c.name}"? ${c.count} ${c.count === 1 ? 'entry' : 'entries'} will lose this category (the entries themselves are kept).`
        : `Delete "${c.name}"?`
    if (!confirm(warning)) return
    if (route.kind === 'category' && route.id === c.id) onSelectCategory(null)
    await window.api.categories.delete(c.id)
    onCategoriesChanged()
  }

  async function toggleFavorite(c: Category): Promise<void> {
    await window.api.categories.setFavorite(c.id, !c.favorite)
    onCategoriesChanged()
  }

  async function handleContextMenu(e: React.MouseEvent, c: Category): Promise<void> {
    e.preventDefault()
    const action = await window.api.categories.contextMenu()
    if (action === 'rename') startRename(c)
    else if (action === 'delete') remove(c)
  }

  async function commitAdd(): Promise<void> {
    const name = newName.trim()
    setAdding(false)
    setNewName('')
    if (!name) return
    await window.api.categories.create(name)
    onCategoriesChanged()
  }

  return (
    <aside className="w-52 shrink-0 border-r border-sage-200/70 px-4 py-8 flex flex-col">
      <button
        onClick={onSelectHome}
        className="font-serif text-lg text-left text-bark-800 hover:text-terracotta-600 transition-colors px-3 mb-1"
      >
        Archive
      </button>
      <p className="px-3 text-xs italic text-bark-400 mb-8">{todaysJournalLine()}</p>
      <nav className="flex flex-col gap-1">
        <button
          onClick={() => onSelectCategory(null)}
          className={tabClass(route.kind === 'category' && route.id === null)}
        >
          All
        </button>

        {order.map((c) => (
          <div
            key={c.id}
            className={[
              'group flex items-center border-t-2 transition-colors',
              dragOverId === c.id ? 'border-terracotta-400' : 'border-transparent'
            ].join(' ')}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverId(resolveDropIndex(c.id) === null ? null : c.id)
            }}
            onDragLeave={() => setDragOverId((id) => (id === c.id ? null : id))}
            onDrop={() => handleDrop(c.id)}
          >
            {renamingId === c.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                onBlur={commitRename}
                className="flex-1 text-sm bg-transparent outline-none border-b border-sage-300 px-3 py-2"
              />
            ) : (
              <>
                <button
                  onClick={() => toggleFavorite(c)}
                  className={[
                    'shrink-0 px-1 transition-opacity',
                    c.favorite
                      ? 'text-terracotta-500'
                      : 'text-bark-300 opacity-0 group-hover:opacity-100 hover:text-terracotta-400'
                  ].join(' ')}
                  aria-label={c.favorite ? 'Unfavorite category' : 'Favorite category'}
                >
                  {c.favorite ? '★' : '☆'}
                </button>
                <button
                  onClick={() => onSelectCategory(c.id)}
                  onContextMenu={(e) => handleContextMenu(e, c)}
                  className={
                    tabClass(route.kind === 'category' && route.id === c.id, c.favorite) + ' flex-1'
                  }
                >
                  {c.name}
                </button>
              </>
            )}
            <span
              draggable
              onDragStart={() => setDraggedId(c.id)}
              onDragEnd={() => {
                setDraggedId(null)
                setDragOverId(null)
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-bark-300 hover:text-bark-500 select-none cursor-grab active:cursor-grabbing px-1 shrink-0"
              aria-hidden
            >
              ⠿
            </span>
          </div>
        ))}
      </nav>

      {adding ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitAdd()
            if (e.key === 'Escape') {
              setAdding(false)
              setNewName('')
            }
          }}
          onBlur={commitAdd}
          placeholder="Category name…"
          className="mt-3 mx-3 text-sm bg-transparent outline-none border-b border-sage-300 py-1 placeholder:text-bark-300"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 px-3 text-left text-sm text-bark-400 hover:text-terracotta-600 transition-colors"
        >
          + New category
        </button>
      )}

      <div className="flex-1" />

      <button
        onClick={onSelectSettings}
        className={[
          'px-3 text-left text-xs uppercase tracking-widest transition-colors',
          route.kind === 'settings' ? 'text-terracotta-600' : 'text-bark-400 hover:text-terracotta-600'
        ].join(' ')}
      >
        Settings
      </button>
    </aside>
  )
}
