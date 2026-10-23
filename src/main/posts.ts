import { join } from 'path'
import { unlinkSync } from 'fs'
import type Database from 'better-sqlite3'
import { getDb, getMediaDir } from './db'
import type {
  PostDetail,
  PostSummary,
  MediaItem,
  MediaType,
  PostInput,
  Category,
  Revision,
  RevisionDetail
} from '../shared/types'

interface PostRow {
  id: number
  slug: string
  title: string
  excerpt: string | null
  body: string
  cover_image_path: string | null
  cover_image_caption: string | null
  brainstorm: string | null
  created_at: string
  updated_at: string
}

interface MediaRow {
  id: number
  type: MediaType
  file_path: string
  alt_text: string | null
  order: number
}

function categoriesForPost(postId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT tag.name AS name
       FROM tag
       JOIN post_tag ON post_tag.tag_id = tag.id
       WHERE post_tag.post_id = ?
       ORDER BY tag.name ASC`
    )
    .all(postId) as { name: string }[]
  return rows.map((r) => r.name)
}

function toSummary(row: PostRow): PostSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverImagePath: row.cover_image_path,
    coverImageCaption: row.cover_image_caption,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categories: categoriesForPost(row.id)
  }
}

const POST_COLUMNS = `id, slug, title, excerpt, body, cover_image_path, cover_image_caption, brainstorm, created_at, updated_at`
const POST_COLUMNS_QUALIFIED = `post.id, post.slug, post.title, post.excerpt, post.body, post.cover_image_path, post.cover_image_caption, post.brainstorm, post.created_at, post.updated_at`

export function listEntries(categoryId: number | null): PostSummary[] {
  const db = getDb()

  const rows = categoryId
    ? (db
        .prepare(
          `SELECT DISTINCT ${POST_COLUMNS_QUALIFIED}
           FROM post
           JOIN post_tag ON post_tag.post_id = post.id
           WHERE post_tag.tag_id = ?
           ORDER BY post.created_at DESC`
        )
        .all(categoryId) as PostRow[])
    : (db.prepare(`SELECT ${POST_COLUMNS} FROM post ORDER BY created_at DESC`).all() as PostRow[])

  return rows.map(toSummary)
}

export function getPostBySlug(slug: string): PostDetail | null {
  const db = getDb()

  const row = db.prepare(`SELECT ${POST_COLUMNS} FROM post WHERE slug = ?`).get(slug) as
    | PostRow
    | undefined

  if (!row) return null

  const mediaRows = db
    .prepare(
      `SELECT id, type, file_path, alt_text, "order"
       FROM media
       WHERE post_id = ?
       ORDER BY "order" ASC`
    )
    .all(row.id) as MediaRow[]

  const media: MediaItem[] = mediaRows.map((m) => ({
    id: m.id,
    type: m.type,
    filePath: m.file_path,
    altText: m.alt_text,
    order: m.order
  }))

  return { ...toSummary(row), body: row.body, brainstorm: row.brainstorm, media }
}

export function listCategoriesWithCounts(): Category[] {
  const rows = getDb()
    .prepare(
      `SELECT tag.id AS id, tag.name AS name, tag.description AS description, tag.favorite AS favorite,
              COUNT(post_tag.post_id) AS count
       FROM tag
       LEFT JOIN post_tag ON post_tag.tag_id = tag.id
       GROUP BY tag.id
       ORDER BY tag.favorite DESC, tag.sort_order ASC, tag.id ASC`
    )
    .all() as (Omit<Category, 'favorite'> & { favorite: number })[]
  return rows.map((r) => ({ ...r, favorite: !!r.favorite }))
}

export function updateCategoryDescription(id: number, description: string): void {
  getDb()
    .prepare(`UPDATE tag SET description = ? WHERE id = ?`)
    .run(description || null, id)
}

export function setCategoryFavorite(id: number, favorite: boolean): void {
  getDb()
    .prepare(`UPDATE tag SET favorite = ? WHERE id = ?`)
    .run(favorite ? 1 : 0, id)
}

export function reorderCategories(orderedIds: number[]): void {
  const db = getDb()
  const update = db.prepare(`UPDATE tag SET sort_order = ? WHERE id = ?`)
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id))
  })()
}

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function createCategory(name: string): Category {
  const db = getDb()
  const trimmed = name.trim()
  const nextOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tag`).get() as {
    next: number
  }
  db.prepare(`INSERT OR IGNORE INTO tag (name, slug, sort_order) VALUES (?, ?, ?)`).run(
    trimmed,
    slugifyCategory(trimmed),
    nextOrder.next
  )
  const row = db.prepare(`SELECT id, name FROM tag WHERE name = ?`).get(trimmed) as {
    id: number
    name: string
  }
  return { id: row.id, name: row.name, count: 0, description: null, favorite: false }
}

export function renameCategory(id: number, name: string): void {
  const trimmed = name.trim()
  getDb()
    .prepare(`UPDATE tag SET name = ?, slug = ? WHERE id = ?`)
    .run(trimmed, slugifyCategory(trimmed), id)
}

export function deleteCategory(id: number): void {
  getDb().prepare(`DELETE FROM tag WHERE id = ?`).run(id)
}

function setPostCategories(db: Database.Database, postId: number, categoryNames: string[]): void {
  db.prepare(`DELETE FROM post_tag WHERE post_id = ?`).run(postId)

  const insertCategory = db.prepare(`INSERT OR IGNORE INTO tag (name, slug) VALUES (?, ?)`)
  const findCategory = db.prepare(`SELECT id FROM tag WHERE name = ?`)
  const linkCategory = db.prepare(`INSERT OR IGNORE INTO post_tag (post_id, tag_id) VALUES (?, ?)`)

  for (const rawName of categoryNames) {
    const name = rawName.trim()
    if (!name) continue
    insertCategory.run(name, slugifyCategory(name))
    const category = findCategory.get(name) as { id: number }
    linkCategory.run(postId, category.id)
  }
}

function setPostMedia(db: Database.Database, postId: number, media: PostInput['media']): void {
  const existing = db
    .prepare(`SELECT file_path FROM media WHERE post_id = ?`)
    .all(postId) as { file_path: string }[]

  const keptPaths = new Set(media.map((m) => m.filePath))
  const mediaDir = getMediaDir()

  for (const row of existing) {
    if (!keptPaths.has(row.file_path)) {
      try {
        unlinkSync(join(mediaDir, row.file_path))
      } catch {
        // file already gone — nothing to clean up
      }
    }
  }

  db.prepare(`DELETE FROM media WHERE post_id = ?`).run(postId)

  const insertMedia = db.prepare(
    `INSERT INTO media (post_id, type, file_path, alt_text, "order") VALUES (?, ?, ?, ?, ?)`
  )
  media.forEach((m, index) => {
    insertMedia.run(postId, m.type, m.filePath, m.altText, index)
  })
}

export function createPost(input: PostInput): PostDetail {
  const db = getDb()

  const now = new Date().toISOString()

  const result = db
    .prepare(
      `INSERT INTO post (slug, title, excerpt, body, cover_image_path, cover_image_caption, brainstorm, status, published_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, datetime('now'))`
    )
    .run(
      input.slug,
      input.title,
      input.excerpt,
      input.body,
      input.coverImagePath,
      input.coverImageCaption,
      input.brainstorm,
      now
    )

  const postId = Number(result.lastInsertRowid)
  setPostCategories(db, postId, input.categories)
  setPostMedia(db, postId, input.media)

  return getPostBySlug(input.slug) as PostDetail
}

interface ContentFields {
  title: string
  excerpt: string | null
  body: string
  coverImagePath: string | null
  coverImageCaption: string | null
  brainstorm: string | null
  categories: string[]
}

function categoriesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function contentChanged(current: ContentFields, next: ContentFields): boolean {
  return (
    current.title !== next.title ||
    (current.excerpt ?? '') !== (next.excerpt ?? '') ||
    current.body !== next.body ||
    current.coverImagePath !== next.coverImagePath ||
    (current.coverImageCaption ?? '') !== (next.coverImageCaption ?? '') ||
    (current.brainstorm ?? '') !== (next.brainstorm ?? '') ||
    !categoriesEqual(current.categories, next.categories)
  )
}

function currentContentFields(db: Database.Database, postId: number): ContentFields | null {
  const row = db
    .prepare(
      `SELECT title, excerpt, body, cover_image_path, cover_image_caption, brainstorm FROM post WHERE id = ?`
    )
    .get(postId) as
    | {
        title: string
        excerpt: string | null
        body: string
        cover_image_path: string | null
        cover_image_caption: string | null
        brainstorm: string | null
      }
    | undefined
  if (!row) return null

  return {
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    coverImagePath: row.cover_image_path,
    coverImageCaption: row.cover_image_caption,
    brainstorm: row.brainstorm,
    categories: categoriesForPost(postId)
  }
}

function snapshotRevision(db: Database.Database, postId: number): void {
  const row = db
    .prepare(
      `SELECT title, excerpt, body, cover_image_path, cover_image_caption, brainstorm FROM post WHERE id = ?`
    )
    .get(postId) as
    | {
        title: string
        excerpt: string | null
        body: string
        cover_image_path: string | null
        cover_image_caption: string | null
        brainstorm: string | null
      }
    | undefined
  if (!row) return

  db.prepare(
    `INSERT INTO post_revision (post_id, title, excerpt, body, cover_image_path, cover_image_caption, brainstorm, categories)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    postId,
    row.title,
    row.excerpt,
    row.body,
    row.cover_image_path,
    row.cover_image_caption,
    row.brainstorm,
    JSON.stringify(categoriesForPost(postId))
  )
}

export function listRevisions(postId: number): Revision[] {
  return getDb()
    .prepare(
      `SELECT id, created_at AS createdAt, title
       FROM post_revision
       WHERE post_id = ?
       ORDER BY created_at DESC`
    )
    .all(postId) as Revision[]
}

export function getRevision(postId: number, revisionId: number): RevisionDetail | null {
  const row = getDb()
    .prepare(
      `SELECT id, created_at AS createdAt, title, excerpt, body,
              cover_image_path AS coverImagePath, cover_image_caption AS coverImageCaption,
              brainstorm, categories
       FROM post_revision WHERE id = ? AND post_id = ?`
    )
    .get(revisionId, postId) as
    | {
        id: number
        createdAt: string
        title: string
        excerpt: string | null
        body: string
        coverImagePath: string | null
        coverImageCaption: string | null
        brainstorm: string | null
        categories: string
      }
    | undefined
  if (!row) return null

  return { ...row, categories: JSON.parse(row.categories) as string[] }
}

export function revertToRevision(postId: number, revisionId: number): PostDetail {
  const db = getDb()

  const revision = db
    .prepare(
      `SELECT title, excerpt, body, cover_image_path, cover_image_caption, brainstorm, categories
       FROM post_revision WHERE id = ? AND post_id = ?`
    )
    .get(revisionId, postId) as
    | {
        title: string
        excerpt: string | null
        body: string
        cover_image_path: string | null
        cover_image_caption: string | null
        brainstorm: string | null
        categories: string
      }
    | undefined
  if (!revision) throw new Error('Revision not found')

  const current = currentContentFields(db, postId)
  const target: ContentFields = {
    title: revision.title,
    excerpt: revision.excerpt,
    body: revision.body,
    coverImagePath: revision.cover_image_path,
    coverImageCaption: revision.cover_image_caption,
    brainstorm: revision.brainstorm,
    categories: JSON.parse(revision.categories) as string[]
  }

  // Snapshot the current (pre-revert) state too, so reverting is itself
  // reversible through the same history list — but only if it's actually
  // different from what we're reverting to.
  if (current && contentChanged(current, target)) {
    snapshotRevision(db, postId)
  }

  db.prepare(
    `UPDATE post
     SET title = ?, excerpt = ?, body = ?, cover_image_path = ?, cover_image_caption = ?, brainstorm = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    revision.title,
    revision.excerpt,
    revision.body,
    revision.cover_image_path,
    revision.cover_image_caption,
    revision.brainstorm,
    postId
  )

  setPostCategories(db, postId, JSON.parse(revision.categories) as string[])

  const slugRow = db.prepare(`SELECT slug FROM post WHERE id = ?`).get(postId) as { slug: string }
  return getPostBySlug(slugRow.slug) as PostDetail
}

export function updatePost(id: number, input: PostInput): PostDetail {
  const db = getDb()

  const current = currentContentFields(db, id)
  if (
    current &&
    contentChanged(current, {
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImagePath: input.coverImagePath,
      coverImageCaption: input.coverImageCaption,
      brainstorm: input.brainstorm,
      categories: input.categories
    })
  ) {
    snapshotRevision(db, id)
  }

  db.prepare(
    `UPDATE post
     SET slug = ?, title = ?, excerpt = ?, body = ?, cover_image_path = ?, cover_image_caption = ?, brainstorm = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    input.slug,
    input.title,
    input.excerpt,
    input.body,
    input.coverImagePath,
    input.coverImageCaption,
    input.brainstorm,
    id
  )

  setPostCategories(db, id, input.categories)
  setPostMedia(db, id, input.media)

  return getPostBySlug(input.slug) as PostDetail
}

export function updateBrainstorm(id: number, text: string): void {
  getDb().prepare(`UPDATE post SET brainstorm = ? WHERE id = ?`).run(text, id)
}

export function deletePost(id: number): void {
  const db = getDb()

  const row = db
    .prepare(`SELECT cover_image_path FROM post WHERE id = ?`)
    .get(id) as { cover_image_path: string | null } | undefined
  if (!row) return

  const mediaRows = db.prepare(`SELECT file_path FROM media WHERE post_id = ?`).all(id) as {
    file_path: string
  }[]

  const mediaDir = getMediaDir()
  const filesToRemove = mediaRows.map((m) => m.file_path)
  if (row.cover_image_path) filesToRemove.push(row.cover_image_path)

  for (const fileName of filesToRemove) {
    try {
      unlinkSync(join(mediaDir, fileName))
    } catch {
      // file already gone — nothing to clean up
    }
  }

  // ON DELETE CASCADE removes the media and post_tag rows.
  db.prepare(`DELETE FROM post WHERE id = ?`).run(id)
}
