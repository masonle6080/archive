import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openArchive, type Archive } from './archive'
import type { PostInput } from '../shared/types'

// Entry store behaviour, driven only through the archive seam.

let mediaDir: string
let archive: Archive

beforeEach(() => {
  mediaDir = join(mkdtempSync(join(tmpdir(), 'entry-store-test-')), 'media')
  archive = openArchive({ db: ':memory:', mediaDir })
})

afterEach(() => {
  archive.close()
  rmSync(join(mediaDir, '..'), { recursive: true, force: true })
})

function entryInput(overrides: Partial<PostInput> = {}): PostInput {
  return {
    slug: 'first-light',
    title: 'First light',
    excerpt: 'Morning on the ridge',
    body: 'The sun came up over the ridge.',
    coverImagePath: 'cover-a.jpg',
    coverImageCaption: 'The ridge at dawn',
    brainstorm: 'ideas',
    categories: ['Travel', 'Notes'],
    media: [
      { type: 'image', filePath: 'one.jpg', altText: 'First photo' },
      { type: 'video', filePath: 'two.mp4', altText: null }
    ],
    ...overrides
  }
}

describe('entry update atomicity', () => {
  it('a failed update leaves no revision, no row change, and no category change', () => {
    const entry = archive.entries.create(entryInput())
    archive.entries.create(entryInput({ slug: 'second-light', title: 'Second light' }))

    expect(() =>
      archive.entries.update(
        entry.id,
        entryInput({ slug: 'second-light', title: 'Changed title', categories: ['Other'] })
      )
    ).toThrow()

    expect(archive.entries.listRevisions(entry.id)).toEqual([])
    expect(archive.entries.getBySlug('first-light')).toEqual(entry)
    expect(archive.entries.listCategories().map((c) => c.name).sort()).toEqual(['Notes', 'Travel'])
  })
})

describe('entry content round-trip', () => {
  it('create then get by slug returns every content field, the categories, and the gallery media', () => {
    archive.entries.create(entryInput())

    const entry = archive.entries.getBySlug('first-light')

    expect(entry).toMatchObject({
      slug: 'first-light',
      title: 'First light',
      excerpt: 'Morning on the ridge',
      body: 'The sun came up over the ridge.',
      coverImagePath: 'cover-a.jpg',
      coverImageCaption: 'The ridge at dawn',
      brainstorm: 'ideas',
      categories: ['Notes', 'Travel'],
      media: [
        { type: 'image', filePath: 'one.jpg', altText: 'First photo', order: 0 },
        { type: 'video', filePath: 'two.mp4', altText: null, order: 1 }
      ]
    })
  })

  it('lists the entry summary without body or brainstorm', () => {
    archive.entries.create(entryInput())

    const [summary] = archive.entries.list(null)

    expect(summary).toMatchObject({
      slug: 'first-light',
      title: 'First light',
      excerpt: 'Morning on the ridge',
      coverImagePath: 'cover-a.jpg',
      coverImageCaption: 'The ridge at dawn',
      categories: ['Notes', 'Travel']
    })
    expect(summary).not.toHaveProperty('body')
    expect(summary).not.toHaveProperty('brainstorm')
  })
})

describe('revisions on update', () => {
  it('an update with changed content adds exactly one revision holding the old content', () => {
    const entry = archive.entries.create(entryInput())

    archive.entries.update(entry.id, entryInput({ title: 'Last light', categories: ['Travel'] }))

    const revisions = archive.entries.listRevisions(entry.id)
    expect(revisions).toHaveLength(1)
    expect(archive.entries.getRevision(entry.id, revisions[0].id)).toMatchObject({
      title: 'First light',
      excerpt: 'Morning on the ridge',
      body: 'The sun came up over the ridge.',
      coverImagePath: 'cover-a.jpg',
      coverImageCaption: 'The ridge at dawn',
      brainstorm: 'ideas',
      categories: ['Notes', 'Travel']
    })
  })

  it('a category change alone adds a revision', () => {
    const entry = archive.entries.create(entryInput())

    archive.entries.update(entry.id, entryInput({ categories: ['Travel'] }))

    expect(archive.entries.listRevisions(entry.id)).toHaveLength(1)
  })

  it('an update with unchanged content adds no revision', () => {
    const entry = archive.entries.create(
      entryInput({ excerpt: null, coverImageCaption: '', brainstorm: null })
    )

    archive.entries.update(
      entry.id,
      entryInput({ excerpt: '', coverImageCaption: null, brainstorm: '', categories: ['Notes', 'Travel'] })
    )

    expect(archive.entries.listRevisions(entry.id)).toEqual([])
  })

  it('updating the brainstorm adds no revision', () => {
    const entry = archive.entries.create(entryInput())

    archive.entries.updateBrainstorm(entry.id, 'new ideas')

    expect(archive.entries.listRevisions(entry.id)).toEqual([])
    expect(archive.entries.getBySlug('first-light')?.brainstorm).toBe('new ideas')
  })
})

describe('revert to revision', () => {
  it('restores content and categories, and snapshots the pre-revert content', () => {
    const entry = archive.entries.create(entryInput())
    archive.entries.update(
      entry.id,
      entryInput({ title: 'Last light', coverImagePath: 'cover-b.jpg', categories: ['Other'] })
    )
    const [original] = archive.entries.listRevisions(entry.id)

    const reverted = archive.entries.revertToRevision(entry.id, original.id)

    expect(reverted).toMatchObject({
      title: 'First light',
      coverImagePath: 'cover-a.jpg',
      categories: ['Notes', 'Travel']
    })
    const revisions = archive.entries.listRevisions(entry.id)
    expect(revisions).toHaveLength(2)
    expect(revisions.map((r) => r.title)).toContain('Last light')
  })

  it('does not snapshot when the current content equals the target', () => {
    const entry = archive.entries.create(entryInput())
    archive.entries.update(entry.id, entryInput({ title: 'Last light' }))
    const [original] = archive.entries.listRevisions(entry.id)
    archive.entries.revertToRevision(entry.id, original.id)
    expect(archive.entries.listRevisions(entry.id)).toHaveLength(2)

    archive.entries.revertToRevision(entry.id, original.id)

    expect(archive.entries.listRevisions(entry.id)).toHaveLength(2)
  })

  it('leaves the gallery media unchanged', () => {
    const entry = archive.entries.create(entryInput())
    archive.entries.update(entry.id, entryInput({ title: 'Last light', media: [] }))
    const [original] = archive.entries.listRevisions(entry.id)

    expect(archive.entries.revertToRevision(entry.id, original.id).media).toEqual([])
  })

  it('a missing revision changes nothing', () => {
    const entry = archive.entries.create(entryInput())

    expect(() => archive.entries.revertToRevision(entry.id, 999)).toThrow()

    expect(archive.entries.getBySlug('first-light')).toEqual(entry)
    expect(archive.entries.listRevisions(entry.id)).toEqual([])
  })
})

describe('entry delete', () => {
  it('removes the entry, its revisions, and its category links', () => {
    const entry = archive.entries.create(entryInput())
    archive.entries.update(entry.id, entryInput({ title: 'Last light' }))

    archive.entries.delete(entry.id)

    expect(archive.entries.getBySlug('first-light')).toBeNull()
    expect(archive.entries.listRevisions(entry.id)).toEqual([])
    expect(archive.entries.listCategories().map((c) => c.count)).toEqual([0, 0])
  })
})

describe('slugs', () => {
  it('entry slugs follow the shared slug rule', () => {
    archive.entries.create(entryInput({ slug: '  Road Trips: 2026! ' }))

    expect(archive.entries.getBySlug('road-trips-2026')?.title).toBe('First light')
  })
})

describe('categories', () => {
  it('create, rename, reorder, favorite, and delete give the expected list with counts', () => {
    archive.entries.create(entryInput({ categories: ['Travel'] }))
    const travel = archive.entries.listCategories()[0]
    const notes = archive.entries.createCategory('  Notes ')
    const ideas = archive.entries.createCategory('Ideas')

    archive.entries.renameCategory(ideas.id, 'Sketches')
    archive.entries.reorderCategories([ideas.id, notes.id, travel.id])
    archive.entries.setCategoryFavorite(travel.id, true)
    archive.entries.updateCategoryDescription(notes.id, 'Short notes')

    expect(archive.entries.listCategories()).toEqual([
      { id: travel.id, name: 'Travel', count: 1, description: null, favorite: true },
      { id: ideas.id, name: 'Sketches', count: 0, description: null, favorite: false },
      { id: notes.id, name: 'Notes', count: 0, description: 'Short notes', favorite: false }
    ])

    archive.entries.deleteCategory(travel.id)

    expect(archive.entries.listCategories().map((c) => c.name)).toEqual(['Sketches', 'Notes'])
    expect(archive.entries.getBySlug('first-light')?.categories).toEqual([])
  })
})
