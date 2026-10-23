import {
  app,
  shell,
  BrowserWindow,
  Menu,
  ipcMain,
  protocol,
  nativeImage,
  nativeTheme
} from 'electron'
import { join, resolve, sep, extname } from 'path'
import { statSync, openSync, readSync, closeSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb, getMediaDir } from './db'
import { getThemeSource, setThemeSource, getSettings, updateSettings } from './settings'
import type { ThemeSource, Settings } from '../shared/types'
import {
  listEntries,
  getPostBySlug,
  listCategoriesWithCounts,
  createCategory,
  renameCategory,
  deleteCategory,
  reorderCategories,
  updateCategoryDescription,
  setCategoryFavorite,
  createPost,
  updatePost,
  updateBrainstorm,
  deletePost,
  listRevisions,
  getRevision,
  revertToRevision
} from './posts'
import { importMedia } from './media'
import type { PostInput } from '../shared/types'

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true } }
])

const MEDIA_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v'
}

const iconPath = join(__dirname, '../../build/icon.png')

function createWindow(): BrowserWindow {
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
      sandbox: false
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

app.whenReady().then(() => {
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

  // Initialize the local SQLite database (creates schema + media dir on first run)
  getDb()

  // Cap how much of a file we read per request. Chromium's media pipeline
  // issues concurrent/superseding range requests when scrubbing to find a
  // moov atom at the end of a non-fast-start video, and Electron's
  // protocol.handle has a cancellation race with long-lived streamed
  // Response bodies on large files that corrupts those concurrent reads.
  // Bounded synchronous reads (no live stream to race against) sidestep it.
  const MEDIA_CHUNK_SIZE = 8 * 1024 * 1024

  protocol.handle('media', (request) => {
    const url = new URL(request.url)
    const fileName = decodeURIComponent(url.hostname)
    const mediaDir = resolve(getMediaDir())
    const filePath = resolve(mediaDir, fileName)

    if (filePath !== mediaDir && !filePath.startsWith(mediaDir + sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(filePath)
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const contentType = MEDIA_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.get('range')

    let start = 0
    let end = stat.size - 1
    let partial = false

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) {
        return new Response('Invalid range', { status: 416 })
      }
      start = match[1] ? parseInt(match[1], 10) : stat.size - parseInt(match[2], 10)
      end = match[2] && match[1] ? parseInt(match[2], 10) : stat.size - 1
      if (start >= stat.size || end >= stat.size || start > end) {
        return new Response('Range not satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` }
        })
      }
      partial = true
    }

    if (end - start + 1 > MEDIA_CHUNK_SIZE) {
      end = start + MEDIA_CHUNK_SIZE - 1
      partial = true
    }

    const length = end - start + 1
    const buffer = Buffer.alloc(length)
    const fd = openSync(filePath, 'r')
    try {
      readSync(fd, buffer, 0, length, start)
    } finally {
      closeSync(fd)
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    }
    if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`

    return new Response(buffer, { status: partial ? 206 : 200, headers })
  })

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
  ipcMain.handle('posts:list', (_event, categoryId: number | null) => listEntries(categoryId))
  ipcMain.handle('posts:getBySlug', (_event, slug: string) => getPostBySlug(slug))
  ipcMain.handle('posts:create', (_event, input: PostInput) => createPost(input))
  ipcMain.handle('posts:update', (_event, id: number, input: PostInput) => updatePost(id, input))
  ipcMain.handle('posts:updateBrainstorm', (_event, id: number, text: string) =>
    updateBrainstorm(id, text)
  )
  ipcMain.handle('posts:delete', (_event, id: number) => deletePost(id))
  ipcMain.handle('posts:listRevisions', (_event, postId: number) => listRevisions(postId))
  ipcMain.handle('posts:getRevision', (_event, postId: number, revisionId: number) =>
    getRevision(postId, revisionId)
  )
  ipcMain.handle('posts:revertToRevision', (_event, postId: number, revisionId: number) =>
    revertToRevision(postId, revisionId)
  )
  ipcMain.handle('categories:list', () => listCategoriesWithCounts())
  ipcMain.handle('categories:create', (_event, name: string) => createCategory(name))
  ipcMain.handle('categories:rename', (_event, id: number, name: string) =>
    renameCategory(id, name)
  )
  ipcMain.handle('categories:delete', (_event, id: number) => deleteCategory(id))
  ipcMain.handle('categories:reorder', (_event, orderedIds: number[]) =>
    reorderCategories(orderedIds)
  )
  ipcMain.handle('categories:updateDescription', (_event, id: number, description: string) =>
    updateCategoryDescription(id, description)
  )
  ipcMain.handle('categories:setFavorite', (_event, id: number, favorite: boolean) =>
    setCategoryFavorite(id, favorite)
  )
  ipcMain.handle('media:import', (_event, sourcePath: string) => importMedia(sourcePath))
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
