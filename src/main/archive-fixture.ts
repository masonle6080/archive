import { afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openArchive, type Archive, type ArchiveInputs } from './archive'
import type { PostInput } from '../shared/types'

// Shared test setup: each test gets a fresh in-memory archive whose media
// folder sits in a new temporary work folder. Test files only.

export interface ArchiveFixture {
  /** A temporary folder for source files; removed after each test. */
  readonly workDir: string
  /** The archive's media folder, inside `workDir`. */
  readonly mediaDir: string
  readonly archive: Archive
  /** Closes the archive and opens a new in-memory one on the same media folder. */
  reopen(inputs?: Omit<Partial<ArchiveInputs>, 'mediaDir'>): Archive
}

/** Registers the per-test setup and teardown, and returns the live fixture. */
export function useArchiveFixture(): ArchiveFixture {
  let workDir = ''
  let archive: Archive | null = null

  const fixture: ArchiveFixture = {
    get workDir() {
      return workDir
    },
    get mediaDir() {
      return join(workDir, 'media')
    },
    get archive() {
      if (!archive) throw new Error('The archive fixture is only open inside a test')
      return archive
    },
    reopen(inputs = {}) {
      archive?.close()
      archive = openArchive({ db: ':memory:', ...inputs, mediaDir: fixture.mediaDir })
      return archive
    }
  }

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'archive-test-'))
    fixture.reopen()
  })

  afterEach(() => {
    archive?.close()
    archive = null
    rmSync(workDir, { recursive: true, force: true })
  })

  return fixture
}

/** A minimal valid entry input: no excerpt, cover, categories, or media. */
export function entryInput(overrides: Partial<PostInput> = {}): PostInput {
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
