import { describe, expect, it } from 'vitest'
import { entryInput, useArchiveFixture } from './archive-fixture'
import type { PostInput } from '../shared/types'

// Entry store behaviour, driven only through the archive seam.

const fx = useArchiveFixture()

/** An entry input with every content field and gallery media filled in. */
function fullEntry(overrides: Partial<PostInput> = {}): PostInput {
  return entryInput({
    excerpt: 'Morning on the ridge',
    coverImagePath: 'cover-a.jpg',
    coverImageCaption: 'The ridge at dawn',
    brainstorm: 'ideas',
    categories: ['Travel', 'Notes'],
    media: [
      { type: 'image', filePath: 'one.jpg', altText: 'First photo' },
      { type: 'video', filePath: 'two.mp4', altText: null }
    ],
    ...overrides
  })
}

describe('entry update atomicity', () => {
  it('a failed update leaves no revision, no row change, and no category change', () => {
    const entry = fx.archive.entries.create(fullEntry())
    fx.archive.entries.create(fullEntry({ slug: 'second-light', title: 'Second light' }))

    expect(() =>
      fx.archive.entries.update(
        entry.id,
        fullEntry({ slug: 'second-light', title: 'Changed title', categories: ['Other'] })
      )
    ).toThrow()

    expect(fx.archive.entries.listRevisions(entry.id)).toEqual([])
    expect(fx.archive.entries.getBySlug('first-light')).toEqual(entry)
    expect(fx.archive.entries.listCategories().map((c) => c.name).sort()).toEqual(['Notes', 'Travel'])
  })
})

describe('entry content round-trip', () => {
  it('create then get by slug returns every content field, the categories, and the gallery media', () => {
    fx.archive.entries.create(fullEntry())

    const entry = fx.archive.entries.getBySlug('first-light')

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
    fx.archive.entries.create(fullEntry())

    const [summary] = fx.archive.entries.list(null)

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

describe('update on a missing entry', () => {
  it('does not throw, writes nothing, and returns the entry at the input slug, as before', () => {
    const result = fx.archive.entries.update(9999, fullEntry())

    expect(result).toBeNull()
    expect(fx.archive.entries.list(null)).toEqual([])
    expect(fx.archive.entries.listCategories()).toEqual([])
  })
})

describe('revisions on update', () => {
  it('an update with changed content adds exactly one revision holding the old content', () => {
    const entry = fx.archive.entries.create(fullEntry())

    fx.archive.entries.update(entry.id, fullEntry({ title: 'Last light', categories: ['Travel'] }))

    const revisions = fx.archive.entries.listRevisions(entry.id)
    expect(revisions).toHaveLength(1)
    expect(fx.archive.entries.getRevision(entry.id, revisions[0].id)).toMatchObject({
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
    const entry = fx.archive.entries.create(fullEntry())

    fx.archive.entries.update(entry.id, fullEntry({ categories: ['Travel'] }))

    expect(fx.archive.entries.listRevisions(entry.id)).toHaveLength(1)
  })

  it('an update with unchanged content adds no revision', () => {
    const entry = fx.archive.entries.create(
      fullEntry({ excerpt: null, coverImageCaption: '', brainstorm: null })
    )

    fx.archive.entries.update(
      entry.id,
      fullEntry({ excerpt: '', coverImageCaption: null, brainstorm: '', categories: ['Notes', 'Travel'] })
    )

    expect(fx.archive.entries.listRevisions(entry.id)).toEqual([])
  })

  it('updating the brainstorm adds no revision', () => {
    const entry = fx.archive.entries.create(fullEntry())

    fx.archive.entries.updateBrainstorm(entry.id, 'new ideas')

    expect(fx.archive.entries.listRevisions(entry.id)).toEqual([])
    expect(fx.archive.entries.getBySlug('first-light')?.brainstorm).toBe('new ideas')
  })
})

describe('revert to revision', () => {
  it('restores content and categories, and snapshots the pre-revert content', () => {
    const entry = fx.archive.entries.create(fullEntry())
    fx.archive.entries.update(
      entry.id,
      fullEntry({ title: 'Last light', coverImagePath: 'cover-b.jpg', categories: ['Other'] })
    )
    const [original] = fx.archive.entries.listRevisions(entry.id)

    const reverted = fx.archive.entries.revertToRevision(entry.id, original.id)

    expect(reverted).toMatchObject({
      title: 'First light',
      coverImagePath: 'cover-a.jpg',
      categories: ['Notes', 'Travel']
    })
    const revisions = fx.archive.entries.listRevisions(entry.id)
    expect(revisions).toHaveLength(2)
    expect(revisions.map((r) => r.title)).toContain('Last light')
  })

  it('does not snapshot when the current content equals the target', () => {
    const entry = fx.archive.entries.create(fullEntry())
    fx.archive.entries.update(entry.id, fullEntry({ title: 'Last light' }))
    const [original] = fx.archive.entries.listRevisions(entry.id)
    fx.archive.entries.revertToRevision(entry.id, original.id)
    expect(fx.archive.entries.listRevisions(entry.id)).toHaveLength(2)

    fx.archive.entries.revertToRevision(entry.id, original.id)

    expect(fx.archive.entries.listRevisions(entry.id)).toHaveLength(2)
  })

  it('leaves the gallery media unchanged', () => {
    const entry = fx.archive.entries.create(fullEntry())
    fx.archive.entries.update(entry.id, fullEntry({ title: 'Last light', media: [] }))
    const [original] = fx.archive.entries.listRevisions(entry.id)

    expect(fx.archive.entries.revertToRevision(entry.id, original.id).media).toEqual([])
  })

  it('a missing revision changes nothing', () => {
    const entry = fx.archive.entries.create(fullEntry())

    expect(() => fx.archive.entries.revertToRevision(entry.id, 999)).toThrow()

    expect(fx.archive.entries.getBySlug('first-light')).toEqual(entry)
    expect(fx.archive.entries.listRevisions(entry.id)).toEqual([])
  })
})

describe('entry delete', () => {
  it('removes the entry, its revisions, and its category links', () => {
    const entry = fx.archive.entries.create(fullEntry())
    fx.archive.entries.update(entry.id, fullEntry({ title: 'Last light' }))

    fx.archive.entries.delete(entry.id)

    expect(fx.archive.entries.getBySlug('first-light')).toBeNull()
    expect(fx.archive.entries.listRevisions(entry.id)).toEqual([])
    expect(fx.archive.entries.listCategories().map((c) => c.count)).toEqual([0, 0])
  })
})

describe('slugs', () => {
  it('stores the slug as given, so a legacy slug survives a save next to its normalised form', () => {
    const legacy = fx.archive.entries.create(fullEntry({ slug: 'My Post' }))
    fx.archive.entries.create(fullEntry({ slug: 'my-post', title: 'Other' }))

    const saved = fx.archive.entries.update(legacy.id, fullEntry({ slug: 'My Post', title: 'Renamed' }))

    expect(saved.slug).toBe('My Post')
    expect(fx.archive.entries.getBySlug('My Post')?.title).toBe('Renamed')
    expect(fx.archive.entries.getBySlug('my-post')?.title).toBe('Other')
  })
})

describe('categories', () => {
  it('create, rename, reorder, favorite, and delete give the expected list with counts', () => {
    fx.archive.entries.create(fullEntry({ categories: ['Travel'] }))
    const travel = fx.archive.entries.listCategories()[0]
    const notes = fx.archive.entries.createCategory('  Notes ')
    const ideas = fx.archive.entries.createCategory('Ideas')

    fx.archive.entries.renameCategory(ideas.id, 'Sketches')
    fx.archive.entries.reorderCategories([ideas.id, notes.id, travel.id])
    fx.archive.entries.setCategoryFavorite(travel.id, true)
    fx.archive.entries.updateCategoryDescription(notes.id, 'Short notes')

    expect(fx.archive.entries.listCategories()).toEqual([
      { id: travel.id, name: 'Travel', count: 1, description: null, favorite: true },
      { id: ideas.id, name: 'Sketches', count: 0, description: null, favorite: false },
      { id: notes.id, name: 'Notes', count: 0, description: 'Short notes', favorite: false }
    ])

    fx.archive.entries.deleteCategory(travel.id)

    expect(fx.archive.entries.listCategories().map((c) => c.name)).toEqual(['Sketches', 'Notes'])
    expect(fx.archive.entries.getBySlug('first-light')?.categories).toEqual([])
  })
})
