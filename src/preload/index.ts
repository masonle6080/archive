import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  PostSummary,
  PostDetail,
  PostInput,
  ImportedMedia,
  Category,
  Revision,
  RevisionDetail,
  ThemeSource,
  ThemeState,
  Settings
} from '../shared/types'

const MENU_CHANNELS = ['menu:new-entry', 'menu:save'] as const
type MenuChannel = (typeof MENU_CHANNELS)[number]

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  posts: {
    list: (categoryId: number | null): Promise<PostSummary[]> =>
      ipcRenderer.invoke('posts:list', categoryId),
    getBySlug: (slug: string): Promise<PostDetail | null> =>
      ipcRenderer.invoke('posts:getBySlug', slug),
    create: (input: PostInput): Promise<PostDetail> => ipcRenderer.invoke('posts:create', input),
    update: (id: number, input: PostInput): Promise<PostDetail> =>
      ipcRenderer.invoke('posts:update', id, input),
    updateBrainstorm: (id: number, text: string): Promise<void> =>
      ipcRenderer.invoke('posts:updateBrainstorm', id, text),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('posts:delete', id),
    listRevisions: (postId: number): Promise<Revision[]> =>
      ipcRenderer.invoke('posts:listRevisions', postId),
    getRevision: (postId: number, revisionId: number): Promise<RevisionDetail | null> =>
      ipcRenderer.invoke('posts:getRevision', postId, revisionId),
    revertToRevision: (postId: number, revisionId: number): Promise<PostDetail> =>
      ipcRenderer.invoke('posts:revertToRevision', postId, revisionId)
  },
  categories: {
    list: (): Promise<Category[]> => ipcRenderer.invoke('categories:list'),
    create: (name: string): Promise<Category> => ipcRenderer.invoke('categories:create', name),
    rename: (id: number, name: string): Promise<void> =>
      ipcRenderer.invoke('categories:rename', id, name),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('categories:delete', id),
    reorder: (orderedIds: number[]): Promise<void> =>
      ipcRenderer.invoke('categories:reorder', orderedIds),
    contextMenu: (): Promise<'rename' | 'delete' | null> =>
      ipcRenderer.invoke('categories:contextMenu'),
    updateDescription: (id: number, description: string): Promise<void> =>
      ipcRenderer.invoke('categories:updateDescription', id, description),
    setFavorite: (id: number, favorite: boolean): Promise<void> =>
      ipcRenderer.invoke('categories:setFavorite', id, favorite)
  },
  media: {
    import: (sourcePath: string): Promise<ImportedMedia> =>
      ipcRenderer.invoke('media:import', sourcePath),
    getPathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  onMenu: (channel: MenuChannel, callback: () => void): (() => void) => {
    if (!MENU_CHANNELS.includes(channel)) throw new Error(`Unknown menu channel: ${channel}`)
    const listener = (): void => callback()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  theme: {
    get: (): Promise<ThemeState> => ipcRenderer.invoke('theme:get'),
    set: (source: ThemeSource): Promise<void> => ipcRenderer.invoke('theme:set', source),
    onUpdate: (callback: (state: { shouldUseDarkColors: boolean }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: { shouldUseDarkColors: boolean }): void =>
        callback(state)
      ipcRenderer.on('theme:updated', listener)
      return () => ipcRenderer.removeListener('theme:updated', listener)
    }
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke('settings:update', patch)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
