import { useEffect, useState } from 'react'
import type { Settings, ThemeSource } from '../../../shared/types'
import { Divider } from '@renderer/components/Divider'

const THEME_OPTIONS: { value: ThemeSource; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

function quotesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((q, i) => q === b[i])
}

export function SettingsView({
  settings,
  onUpdateSettings,
  themeSource,
  onSetTheme
}: {
  settings: Settings | null
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
  themeSource: ThemeSource
  onSetTheme: (source: ThemeSource) => Promise<void>
}): JSX.Element {
  const [name, setName] = useState(settings?.userName ?? '')
  const [theme, setTheme] = useState<ThemeSource>(themeSource)
  const [quotes, setQuotes] = useState<string[]>(settings?.quotes ?? [])
  const [addingQuote, setAddingQuote] = useState(false)
  const [newQuote, setNewQuote] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => setName(settings?.userName ?? ''), [settings?.userName])
  useEffect(() => setQuotes(settings?.quotes ?? []), [settings?.quotes])
  useEffect(() => setTheme(themeSource), [themeSource])

  if (!settings) return <p className="text-sm text-ink-400">Loading…</p>

  const dirty =
    name.trim() !== settings.userName || theme !== themeSource || !quotesEqual(quotes, settings.quotes)

  function commitAddQuote(): void {
    const trimmed = newQuote.trim()
    setAddingQuote(false)
    setNewQuote('')
    if (!trimmed) return
    setQuotes((q) => [...q, trimmed])
  }

  function removeQuote(index: number): void {
    setQuotes((q) => q.filter((_, i) => i !== index))
  }

  function startEdit(index: number): void {
    setEditingIndex(index)
    setEditValue(quotes[index])
  }

  function commitEdit(): void {
    if (editingIndex === null) return
    const trimmed = editValue.trim()
    setQuotes((q) => {
      const next = [...q]
      if (trimmed) next[editingIndex] = trimmed
      else next.splice(editingIndex, 1)
      return next
    })
    setEditingIndex(null)
  }

  function cancelEdit(): void {
    setEditingIndex(null)
  }

  async function save(): Promise<void> {
    if (!dirty) return
    setSaving(true)

    const patch: Partial<Settings> = {}
    if (name.trim() !== settings!.userName) patch.userName = name.trim()
    if (!quotesEqual(quotes, settings!.quotes)) patch.quotes = quotes
    if (Object.keys(patch).length > 0) await onUpdateSettings(patch)
    if (theme !== themeSource) await onSetTheme(theme)

    setSaving(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1500)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-8">
        <h2 className="font-serif font-medium text-2xl text-ink-800">Settings</h2>
        <div className="flex items-center gap-3">
          {justSaved && <span className="text-xs text-ink-400">Saved</span>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center h-8 px-3 rounded-lg text-sm font-medium bg-accent-600 text-paper hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      <div className="mb-10">
        <h3 className="text-xs font-medium text-ink-400 mb-3">Your name</h3>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          placeholder="What should we call you?"
          className="w-full text-sm text-ink-600 bg-transparent outline-none border-b border-line-200 placeholder:text-ink-300 py-1"
        />
      </div>

      <Divider className="mb-8" />

      <div className="mb-10">
        <h3 className="text-xs font-medium text-ink-400 mb-3">Theme</h3>
        <div className="flex gap-4">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={[
                'text-sm transition-colors',
                theme === opt.value ? 'bg-line-100 text-ink-800' : 'text-ink-500 hover:bg-line-100 hover:text-ink-800'
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Divider className="mb-8" />

      <div>
        <h3 className="text-xs font-medium text-ink-400 mb-3">Quote bank</h3>
        <div className="flex flex-col gap-3 mb-4">
          {quotes.map((q, i) => (
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
                  {q}
                </p>
              )}
              <button
                onClick={() => removeQuote(i)}
                className="shrink-0 text-ink-300 opacity-0 transition-opacity hover:text-accent-600 group-hover:opacity-100"
                aria-label="Remove quote"
              >
                ×
              </button>
            </div>
          ))}
          {quotes.length === 0 && <p className="text-sm text-ink-400">No quotes yet.</p>}
        </div>
        {addingQuote ? (
          <input
            autoFocus
            value={newQuote}
            onChange={(e) => setNewQuote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAddQuote()
              if (e.key === 'Escape') {
                setAddingQuote(false)
                setNewQuote('')
              }
            }}
            onBlur={commitAddQuote}
            placeholder="Quote…"
            className="w-full text-sm bg-transparent outline-none border-b border-line-300 py-1 placeholder:text-ink-300"
          />
        ) : (
          <button
            onClick={() => setAddingQuote(true)}
            className="text-left text-sm text-ink-400 hover:text-accent-600 transition-colors"
          >
            + Add quote
          </button>
        )}
      </div>
    </div>
  )
}
