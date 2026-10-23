import { useEffect, useState } from 'react'
import type { Category, Settings, ThemeState } from '../../shared/types'
import type { Route } from '@renderer/lib/route'
import { EntryListView } from '@renderer/views/EntryListView'
import { EntryPage } from '@renderer/views/EntryPage'
import { HomeView } from '@renderer/views/HomeView'
import { SettingsView } from '@renderer/views/SettingsView'
import { Sidebar } from '@renderer/components/Sidebar'

function App(): JSX.Element {
  const [categories, setCategories] = useState<Category[]>([])
  const [route, setRoute] = useState<Route>({ kind: 'home' })
  const [openEntry, setOpenEntry] = useState<{ slug: string } | 'new' | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [fullWidth, setFullWidth] = useState(false)
  const [themeState, setThemeState] = useState<ThemeState | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    window.api.categories.list().then(setCategories)
  }, [refreshToken])

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  useEffect(() => {
    window.api.theme.get().then(setThemeState)
    const offThemeUpdate = window.api.theme.onUpdate(({ shouldUseDarkColors }) => {
      setThemeState((s) => (s ? { ...s, shouldUseDarkColors } : s))
    })
    return offThemeUpdate
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeState?.shouldUseDarkColors ?? false)
  }, [themeState?.shouldUseDarkColors])

  async function setThemeSource(source: Settings['themeSource']): Promise<void> {
    await window.api.theme.set(source)
    setThemeState(await window.api.theme.get())
  }

  async function updateSettings(patch: Partial<Settings>): Promise<void> {
    setSettings(await window.api.settings.update(patch))
  }

  const selectRoute = (r: Route): void => {
    setOpenEntry(null)
    setRoute(r)
  }

  const selectCategory = (id: number | null): void => selectRoute({ kind: 'category', id })

  const closeEntry = (): void => {
    setOpenEntry(null)
    setRefreshToken((t) => t + 1)
  }

  useEffect(() => {
    const offNewEntry = window.api.onMenu('menu:new-entry', () => setOpenEntry('new'))
    return offNewEntry
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      if (openEntry) closeEntry()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openEntry])

  const selectedCategory =
    route.kind === 'category' ? categories.find((c) => c.id === route.id) ?? null : null
  const selectedCategoryId = route.kind === 'category' ? route.id : null

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <div className="h-9 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          categories={categories}
          route={route}
          onSelectHome={() => selectRoute({ kind: 'home' })}
          onSelectSettings={() => selectRoute({ kind: 'settings' })}
          onSelectCategory={selectCategory}
          onCategoriesChanged={() => setRefreshToken((t) => t + 1)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className={fullWidth ? 'max-w-6xl mx-auto px-12 py-10' : 'max-w-2xl mx-auto px-12 py-10'}>
            {openEntry ? (
              <EntryPage
                entry={openEntry}
                categories={categories}
                currentCategoryId={selectedCategoryId}
                onDone={closeEntry}
                onSaved={() => setRefreshToken((t) => t + 1)}
                onFullWidthChange={setFullWidth}
              />
            ) : route.kind === 'home' ? (
              <HomeView settings={settings} onUpdateSettings={updateSettings} />
            ) : route.kind === 'settings' ? (
              <SettingsView
                settings={settings}
                onUpdateSettings={updateSettings}
                themeSource={themeState?.themeSource ?? 'system'}
                onSetTheme={setThemeSource}
              />
            ) : (
              <EntryListView
                category={selectedCategory}
                refreshToken={refreshToken}
                onOpenEntry={(slug) => setOpenEntry({ slug })}
                onNewEntry={() => setOpenEntry('new')}
                onCategoriesChanged={() => setRefreshToken((t) => t + 1)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
