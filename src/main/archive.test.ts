import { describe, expect, it } from 'vitest'
import { entryInput, useArchiveFixture } from './archive-fixture'

const fx = useArchiveFixture()

describe('openArchive', () => {
  it('creates an entry and reads it back by slug', () => {
    fx.archive.entries.create(
      entryInput({ excerpt: 'Morning on the ridge', brainstorm: 'ideas', categories: ['Travel', 'Notes'] })
    )

    const entry = fx.archive.entries.getBySlug('first-light')

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
