import { ElectronAPI } from '@electron-toolkit/preload'
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

type MenuChannel = 'menu:new-entry' | 'menu:save'

interface Api {
  getVersion: () => Promise<string>
  posts: {
    list: (categoryId: number | null) => Promise<PostSummary[]>
    getBySlug: (slug: string) => Promise<PostDetail | null>
    create: (input: PostInput) => Promise<PostDetail>
    update: (id: number, input: PostInput) => Promise<PostDetail>
    updateBrainstorm: (id: number, text: string) => Promise<void>
    delete: (id: number) => Promise<void>
    listRevisions: (postId: number) => Promise<Revision[]>
    getRevision: (postId: number, revisionId: number) => Promise<RevisionDetail | null>
    revertToRevision: (postId: number, revisionId: number) => Promise<PostDetail>
  }
  categories: {
    list: () => Promise<Category[]>
    create: (name: string) => Promise<Category>
    rename: (id: number, name: string) => Promise<void>
    delete: (id: number) => Promise<void>
    reorder: (orderedIds: number[]) => Promise<void>
    contextMenu: () => Promise<'rename' | 'delete' | null>
    updateDescription: (id: number, description: string) => Promise<void>
    setFavorite: (id: number, favorite: boolean) => Promise<void>
  }
  media: {
    import: (sourcePath: string) => Promise<ImportedMedia>
    getPathForFile: (file: File) => string
  }
  onMenu: (channel: MenuChannel, callback: () => void) => () => void
  theme: {
    get: () => Promise<ThemeState>
    set: (source: ThemeSource) => Promise<void>
    onUpdate: (callback: (state: { shouldUseDarkColors: boolean }) => void) => () => void
  }
  settings: {
    get: () => Promise<Settings>
    update: (patch: Partial<Settings>) => Promise<Settings>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
