import { useState } from 'react'
import type { Settings } from '../../../shared/types'
import { quoteOfTheDay } from '@renderer/lib/quote'
import { FadeIn } from '@renderer/components/FadeIn'
import { Divider } from '@renderer/components/Divider'

export function HomeView({
  settings,
  onUpdateSettings
}: {
  settings: Settings | null
  onUpdateSettings: (patch: Partial<Settings>) => void
}): JSX.Element {
  const [adding, setAdding] = useState(false)
  const [newGoal, setNewGoal] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  if (!settings) return <p className="text-sm text-ink-400">Loading…</p>

  const quote = quoteOfTheDay(settings.quotes)

  function commitAdd(): void {
    const trimmed = newGoal.trim()
    setAdding(false)
    setNewGoal('')
    if (!trimmed) return
    onUpdateSettings({ goals: [...settings!.goals, trimmed] })
  }

  function removeGoal(index: number): void {
    onUpdateSettings({ goals: settings!.goals.filter((_, i) => i !== index) })
  }

  function startEdit(index: number): void {
    setEditingIndex(index)
    setEditValue(settings!.goals[index])
  }

  function commitEdit(): void {
    if (editingIndex === null) return
    const trimmed = editValue.trim()
    const next = [...settings!.goals]
    if (trimmed) next[editingIndex] = trimmed
    else next.splice(editingIndex, 1)
    onUpdateSettings({ goals: next })
    setEditingIndex(null)
  }

  function cancelEdit(): void {
    setEditingIndex(null)
  }

  return (
    <div>
      <h2 className="font-serif font-medium text-2xl text-ink-800 mb-8">
        Hello{settings.userName ? `, ${settings.userName}` : ''}
      </h2>

      {quote && (
        <FadeIn>
          <blockquote className="font-serif font-medium text-lg text-ink-500 border-l-2 border-line-200 pl-4 mb-10">
            {quote}
          </blockquote>
        </FadeIn>
      )}

      <Divider className="mb-8" />

      <div>
        <h3 className="text-xs font-medium text-ink-400 mb-3">Goals</h3>
        <div className="flex flex-col gap-3 mb-4">
          {settings.goals.map((g, i) => (
            <div key={i} className="group flex items-start gap-2">
              {editingIndex === i ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      cancelEdit()
                    }
                  }}
                  className="flex-1 text-sm text-ink-600 bg-transparent outline-none border-b border-line-300 py-0.5"
                />
              ) : (
                <p
                  onClick={() => startEdit(i)}
                  className="flex-1 text-sm text-ink-600 cursor-text hover:text-ink-800 transition-colors"
                >
                  {g}
                </p>
              )}
              <button
                onClick={() => removeGoal(i)}
                className="shrink-0 text-ink-300 opacity-0 transition-opacity hover:text-accent-600 group-hover:opacity-100"
                aria-label="Remove goal"
              >
                ×
              </button>
            </div>
          ))}
          {settings.goals.length === 0 && <p className="text-sm text-ink-400">No goals yet.</p>}
        </div>
        {adding ? (
          <input
            autoFocus
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd()
              if (e.key === 'Escape') {
                setAdding(false)
                setNewGoal('')
              }
            }}
            onBlur={commitAdd}
            placeholder="Goal…"
            className="w-full text-sm bg-transparent outline-none border-b border-line-300 py-1 placeholder:text-ink-300"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-left text-sm text-ink-400 hover:text-accent-600 transition-colors"
          >
            + Add goal
          </button>
        )}
      </div>
    </div>
  )
}
