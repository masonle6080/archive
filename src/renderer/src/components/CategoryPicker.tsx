import type { Category } from '../../../shared/types'

export function CategoryPicker({
  categories,
  selected,
  onChange
}: {
  categories: Category[]
  selected: string[]
  onChange: (names: string[]) => void
}): JSX.Element {
  function toggle(name: string): void {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    )
  }

  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-bark-400 mb-2">
        Categories
      </label>
      {categories.length === 0 ? (
        <p className="text-sm text-bark-400">
          No categories yet — add one from Manage categories first.
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(c.name)}
                onChange={() => toggle(c.name)}
                className="accent-terracotta-600"
              />
              <span className={selected.includes(c.name) ? 'text-terracotta-600' : 'text-bark-600'}>
                {c.name}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
