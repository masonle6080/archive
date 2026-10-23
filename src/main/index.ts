import {
  app,
  shell,
  BrowserWindow,
  Menu,
  ipcMain,
  nativeImage,
  nativeTheme
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getThemeSource, setThemeSource, getSettings, updateSettings } from './settings'
import type { ThemeSource, Settings, PostInput } from '../shared/types'
import { openArchive } from './archive'
import { findFfmpeg } from './ffmpeg'
import { startMediaServer } from './media-server'

const iconPath = join(__dirname, '../../build/icon.png')

function createWindow(mediaBaseUrl: string): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1815' : '#f5f1e8',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // The preload reads this to build media URLs.
      additionalArguments: [`--media-base-url=${mediaBaseUrl}`]
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function send(channel: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(channel)
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Entry',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('menu:new-entry')
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'Entry',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('menu:save')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' as const }, { role: 'zoom' as const }]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Keep the on-disk data directory stable across renames — the display name
// ("Archive") is decoupled from where the SQLite DB and media files live,
// so renaming the app again later won't orphan existing posts.
app.setName('Archive')
app.setPath('userData', join(app.getPath('appData'), 'field-notes'))

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.fieldnotes.app')

  // Restore the user's theme choice before anything paints — nativeTheme
  // doesn't persist this itself across launches.
  nativeTheme.themeSource = getThemeSource()

  nativeTheme.on('updated', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('theme:updated', { shouldUseDarkColors: nativeTheme.shouldUseDarkColors })
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  if (is.dev && process.platform === 'darwin') {
    app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  }

  // Open the archive once, in the same data folder as before: the SQLite
  // database and media files live under userData.
  const userDataDir = app.getPath('userData')
  const archive = openArchive({
    db: join(userDataDir, 'blog.db'),
    mediaDir: join(userDataDir, 'media'),
    ffmpegPath: findFfmpeg()
  })

  const mediaServer = await startMediaServer(archive.media.serve)
  app.on('will-quit', () => void mediaServer.close())

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('theme:get', () => ({
    themeSource: nativeTheme.themeSource,
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors
  }))
  ipcMain.handle('theme:set', (_event, source: ThemeSource) => {
    nativeTheme.themeSource = source
    setThemeSource(source)
  })
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => updateSettings(patch))
  ipcMain.handle('posts:list', (_event, categoryId: number | null) => archive.entries.list(categoryId))
  ipcMain.handle('posts:getBySlug', (_event, slug: string) => archive.entries.getBySlug(slug))
  ipcMain.handle('posts:create', (_event, input: PostInput) => archive.entries.create(input))
  ipcMain.handle('posts:update', (_event, id: number, input: PostInput) => archive.entries.update(id, input))
  ipcMain.handle('posts:updateBrainstorm', (_event, id: number, text: string) =>
    archive.entries.updateBrainstorm(id, text)
  )
  ipcMain.handle('posts:delete', (_event, id: number) => archive.entries.delete(id))
  ipcMain.handle('posts:listRevisions', (_event, postId: number) => archive.entries.listRevisions(postId))
  ipcMain.handle('posts:getRevision', (_event, postId: number, revisionId: number) =>
    archive.entries.getRevision(postId, revisionId)
  )
  ipcMain.handle('posts:revertToRevision', (_event, postId: number, revisionId: number) =>
    archive.entries.revertToRevision(postId, revisionId)
  )
  ipcMain.handle('categories:list', () => archive.entries.listCategories())
  ipcMain.handle('categories:create', (_event, name: string) => archive.entries.createCategory(name))
  ipcMain.handle('categories:rename', (_event, id: number, name: string) =>
    archive.entries.renameCategory(id, name)
  )
  ipcMain.handle('categories:delete', (_event, id: number) => archive.entries.deleteCategory(id))
  ipcMain.handle('categories:reorder', (_event, orderedIds: number[]) =>
    archive.entries.reorderCategories(orderedIds)
  )
  ipcMain.handle('categories:updateDescription', (_event, id: number, description: string) =>
    archive.entries.updateCategoryDescription(id, description)
  )
  ipcMain.handle('categories:setFavorite', (_event, id: number, favorite: boolean) =>
    archive.entries.setCategoryFavorite(id, favorite)
  )
  ipcMain.handle('media:import', (_event, sourcePath: string) => archive.media.import(sourcePath))
  ipcMain.handle('categories:contextMenu', (event) => {
    return new Promise<'rename' | 'delete' | null>((resolve) => {
      let resolved = false
      const settle = (value: 'rename' | 'delete' | null): void => {
        if (resolved) return
        resolved = true
        resolve(value)
      }
      const menu = Menu.buildFromTemplate([
        { label: 'Rename', click: () => settle('rename') },
        { label: 'Delete', click: () => settle('delete') }
      ])
      menu.popup({
        window: BrowserWindow.fromWebContents(event.sender) ?? undefined,
        callback: () => settle(null)
      })
    })
  })

  buildMenu()
  createWindow(mediaServer.baseUrl)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(mediaServer.baseUrl)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
