export type MediaType = 'image' | 'video'

export interface PostSummary {
  id: number
  slug: string
  title: string
  excerpt: string | null
  coverImagePath: string | null
  coverImageCaption: string | null
  createdAt: string
  updatedAt: string
  categories: string[]
}

export interface MediaItem {
  id: number
  type: MediaType
  filePath: string
  altText: string | null
  order: number
}

export interface PostDetail extends PostSummary {
  body: string
  brainstorm: string | null
  media: MediaItem[]
}

export interface MediaInput {
  type: MediaType
  filePath: string
  altText: string | null
}

export interface PostInput {
  slug: string
  title: string
  excerpt: string | null
  body: string
  coverImagePath: string | null
  coverImageCaption: string | null
  brainstorm: string | null
  categories: string[]
  media: MediaInput[]
}

export interface ImportedMedia {
  fileName: string
  type: MediaType
}

export interface Category {
  id: number
  name: string
  count: number
  description: string | null
  favorite: boolean
}

export interface Revision {
  id: number
  createdAt: string
  title: string
}

export interface RevisionDetail extends Revision {
  excerpt: string | null
  body: string
  coverImagePath: string | null
  coverImageCaption: string | null
  brainstorm: string | null
  categories: string[]
}

export type ThemeSource = 'system' | 'light' | 'dark'

export interface ThemeState {
  themeSource: ThemeSource
  shouldUseDarkColors: boolean
}

export interface Settings {
  userName: string
  quotes: string[]
  goals: string[]
  themeSource: ThemeSource
}
