import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { entryInput, useArchiveFixture } from './archive-fixture'

// Sweep: the media library frees files that nothing refers to. Driven only
// through the archive seam, with real files in a temporary folder.

const fx = useArchiveFixture()

/** Imports a small image and returns its file name in the media folder. */
function importImage(name = 'photo.jpg'): string {
  const source = join(fx.workDir, name)
  writeFileSync(source, `image ${name}`)
  return fx.archive.media.import(source).fileName
}

function onDisk(fileName: string): boolean {
  return existsSync(join(fx.mediaDir, fileName))
}

describe('media library sweep', () => {
  it('frees an imported file that no entry refers to', () => {
    const fileName = importImage()

    fx.archive.media.sweep()

    expect(onDisk(fileName)).toBe(false)
  })

  it('leaves dotfiles, subdirectories, and unknown extensions in place', () => {
    writeFileSync(join(fx.mediaDir, '.DS_Store'), 'finder')
    writeFileSync(join(fx.mediaDir, '.hidden.jpg'), 'hidden')
    writeFileSync(join(fx.mediaDir, 'notes.txt'), 'notes')
    mkdirSync(join(fx.mediaDir, 'nested.jpg'))
    writeFileSync(join(fx.mediaDir, 'nested.jpg', 'inner.jpg'), 'inner')

    fx.archive.media.sweep()

    expect(onDisk('.DS_Store')).toBe(true)
    expect(onDisk('.hidden.jpg')).toBe(true)
    expect(onDisk('notes.txt')).toBe(true)
    expect(onDisk(join('nested.jpg', 'inner.jpg'))).toBe(true)
  })
})

describe('cover image files', () => {
  it('keeps a replaced cover image while a revision refers to it, and frees both on delete', () => {
    const coverA = importImage('a.jpg')
    const entry = fx.archive.entries.create(entryInput({ coverImagePath: coverA }))
    const coverB = importImage('b.jpg')
    fx.archive.entries.update(entry.id, entryInput({ coverImagePath: coverB }))

    expect(onDisk(coverA)).toBe(true)
    expect(onDisk(coverB)).toBe(true)
    const [revision] = fx.archive.entries.listRevisions(entry.id)
    expect(fx.archive.entries.revertToRevision(entry.id, revision.id).coverImagePath).toBe(coverA)

    fx.archive.entries.delete(entry.id)

    expect(onDisk(coverA)).toBe(false)
    expect(onDisk(coverB)).toBe(false)
  })

  it('keeps a removed cover image while the new revision refers to it', () => {
    const cover = importImage('cover.jpg')
    const entry = fx.archive.entries.create(entryInput({ coverImagePath: cover }))

    fx.archive.entries.update(entry.id, entryInput({ coverImagePath: null }))

    expect(onDisk(cover)).toBe(true)
    fx.archive.entries.delete(entry.id)
    expect(onDisk(cover)).toBe(false)
  })
})

describe('gallery media files', () => {
  it('frees a removed gallery item on save and keeps the kept items', () => {
    const kept = importImage('kept.jpg')
    const removed = importImage('removed.jpg')
    const entry = fx.archive.entries.create(
      entryInput({
        media: [
          { type: 'image', filePath: kept, altText: null },
          { type: 'image', filePath: removed, altText: null }
        ]
      })
    )

    fx.archive.entries.update(
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
    const first = fx.archive.entries.create(
      entryInput({
        coverImagePath: firstCover,
        media: [{ type: 'image', filePath: firstPhoto, altText: null }]
      })
    )
    const secondCover = importImage('second-cover.jpg')
    const secondPhoto = importImage('second-photo.jpg')
    fx.archive.entries.create(
      entryInput({
        slug: 'last-light',
        title: 'Last light',
        coverImagePath: secondCover,
        media: [{ type: 'image', filePath: secondPhoto, altText: null }]
      })
    )

    fx.archive.entries.delete(first.id)

    expect(onDisk(firstCover)).toBe(false)
    expect(onDisk(firstPhoto)).toBe(false)
    expect(onDisk(secondCover)).toBe(true)
    expect(onDisk(secondPhoto)).toBe(true)
  })
})

describe('when sweep runs', () => {
  it('runs at archive open and frees imports that no saved entry refers to', () => {
    const abandoned = join(fx.mediaDir, 'abandoned-draft.jpg')
    writeFileSync(abandoned, 'never saved')

    fx.reopen()

    expect(existsSync(abandoned)).toBe(false)
  })

  it('runs after create, update, revert, and delete commit', () => {
    const entry = fx.archive.entries.create(entryInput({ title: 'One' }))
    fx.archive.entries.update(entry.id, entryInput({ title: 'Two' }))
    const [revision] = fx.archive.entries.listRevisions(entry.id)

    const steps: Array<() => void> = [
      () => fx.archive.entries.create(entryInput({ slug: 'second' })),
      () => fx.archive.entries.update(entry.id, entryInput({ title: 'Three' })),
      () => fx.archive.entries.revertToRevision(entry.id, revision.id),
      () => fx.archive.entries.delete(entry.id)
    ]
    for (const step of steps) {
      const stray = importImage('stray.jpg')
      step()
      expect(onDisk(stray)).toBe(false)
    }
  })

  it('does not run when a save fails, so the draft imports stay', () => {
    fx.archive.entries.create(entryInput({ slug: 'taken' }))
    const entry = fx.archive.entries.create(entryInput())
    const photo = importImage()

    expect(() =>
      fx.archive.entries.update(
        entry.id,
        entryInput({ slug: 'taken', media: [{ type: 'image', filePath: photo, altText: null }] })
      )
    ).toThrow()

    expect(onDisk(photo)).toBe(true)
  })

  it('a failed sweep does not fail a committed create, update, revert, or delete', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const entry = fx.archive.entries.create(entryInput({ title: 'One' }))
    fx.archive.entries.update(entry.id, entryInput({ title: 'Two' }))
    const [revision] = fx.archive.entries.listRevisions(entry.id)
    // With the media folder gone, every sweep fails to read it.
    rmSync(fx.mediaDir, { recursive: true, force: true })

    const created = fx.archive.entries.create(entryInput({ slug: 'second' }))
    const updated = fx.archive.entries.update(entry.id, entryInput({ title: 'Three' }))
    const reverted = fx.archive.entries.revertToRevision(entry.id, revision.id)
    fx.archive.entries.delete(created.id)

    expect(updated.title).toBe('Three')
    expect(reverted.title).toBe('One')
    expect(fx.archive.entries.list(null).map((e) => e.slug)).toEqual(['first-light'])
    expect(logged).toHaveBeenCalledTimes(4)
    logged.mockRestore()
  })
})
