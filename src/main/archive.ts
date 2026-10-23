import { mkdirSync } from 'fs'
import Database from 'better-sqlite3'
import { createEntryStore, type EntryStore } from './entry-store'
import { createMediaLibrary, type MediaLibrary } from './media'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS post (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  body          TEXT NOT NULL DEFAULT '',
  cover_image_path TEXT,
  cover_image_caption TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at  TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  brainstorm    TEXT
);

CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('image', 'video')),
  file_path  TEXT NOT NULL,
  alt_text   TEXT,
  "order"    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tag (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS post_tag (
  post_id INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS post_revision (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id          INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  excerpt          TEXT,
  body             TEXT NOT NULL,
  cover_image_path TEXT,
  cover_image_caption TEXT,
  brainstorm       TEXT,
  categories       TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_post_id ON media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_status_published_at ON post(status, published_at);
CREATE INDEX IF NOT EXISTS idx_post_revision_post_id ON post_revision(post_id, created_at DESC);
`

function migrate(database: Database.Database): void {
  const postColumns = database.prepare(`PRAGMA table_info(post)`).all() as { name: string }[]
  if (!postColumns.some((c) => c.name === 'brainstorm')) {
    database.exec(`ALTER TABLE post ADD COLUMN brainstorm TEXT`)
  }

  if (!postColumns.some((c) => c.name === 'cover_image_caption')) {
    database.exec(`ALTER TABLE post ADD COLUMN cover_image_caption TEXT`)
  }

  const revisionColumns = database.prepare(`PRAGMA table_info(post_revision)`).all() as {
    name: string
  }[]
  if (!revisionColumns.some((c) => c.name === 'cover_image_caption')) {
    database.exec(`ALTER TABLE post_revision ADD COLUMN cover_image_caption TEXT`)
  }

  const tagColumns = database.prepare(`PRAGMA table_info(tag)`).all() as { name: string }[]
  if (!tagColumns.some((c) => c.name === 'sort_order')) {
    database.exec(`ALTER TABLE tag ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
    database.exec(`UPDATE tag SET sort_order = id WHERE sort_order = 0`)
  }
  if (!tagColumns.some((c) => c.name === 'description')) {
    database.exec(`ALTER TABLE tag ADD COLUMN description TEXT`)
  }
  if (!tagColumns.some((c) => c.name === 'favorite')) {
    database.exec(`ALTER TABLE tag ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0`)
  }
}

export interface ArchiveInputs {
  /** An open SQLite handle, or a path to open (`:memory:` works). */
  db: Database.Database | string
  /** The folder that holds imported media files. Created if missing. */
  mediaDir: string
  /** The ffmpeg executable used to remux imported videos, if any. */
  ffmpegPath?: string | null
}

export interface Archive {
  entries: EntryStore
  media: MediaLibrary
  close(): void
}

// The one seam into the archive: the app and the tests both open it here.
export function openArchive({ db, mediaDir, ffmpegPath = null }: ArchiveInputs): Archive {
  mkdirSync(mediaDir, { recursive: true })

  const database = typeof db === 'string' ? new Database(db) : db
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.exec(SCHEMA)
  migrate(database)

  const media = createMediaLibrary(database, mediaDir, ffmpegPath)
  // Free imports from drafts that were never saved, and files that earlier
  // versions leaked. This permanently deletes them, by design.
  media.sweep()

  return {
    entries: createEntryStore(database, media.sweep),
    media,
    close: () => database.close()
  }
}
