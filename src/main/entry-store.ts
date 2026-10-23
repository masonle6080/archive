import type Database from 'better-sqlite3'
import type {
  PostDetail,
  PostSummary,
  MediaItem,
  MediaInput,
  MediaType,
  PostInput,
  Category,
  Revision,
  RevisionDetail
} from '../shared/types'
import { slugify } from '../shared/slug'

// The content fields of an entry, defined once. Each maps an entry-shape field
// to the column that holds it in both the `post` and `post_revision` tables.
// Categories are the seventh content field; they live in their own table.
const CONTENT_COLUMNS = {
  title: 'title',
  excerpt: 'excerpt',
  body: 'body',
  coverImagePath: 'cover_image_path',
  coverImageCaption: 'cover_image_caption',
  brainstorm: 'brainstorm'
} as const

type ColumnField = keyof typeof CONTENT_COLUMNS
const COLUMN_FIELDS = Object.keys(CONTENT_COLUMNS) as ColumnField[]
const COLUMN_NAMES = COLUMN_FIELDS.map((f) => CONTENT_COLUMNS[f])
/** The content columns, comma-separated, for SELECT and INSERT lists. */
const COLUMN_LIST = COLUMN_NAMES.join(', ')
/** One `?` placeholder per content column, for INSERT values. */
const COLUMN_PLACEHOLDERS = COLUMN_NAMES.map(() => '?').join(', ')

// Fields where empty and missing count as equal for change detection.
const BLANK_EQUALS_MISSING: ReadonlySet<ColumnField> = new Set([
  'excerpt',
  'coverImageCaption',
  'brainstorm'
])

/** An entry's content: everything a revision captures. */
type Content = Pick<PostInput, ColumnField | 'categories'>

type ContentRow = Record<(typeof COLUMN_NAMES)[number], string | null>

/** Builds a content value from a reader that returns each column field. */
function buildContent(read: (field: ColumnField) => string | null, categories: string[]): Content {
  const content = { categories } as Record<string, unknown>
  for (const field of COLUMN_FIELDS) content[field] = read(field)
  return content as Content
}

function contentFromRow(row: ContentRow, categories: string[]): Content {
  return buildContent((field) => row[CONTENT_COLUMNS[field]], categories)
}

function contentValues(content: Content): (string | null)[] {
  return COLUMN_FIELDS.map((field) => content[field])
}

/** Picks just the content fields out of a larger shape, such as an input. */
function contentOf(source: Content): Content {
  return buildContent((field) => source[field], source.categories)
}

function sameCategories(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function contentChanged(current: Content, next: Content): boolean {
  const fieldChanged = COLUMN_FIELDS.some((field) =>
    BLANK_EQUALS_MISSING.has(field)
      ? (current[field] ?? '') !== (next[field] ?? '')
      : current[field] !== next[field]
  )
  return fieldChanged || !sameCategories(current.categories, next.categories)
}

interface EntryRow extends ContentRow {
  id: number
  slug: string
  created_at: string
  updated_at: string
}

interface RevisionRow extends ContentRow {
  id: number
  created_at: string
  categories: string
}

interface MediaRow {
  id: number
  type: MediaType
  file_path: string
  alt_text: string | null
  order: number
}

export interface EntryStore {
  list(categoryId: number | null): PostSummary[]
  getBySlug(slug: string): PostDetail | null
  create(input: PostInput): PostDetail
  update(id: number, input: PostInput): PostDetail
  updateBrainstorm(id: number, text: string): void
  delete(id: number): void
  listRevisions(entryId: number): Revision[]
  getRevision(entryId: number, revisionId: number): RevisionDetail | null
  revertToRevision(entryId: number, revisionId: number): PostDetail
  listCategories(): Category[]
  createCategory(name: string): Category
  renameCategory(id: number, name: string): void
  deleteCategory(id: number): void
  reorderCategories(orderedIds: number[]): void
  updateCategoryDescription(id: number, description: string): void
  setCategoryFavorite(id: number, favorite: boolean): void
}

// The entry store reads and writes entries, categories, and revisions in the
// given database. Every create, update, revert, and delete runs in one
// transaction. The store never deletes files: after each of those commits it
// calls `sweep`, which lets the media library free unreferenced files. A sweep
// failure is logged and never fails the committed write.
export function createEntryStore(db: Database.Database, sweep: () => void): EntryStore {
  const ENTRY_COLUMNS = `post.id, post.slug, post.created_at, post.updated_at, ${COLUMN_NAMES.map((c) => `post.${c}`).join(', ')}`

  function categoriesFor(entryId: number): string[] {
    const rows = db
      .prepare(
        `SELECT tag.name AS name
         FROM tag
         JOIN post_tag ON post_tag.tag_id = tag.id
         WHERE post_tag.post_id = ?
         ORDER BY tag.name ASC`
      )
      .all(entryId) as { name: string }[]
    return rows.map((r) => r.name)
  }

  function toDetailWithoutMedia(row: EntryRow): Omit<PostDetail, 'media'> {
    return {
      id: row.id,
      slug: row.slug,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...contentFromRow(row, categoriesFor(row.id))
    }
  }

  function toSummary(row: EntryRow): PostSummary {
    const { body, brainstorm, ...summary } = toDetailWithoutMedia(row)
    return summary
  }

  function list(categoryId: number | null): PostSummary[] {
    const rows = categoryId
      ? (db
          .prepare(
            `SELECT DISTINCT ${ENTRY_COLUMNS}
             FROM post
             JOIN post_tag ON post_tag.post_id = post.id
             WHERE post_tag.tag_id = ?
             ORDER BY post.created_at DESC`
          )
          .all(categoryId) as EntryRow[])
      : (db.prepare(`SELECT ${ENTRY_COLUMNS} FROM post ORDER BY post.created_at DESC`).all() as EntryRow[])

    return rows.map(toSummary)
  }

  function mediaFor(entryId: number): MediaItem[] {
    const rows = db
      .prepare(
        `SELECT id, type, file_path, alt_text, "order"
         FROM media
         WHERE post_id = ?
         ORDER BY "order" ASC`
      )
      .all(entryId) as MediaRow[]
    return rows.map((m) => ({
      id: m.id,
      type: m.type,
      filePath: m.file_path,
      altText: m.alt_text,
      order: m.order
    }))
  }

  function getBySlug(slug: string): PostDetail | null {
    const row = db.prepare(`SELECT ${ENTRY_COLUMNS} FROM post WHERE post.slug = ?`).get(slug) as
      | EntryRow
      | undefined
    if (!row) return null
    return { ...toDetailWithoutMedia(row), media: mediaFor(row.id) }
  }

  function getById(id: number): PostDetail {
    const row = db.prepare(`SELECT slug FROM post WHERE id = ?`).get(id) as { slug: string } | undefined
    if (!row) throw new Error('Entry not found')
    return getBySlug(row.slug) as PostDetail
  }

  function readContent(entryId: number): Content | null {
    const row = db.prepare(`SELECT ${COLUMN_LIST} FROM post WHERE id = ?`).get(entryId) as
      | ContentRow
      | undefined
    return row ? contentFromRow(row, categoriesFor(entryId)) : null
  }

  function snapshotRevision(entryId: number, content: Content): void {
    db.prepare(
      `INSERT INTO post_revision (post_id, ${COLUMN_LIST}, categories)
       VALUES (?, ${COLUMN_PLACEHOLDERS}, ?)`
    ).run(entryId, ...contentValues(content), JSON.stringify(content.categories))
  }

  function replaceCategories(entryId: number, categoryNames: string[]): void {
    db.prepare(`DELETE FROM post_tag WHERE post_id = ?`).run(entryId)

    const insertCategory = db.prepare(`INSERT OR IGNORE INTO tag (name, slug) VALUES (?, ?)`)
    const findCategory = db.prepare(`SELECT id FROM tag WHERE name = ?`)
    const linkCategory = db.prepare(`INSERT OR IGNORE INTO post_tag (post_id, tag_id) VALUES (?, ?)`)

    for (const rawName of categoryNames) {
      const name = rawName.trim()
      if (!name) continue
      insertCategory.run(name, slugify(name))
      const category = findCategory.get(name) as { id: number }
      linkCategory.run(entryId, category.id)
    }
  }

  function replaceMedia(entryId: number, media: MediaInput[]): void {
    db.prepare(`DELETE FROM media WHERE post_id = ?`).run(entryId)
    const insertMedia = db.prepare(
      `INSERT INTO media (post_id, type, file_path, alt_text, "order") VALUES (?, ?, ?, ?, ?)`
    )
    media.forEach((m, index) => insertMedia.run(entryId, m.type, m.filePath, m.altText, index))
  }

  /** The fields a save sets that a revision does not capture. */
  interface EntryFields {
    slug: string
    /** The gallery media, in order. */
    media: MediaInput[]
  }

  interface ContentWrite {
    /** The entry to write, or null to create one. */
    entryId: number | null
    content: Content
    /** The new slug and gallery media. Omit to keep the current ones (revert). */
    entryFields?: EntryFields
  }

  // The one content-write path for create, update, and revert. Call it inside
  // a transaction. Returns the entry id.
  function writeContent({ entryId, content, entryFields }: ContentWrite): number {
    let id: number
    if (entryId === null) {
      if (!entryFields) throw new Error('A new entry needs a slug and media')
      const result = db
        .prepare(
          `INSERT INTO post (slug, ${COLUMN_LIST}, status, published_at, updated_at)
           VALUES (?, ${COLUMN_PLACEHOLDERS}, 'published', ?, datetime('now'))`
        )
        .run(entryFields.slug, ...contentValues(content), new Date().toISOString())
      id = Number(result.lastInsertRowid)
    } else {
      const current = readContent(entryId)
      if (!current) throw new Error('Entry not found')
      if (contentChanged(current, content)) snapshotRevision(entryId, current)

      const assignments = COLUMN_NAMES.map((c) => `${c} = ?`)
      if (entryFields) assignments.unshift('slug = ?')
      db.prepare(
        `UPDATE post SET ${assignments.join(', ')}, updated_at = datetime('now') WHERE id = ?`
      ).run(...(entryFields ? [entryFields.slug] : []), ...contentValues(content), entryId)
      id = entryId
    }

    replaceCategories(id, content.categories)
    if (entryFields) replaceMedia(id, entryFields.media)
    return id
  }

  // Runs the sweep after a committed write. The write has already succeeded,
  // so a sweep failure only leaves unreferenced files for the next sweep.
  function sweepAfterCommit(): void {
    try {
      sweep()
    } catch (error) {
      console.error('Media sweep failed after a committed write:', error)
    }
  }

  function saveEntry(entryId: number | null, input: PostInput): PostDetail {
    const write = db.transaction(() =>
      writeContent({
        entryId,
        content: contentOf(input),
        entryFields: { slug: input.slug, media: input.media }
      })
    )
    const id = write()
    sweepAfterCommit()
    return getById(id)
  }

  function create(input: PostInput): PostDetail {
    return saveEntry(null, input)
  }

  function update(id: number, input: PostInput): PostDetail {
    // An update on a missing entry writes nothing and, as before the entry
    // store existed, returns the entry at the input slug (null if none).
    const exists = db.prepare(`SELECT 1 FROM post WHERE id = ?`).get(id)
    if (!exists) return getBySlug(input.slug) as PostDetail
    return saveEntry(id, input)
  }

  function revertToRevision(entryId: number, revisionId: number): PostDetail {
    db.transaction(() => {
      const revision = getRevision(entryId, revisionId)
      if (!revision) throw new Error('Revision not found')
      // writeContent snapshots the pre-revert content only when it differs
      // from the target, so a revert can itself be undone.
      writeContent({ entryId, content: contentOf(revision) })
    })()
    sweepAfterCommit()
    return getById(entryId)
  }

  function updateBrainstorm(id: number, text: string): void {
    db.prepare(`UPDATE post SET brainstorm = ? WHERE id = ?`).run(text, id)
  }

  function deleteEntry(id: number): void {
    // ON DELETE CASCADE removes the media, post_tag, and revision rows, so
    // the sweep frees every file only this entry and its revisions used.
    db.transaction(() => {
      db.prepare(`DELETE FROM post WHERE id = ?`).run(id)
    })()
    sweepAfterCommit()
  }

  function listRevisions(entryId: number): Revision[] {
    return db
      .prepare(
        `SELECT id, created_at AS createdAt, title
         FROM post_revision
         WHERE post_id = ?
         ORDER BY created_at DESC, id DESC`
      )
      .all(entryId) as Revision[]
  }

  function getRevision(entryId: number, revisionId: number): RevisionDetail | null {
    const row = db
      .prepare(
        `SELECT id, created_at, ${COLUMN_LIST}, categories
         FROM post_revision WHERE id = ? AND post_id = ?`
      )
      .get(revisionId, entryId) as RevisionRow | undefined
    if (!row) return null
    return {
      id: row.id,
      createdAt: row.created_at,
      ...contentFromRow(row, JSON.parse(row.categories) as string[])
    }
  }

  function listCategories(): Category[] {
    const rows = db
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

  function updateCategoryDescription(id: number, description: string): void {
    db.prepare(`UPDATE tag SET description = ? WHERE id = ?`).run(description || null, id)
  }

  function setCategoryFavorite(id: number, favorite: boolean): void {
    db.prepare(`UPDATE tag SET favorite = ? WHERE id = ?`).run(favorite ? 1 : 0, id)
  }

  function reorderCategories(orderedIds: number[]): void {
    const update = db.prepare(`UPDATE tag SET sort_order = ? WHERE id = ?`)
    db.transaction(() => {
      orderedIds.forEach((id, index) => update.run(index, id))
    })()
  }

  function createCategory(name: string): Category {
    const trimmed = name.trim()
    const nextOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tag`).get() as {
      next: number
    }
    db.prepare(`INSERT OR IGNORE INTO tag (name, slug, sort_order) VALUES (?, ?, ?)`).run(
      trimmed,
      slugify(trimmed),
      nextOrder.next
    )
    const row = db.prepare(`SELECT id, name FROM tag WHERE name = ?`).get(trimmed) as {
      id: number
      name: string
    }
    return { id: row.id, name: row.name, count: 0, description: null, favorite: false }
  }

  function renameCategory(id: number, name: string): void {
    const trimmed = name.trim()
    db.prepare(`UPDATE tag SET name = ?, slug = ? WHERE id = ?`).run(trimmed, slugify(trimmed), id)
  }

  function deleteCategory(id: number): void {
    db.prepare(`DELETE FROM tag WHERE id = ?`).run(id)
  }

  return {
    list,
    getBySlug,
    create,
    update,
    updateBrainstorm,
    // `delete` is a reserved word, so the function cannot share its name.
    delete: deleteEntry,
    listRevisions,
    getRevision,
    revertToRevision,
    listCategories,
    createCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
    updateCategoryDescription,
    setCategoryFavorite
  }
}
