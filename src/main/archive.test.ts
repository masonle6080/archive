import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openArchive, type Archive } from './archive'
import type { PostInput } from '../shared/types'

let mediaDir: string
let archive: Archive

beforeEach(() => {
  mediaDir = join(mkdtempSync(join(tmpdir(), 'archive-test-')), 'media')
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
    coverImagePath: null,
    coverImageCaption: null,
    brainstorm: 'ideas',
    categories: ['Travel', 'Notes'],
    media: [],
    ...overrides
  }
}

describe('openArchive', () => {
  it('creates an entry and reads it back by slug', () => {
    archive.entries.create(entryInput())

    const entry = archive.entries.getBySlug('first-light')

    expect(entry).toMatchObject({
      slug: 'first-light',
      title: 'First light',
      excerpt: 'Morning on the ridge',
      body: 'The sun came up over the ridge.',
      brainstorm: 'ideas',
      categories: ['Notes', 'Travel'],
      media: []
    })
  })
})
