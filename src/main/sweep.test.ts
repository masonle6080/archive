import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openArchive, type Archive } from './archive'
import type { PostInput } from '../shared/types'

// Sweep: the media library frees files that nothing refers to. Driven only
// through the archive seam, with real files in a temporary folder.

let workDir: string
let mediaDir: string
let archive: Archive

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'sweep-test-'))
  mediaDir = join(workDir, 'media')
  archive = openArchive({ db: ':memory:', mediaDir })
})

afterEach(() => {
  archive.close()
  rmSync(workDir, { recursive: true, force: true })
})

/** Imports a small image and returns its file name in the media folder. */
function importImage(name = 'photo.jpg'): string {
  const source = join(workDir, name)
  writeFileSync(source, `image ${name}`)
  return archive.media.import(source).fileName
}

function onDisk(fileName: string): boolean {
  return existsSync(join(mediaDir, fileName))
}

function entryInput(overrides: Partial<PostInput> = {}): PostInput {
  return {
    slug: 'first-light',
    title: 'First light',
    excerpt: null,
    body: 'The sun came up over the ridge.',
    coverImagePath: null,
    coverImageCaption: null,
    brainstorm: null,
    categories: [],
    media: [],
    ...overrides
  }
}

describe('media library sweep', () => {
  it('frees an imported file that no entry refers to', () => {
    const fileName = importImage()

    archive.media.sweep()

    expect(onDisk(fileName)).toBe(false)
  })

  it('leaves dotfiles, subdirectories, and unknown extensions in place', () => {
    writeFileSync(join(mediaDir, '.DS_Store'), 'finder')
    writeFileSync(join(mediaDir, '.hidden.jpg'), 'hidden')
    writeFileSync(join(mediaDir, 'notes.txt'), 'notes')
    mkdirSync(join(mediaDir, 'nested.jpg'))
    writeFileSync(join(mediaDir, 'nested.jpg', 'inner.jpg'), 'inner')

    archive.media.sweep()

    expect(onDisk('.DS_Store')).toBe(true)
    expect(onDisk('.hidden.jpg')).toBe(true)
    expect(onDisk('notes.txt')).toBe(true)
    expect(onDisk(join('nested.jpg', 'inner.jpg'))).toBe(true)
  })
})

describe('cover image files', () => {
  it('keeps a replaced cover image while a revision refers to it, and frees both on delete', () => {
    const coverA = importImage('a.jpg')
    const entry = archive.entries.create(entryInput({ coverImagePath: coverA }))
    const coverB = importImage('b.jpg')
    archive.entries.update(entry.id, entryInput({ coverImagePath: coverB }))

    expect(onDisk(coverA)).toBe(true)
    expect(onDisk(coverB)).toBe(true)
    const [revision] = archive.entries.listRevisions(entry.id)
    expect(archive.entries.revertToRevision(entry.id, revision.id).coverImagePath).toBe(coverA)

    archive.entries.delete(entry.id)

    expect(onDisk(coverA)).toBe(false)
    expect(onDisk(coverB)).toBe(false)
  })

  it('keeps a removed cover image while the new revision refers to it', () => {
    const cover = importImage('cover.jpg')
    const entry = archive.entries.create(entryInput({ coverImagePath: cover }))

    archive.entries.update(entry.id, entryInput({ coverImagePath: null }))

    expect(onDisk(cover)).toBe(true)
    archive.entries.delete(entry.id)
    expect(onDisk(cover)).toBe(false)
  })
})

describe('gallery media files', () => {
  it('frees a removed gallery item on save and keeps the kept items', () => {
    const kept = importImage('kept.jpg')
    const removed = importImage('removed.jpg')
    const entry = archive.entries.create(
      entryInput({
        media: [
          { type: 'image', filePath: kept, altText: null },
          { type: 'image', filePath: removed, altText: null }
        ]
      })
    )

    archive.entries.update(
      entry.id,
      entryInput({ media: [{ type: 'image', filePath: kept, altText: null }] })
    )

    expect(onDisk(kept)).toBe(true)
    expect(onDisk(removed)).toBe(false)
  })
})

describe('entry delete files', () => {
  it('frees only the deleted entry files and leaves another entry files in place', () => {
    const firstCover = importImage('first-cover.jpg')
    const firstPhoto = importImage('first-photo.jpg')
    const first = archive.entries.create(
      entryInput({
        coverImagePath: firstCover,
        media: [{ type: 'image', filePath: firstPhoto, altText: null }]
      })
    )
    const secondCover = importImage('second-cover.jpg')
    const secondPhoto = importImage('second-photo.jpg')
    archive.entries.create(
      entryInput({
        slug: 'last-light',
        title: 'Last light',
        coverImagePath: secondCover,
        media: [{ type: 'image', filePath: secondPhoto, altText: null }]
      })
    )

    archive.entries.delete(first.id)

    expect(onDisk(firstCover)).toBe(false)
    expect(onDisk(firstPhoto)).toBe(false)
    expect(onDisk(secondCover)).toBe(true)
    expect(onDisk(secondPhoto)).toBe(true)
  })
})

describe('when sweep runs', () => {
  it('runs at archive open and frees imports that no saved entry refers to', () => {
    archive.close()
    const abandoned = join(mediaDir, 'abandoned-draft.jpg')
    writeFileSync(abandoned, 'never saved')

    archive = openArchive({ db: ':memory:', mediaDir })

    expect(existsSync(abandoned)).toBe(false)
  })

  it('runs after create, update, revert, and delete commit', () => {
    const entry = archive.entries.create(entryInput({ title: 'One' }))
    archive.entries.update(entry.id, entryInput({ title: 'Two' }))
    const [revision] = archive.entries.listRevisions(entry.id)

    const steps: Array<() => void> = [
      () => archive.entries.create(entryInput({ slug: 'second' })),
      () => archive.entries.update(entry.id, entryInput({ title: 'Three' })),
      () => archive.entries.revertToRevision(entry.id, revision.id),
      () => archive.entries.delete(entry.id)
    ]
    for (const step of steps) {
      const stray = importImage('stray.jpg')
      step()
      expect(onDisk(stray)).toBe(false)
    }
  })

  it('does not run when a save fails, so the draft imports stay', () => {
    archive.entries.create(entryInput({ slug: 'taken' }))
    const entry = archive.entries.create(entryInput())
    const photo = importImage()

    expect(() =>
      archive.entries.update(
        entry.id,
        entryInput({ slug: 'taken', media: [{ type: 'image', filePath: photo, altText: null }] })
      )
    ).toThrow()

    expect(onDisk(photo)).toBe(true)
  })
})
