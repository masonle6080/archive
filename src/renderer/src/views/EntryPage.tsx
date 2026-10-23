import { useEffect, useRef, useState } from 'react'
import type {
  Category,
  MediaItem,
  PostDetail,
  PostInput,
  Revision,
  RevisionDetail
} from '../../../shared/types'
import { slugify } from '@shared/slug'
import { mediaUrl } from '@renderer/lib/media'
import { formatDate, formatDateTime } from '@renderer/lib/date'
import { renderMarkdown } from '@renderer/lib/markdown'
import { TagList } from '@renderer/components/TagList'
import { CategoryPicker } from '@renderer/components/CategoryPicker'
import { DropZone } from '@renderer/components/DropZone'
import { Divider } from '@renderer/components/Divider'
import { FadeIn } from '@renderer/components/FadeIn'

type Mode = 'view' | 'edit'
type SidePanel = 'none' | 'brainstorm' | 'history'

interface Draft {
  slug: string
  slugTouched: boolean
  title: string
  excerpt: string
  body: string
  coverImagePath: string | null
  coverImageCaption: string
  brainstorm: string
  categories: string[]
  media: MediaItem[]
}

let nextTempId = -1

function blankDraft(preselectCategory: string | null): Draft {
  return {
    slug: '',
    slugTouched: false,
    title: '',
    excerpt: '',
    body: '',
    coverImagePath: null,
    coverImageCaption: '',
    brainstorm: '',
    categories: preselectCategory ? [preselectCategory] : [],
    media: []
  }
}

function draftFromDetail(detail: PostDetail): Draft {
  return {
    slug: detail.slug,
    slugTouched: true,
    title: detail.title,
    excerpt: detail.excerpt ?? '',
    body: detail.body,
    coverImagePath: detail.coverImagePath,
    coverImageCaption: detail.coverImageCaption ?? '',
    brainstorm: detail.brainstorm ?? '',
    categories: detail.categories,
    media: detail.media
  }
}

export function EntryPage({
  entry,
  categories,
  currentCategoryId,
  onDone,
  onSaved,
  onFullWidthChange
}: {
  entry: { slug: string } | 'new'
  categories: Category[]
  currentCategoryId: number | null
  onDone: () => void
  onSaved: () => void
  onFullWidthChange: (full: boolean) => void
}): JSX.Element {
  const [savedDetail, setSavedDetail] = useState<PostDetail | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [sidePanel, setSidePanel] = useState<SidePanel>('none')
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [previewRevisionId, setPreviewRevisionId] = useState<number | null>(null)
  const [revisionDetails, setRevisionDetails] = useState<Record<number, RevisionDetail>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the body textarea to fit its content instead of scrolling
  // internally — the page itself scrolls, the textarea just keeps expanding.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft?.body, mode])

  useEffect(() => {
    if (entry === 'new') {
      const preselect = categories.find((c) => c.id === currentCategoryId)?.name ?? null
      setSavedDetail(null)
      setDraft(blankDraft(preselect))
      setMode('edit')
      setSidePanel('none')
      return
    }
    setSavedDetail(null)
    setMode('view')
    setSidePanel('none')
    setPreviewRevisionId(null)
    setRevisionDetails({})
    window.api.posts.getBySlug(entry.slug).then((d) => setSavedDetail(d))
  }, [entry])

  useEffect(() => {
    onFullWidthChange(mode === 'edit' && sidePanel !== 'none')
  }, [mode, sidePanel])

  // Reset only on true unmount (leaving the entry entirely) — a plain
  // dependency-keyed cleanup would also fire on every mode/sidePanel change,
  // flickering the layout narrow before the new value takes effect.
  useEffect(() => {
    return () => onFullWidthChange(false)
  }, [])

  function startEdit(): void {
    if (!savedDetail) return
    setDraft(draftFromDetail(savedDetail))
    setSidePanel('none')
    setPreviewRevisionId(null)
    setMode('edit')
  }

  function backFromEdit(): void {
    setSidePanel('none')
    setPreviewRevisionId(null)
    if (savedDetail) setMode('view')
    else onDone()
  }

  async function persistBrainstormIfNeeded(): Promise<void> {
    if (savedDetail && draft) {
      await window.api.posts.updateBrainstorm(savedDetail.id, draft.brainstorm)
    }
  }

  async function selectPanel(panel: 'brainstorm' | 'history'): Promise<void> {
    setPreviewRevisionId(null)
    if (sidePanel === panel) {
      if (panel === 'brainstorm') await persistBrainstormIfNeeded()
      setSidePanel('none')
      return
    }
    if (sidePanel === 'brainstorm') await persistBrainstormIfNeeded()
    if (panel === 'history' && savedDetail) {
      setRevisions(await window.api.posts.listRevisions(savedDetail.id))
    }
    setSidePanel(panel)
  }

  async function togglePreview(revisionId: number): Promise<void> {
    if (previewRevisionId === revisionId) {
      setPreviewRevisionId(null)
      return
    }
    if (!revisionDetails[revisionId] && savedDetail) {
      const detail = await window.api.posts.getRevision(savedDetail.id, revisionId)
      if (detail) setRevisionDetails((prev) => ({ ...prev, [revisionId]: detail }))
    }
    setPreviewRevisionId(revisionId)
  }

  async function revert(revisionId: number): Promise<void> {
    if (!savedDetail) return
    if (!confirm('Revert to this version? Unsaved changes in the form will be replaced.')) return
    const result = await window.api.posts.revertToRevision(savedDetail.id, revisionId)
    setSavedDetail(result)
    setDraft(draftFromDetail(result))
    setSidePanel('none')
    setPreviewRevisionId(null)
    onSaved()
  }

  async function importFiles(files: File[]): Promise<{ fileName: string; type: 'image' | 'video' }[]> {
    const results: { fileName: string; type: 'image' | 'video' }[] = []
    for (const file of files) {
      const sourcePath = window.api.media.getPathForFile(file)
      try {
        results.push(await window.api.media.import(sourcePath))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not import file')
      }
    }
    return results
  }

  async function handleCoverDrop(files: File[]): Promise<void> {
    if (files.length === 0) return
    const [imported] = await importFiles([files[0]])
    if (imported && imported.type === 'image') {
      setDraft((d) => d && { ...d, coverImagePath: imported.fileName })
    } else if (imported) {
      setError('Cover image must be an image file')
    }
  }

  async function handleGalleryDrop(files: File[]): Promise<void> {
    if (files.length === 0) return
    const imported = await importFiles(files)
    setDraft(
      (d) =>
        d && {
          ...d,
          media: [
            ...d.media,
            ...imported.map((m) => ({
              id: nextTempId--,
              type: m.type,
              filePath: m.fileName,
              altText: null,
              order: 0
            }))
          ]
        }
    )
  }

  async function save(): Promise<void> {
    if (!draft) return
    if (!draft.title.trim()) {
      setError('Give it a title first.')
      return
    }
    const slug = draft.slug.trim() || slugify(draft.title)
    setSaving(true)
    setError(null)

    const input: PostInput = {
      slug,
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim() || null,
      body: draft.body,
      coverImagePath: draft.coverImagePath,
      coverImageCaption: draft.coverImageCaption.trim() || null,
      brainstorm: draft.brainstorm || null,
      categories: draft.categories,
      media: draft.media.map((m) => ({ type: m.type, filePath: m.filePath, altText: m.altText }))
    }

    try {
      const result = savedDetail
        ? await window.api.posts.update(savedDetail.id, input)
        : await window.api.posts.create(input)
      setSavedDetail(result)
      setSidePanel('none')
      setPreviewRevisionId(null)
      setMode('view')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save entry')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!savedDetail) return
    if (!confirm(`Delete "${savedDetail.title}"? This can't be undone.`)) return
    await window.api.posts.delete(savedDetail.id)
    onDone()
  }

  useEffect(() => {
    const offSave = window.api.onMenu('menu:save', () => {
      if (mode === 'edit') save()
    })
    return offSave
  }, [mode, draft, savedDetail])

  if (mode === 'view') {
    if (!savedDetail) return <p className="text-sm text-ink-400">Loading…</p>

    const createdLabel = formatDate(savedDetail.createdAt)
    const updatedLabel = formatDate(savedDetail.updatedAt)
    const wasEdited = updatedLabel !== createdLabel

    return (
      <FadeIn>
        <button onClick={onDone} className="text-sm text-ink-400 hover:text-accent-600 mb-8">
          ← Back
        </button>

        <p className="text-xs text-ink-400 tracking-wide mb-2">
          Created {createdLabel}
          {wasEdited && <> · Updated {updatedLabel}</>}
        </p>
        <div className="flex items-center justify-between gap-4 mb-3">
          <h1 className="font-serif font-medium text-3xl text-ink-800">{savedDetail.title}</h1>
          <button
            onClick={startEdit}
            className="inline-flex items-center h-8 px-3 rounded-lg text-sm font-medium bg-accent-600 text-paper hover:bg-accent-500 transition-colors shrink-0"
          >
            Edit
          </button>
        </div>
        <div className="mb-6">
          <TagList tags={savedDetail.categories} />
        </div>

        {savedDetail.coverImagePath && (
          <figure className="mb-2">
            <img
              src={mediaUrl(savedDetail.coverImagePath)}
              alt=""
              className="w-full h-72 object-cover rounded-lg"
            />
            {savedDetail.coverImageCaption && (
              <figcaption className="text-xs text-ink-400 mt-2">
                {savedDetail.coverImageCaption}
              </figcaption>
            )}
          </figure>
        )}

        <article
          className="prose-journal mt-8"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(savedDetail.body) }}
        />

        {savedDetail.media.length > 0 && (
          <div className="flex flex-col gap-6 mb-8">
            {savedDetail.media.map((m) =>
              m.type === 'image' ? (
                <img
                  key={m.id}
                  src={mediaUrl(m.filePath)}
                  alt={m.altText ?? ''}
                  className="w-full rounded-lg"
                />
              ) : (
                <video
                  key={m.id}
                  src={mediaUrl(m.filePath)}
                  controls
                  preload="none"
                  className="w-full rounded-lg"
                />
              )
            )}
          </div>
        )}
      </FadeIn>
    )
  }

  // edit mode
  if (!draft) return <p className="text-sm text-ink-400">Loading…</p>

  const panelButtonClass = (active: boolean): string =>
    ['text-sm transition-colors', active ? 'text-accent-600' : 'text-ink-500 hover:text-accent-600'].join(
      ' '
    )

  const previewRevision =
    previewRevisionId != null ? revisions.find((r) => r.id === previewRevisionId) : undefined
  const previewDetail = previewRevisionId != null ? revisionDetails[previewRevisionId] : undefined

  return (
    <div className="pb-16 flex gap-10 items-start">
      <div className="flex-1 max-w-2xl min-w-0">
        <div className="flex items-center justify-between mb-8">
          <button onClick={backFromEdit} className="text-sm text-ink-400 hover:text-accent-600">
            ← {savedDetail ? 'Back' : 'Back to list'}
          </button>
          <button
            disabled={saving}
            onClick={save}
            className="inline-flex items-center h-8 px-3 rounded-lg text-sm font-medium bg-accent-600 text-paper hover:bg-accent-500 disabled:opacity-50 transition-colors"
          >
            Save
          </button>
        </div>

        {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}

        <div className="flex items-center gap-4 mb-2">
          <input
            value={draft.title}
            onChange={(e) =>
              setDraft(
                (d) =>
                  d && {
                    ...d,
                    title: e.target.value,
                    slug: d.slugTouched ? d.slug : slugify(e.target.value)
                  }
              )
            }
            placeholder="Entry title"
            className="flex-1 min-w-0 font-serif font-medium text-3xl text-ink-800 bg-transparent outline-none placeholder:text-ink-300"
          />
          <div className="flex items-center gap-4 shrink-0">
            <button onClick={() => selectPanel('brainstorm')} className={panelButtonClass(sidePanel === 'brainstorm')}>
              Brainstorm
            </button>
            {savedDetail && (
              <button onClick={() => selectPanel('history')} className={panelButtonClass(sidePanel === 'history')}>
                History
              </button>
            )}
            {savedDetail && (
              <button onClick={handleDelete} className="text-sm text-ink-400 hover:text-accent-600">
                Delete
              </button>
            )}
          </div>
        </div>

        {previewRevision ? (
          <div>
            <div className="flex items-center justify-between gap-4 mb-6 px-4 py-3 rounded-lg border border-accent-400/50 bg-line-50">
              <div>
                <p className="text-xs font-medium text-accent-600 mb-0.5">
                  Viewing an earlier version
                </p>
                <p className="text-sm text-ink-600">{formatDateTime(previewRevision.createdAt)}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <button
                  onClick={() => setPreviewRevisionId(null)}
                  className="text-sm text-ink-500 hover:text-accent-600 transition-colors"
                >
                  Return to editing
                </button>
                <button
                  onClick={() => revert(previewRevision.id)}
                  className="inline-flex items-center h-8 px-3 rounded-lg text-sm font-medium bg-accent-600 text-paper hover:bg-accent-500 transition-colors"
                >
                  Restore this version
                </button>
              </div>
            </div>

            {!previewDetail ? (
              <p className="text-sm text-ink-400">Loading…</p>
            ) : (
              <div className="opacity-80">
                <h2 className="font-serif font-medium text-2xl text-ink-800 mb-2">{previewDetail.title}</h2>
                {previewDetail.categories.length > 0 && (
                  <div className="mb-4">
                    <TagList tags={previewDetail.categories} />
                  </div>
                )}
                {previewDetail.coverImagePath && (
                  <figure className="mb-4">
                    <img
                      src={mediaUrl(previewDetail.coverImagePath)}
                      alt=""
                      className="w-full h-64 object-cover rounded-lg"
                    />
                    {previewDetail.coverImageCaption && (
                      <figcaption className="text-xs text-ink-400 mt-2">
                        {previewDetail.coverImageCaption}
                      </figcaption>
                    )}
                  </figure>
                )}
                {previewDetail.excerpt && (
                  <p className="text-sm text-ink-500 mb-4">{previewDetail.excerpt}</p>
                )}
                <article
                  className="prose-journal"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(previewDetail.body) }}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-ink-400 mb-6">
              <span>slug:</span>
              <input
                value={draft.slug}
                onChange={(e) =>
                  setDraft((d) => d && { ...d, slug: slugify(e.target.value), slugTouched: true })
                }
                className="flex-1 bg-transparent outline-none border-b border-transparent focus:border-line-300 text-ink-600"
              />
            </div>

            <textarea
              value={draft.excerpt}
              onChange={(e) => setDraft((d) => d && { ...d, excerpt: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              placeholder="One or two sentences for the list…"
              rows={2}
              className="w-full text-sm text-ink-600 bg-transparent outline-none placeholder:text-ink-300 mb-6 resize-none"
            />

            <CategoryPicker
              categories={categories}
              selected={draft.categories}
              onChange={(names) => setDraft((d) => d && { ...d, categories: names })}
            />

            <Divider className="my-6" />

            <p className="text-xs font-medium text-ink-400 mb-2">Cover image</p>
            {draft.coverImagePath ? (
              <div className="mb-6">
                <div className="relative group">
                  <img
                    src={mediaUrl(draft.coverImagePath)}
                    alt=""
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <button
                    onClick={() =>
                      setDraft((d) => d && { ...d, coverImagePath: null, coverImageCaption: '' })
                    }
                    className="absolute top-2 right-2 text-xs px-2 py-1 rounded-lg bg-paper/90 text-ink-600 hover:text-accent-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Remove
                  </button>
                </div>
                <input
                  value={draft.coverImageCaption}
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, coverImageCaption: e.target.value })
                  }
                  placeholder="Caption for the cover photo…"
                  className="w-full text-sm text-ink-600 bg-transparent outline-none border-b border-transparent focus:border-line-300 placeholder:text-ink-300 mt-2 py-1"
                />
              </div>
            ) : (
              <DropZone onFiles={handleCoverDrop} accept="image/*" className="mb-6">
                <div className="w-full h-32 border border-dashed border-line-300 rounded-lg flex items-center justify-center text-sm text-ink-400">
                  Drag an image here, or click to browse
                </div>
              </DropZone>
            )}

            <Divider className="mb-6" />

            <p className="text-xs font-medium text-ink-400 mb-2">Media</p>
            <DropZone onFiles={handleGalleryDrop} multiple className="mb-3">
              <div className="w-full h-20 border border-dashed border-line-300 rounded-lg flex items-center justify-center text-sm text-ink-400">
                Drag images or video here, or click to browse
              </div>
            </DropZone>

            {draft.media.length > 0 && (
              <div className="flex flex-col gap-4 mb-8">
                {draft.media.map((m) => (
                  <div key={m.id} className="flex gap-3 items-start">
                    {m.type === 'image' ? (
                      <img
                        src={mediaUrl(m.filePath)}
                        alt=""
                        className="w-20 h-20 object-cover rounded-lg shrink-0"
                      />
                    ) : (
                      <video
                        src={mediaUrl(m.filePath)}
                        className="w-20 h-20 object-cover rounded-lg shrink-0"
                      />
                    )}
                    <input
                      value={m.altText ?? ''}
                      onChange={(e) =>
                        setDraft(
                          (d) =>
                            d && {
                              ...d,
                              media: d.media.map((item) =>
                                item.id === m.id ? { ...item, altText: e.target.value } : item
                              )
                            }
                        )
                      }
                      placeholder="alt text"
                      className="flex-1 text-sm bg-transparent outline-none border-b border-line-200 placeholder:text-ink-300 py-1"
                    />
                    <button
                      onClick={() =>
                        setDraft(
                          (d) => d && { ...d, media: d.media.filter((item) => item.id !== m.id) }
                        )
                      }
                      className="text-xs text-ink-400 hover:text-accent-600 shrink-0 mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Divider className="mb-6" />

            <p className="text-xs font-medium text-ink-400 mb-2">Body (Markdown)</p>

            <textarea
              ref={bodyRef}
              value={draft.body}
              onChange={(e) => setDraft((d) => d && { ...d, body: e.target.value })}
              placeholder="Write in Markdown…"
              rows={4}
              className="w-full text-base text-ink-700 leading-relaxed bg-transparent outline-none placeholder:text-ink-300 mb-6 resize-none overflow-hidden"
            />
          </>
        )}
      </div>

      {sidePanel === 'brainstorm' && (
        <div className="flex-1 min-w-0 border-l border-line-200/70 pl-10 sticky top-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-ink-400">Brainstorm</p>
            <button
              onClick={() => selectPanel('brainstorm')}
              className="text-xs text-ink-400 hover:text-accent-600"
            >
              Close
            </button>
          </div>
          <textarea
            autoFocus
            value={draft.brainstorm}
            onChange={(e) => setDraft((d) => d && { ...d, brainstorm: e.target.value })}
            placeholder="Loose notes, outline, half-formed ideas…"
            rows={28}
            className="w-full text-base text-ink-700 leading-relaxed bg-transparent outline-none placeholder:text-ink-300 resize-y"
          />
        </div>
      )}

      {sidePanel === 'history' && (
        <div className="w-72 shrink-0 border-l border-line-200/70 pl-10 sticky top-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-ink-400">History</p>
            <button
              onClick={() => selectPanel('history')}
              className="text-xs text-ink-400 hover:text-accent-600"
            >
              Close
            </button>
          </div>
          {revisions.length === 0 ? (
            <p className="text-sm text-ink-400">No edits yet — this history fills in each time you save.</p>
          ) : (
            <div className="flex flex-col">
              {revisions.map((r, i) => {
                const active = previewRevisionId === r.id
                return (
                  <div key={r.id}>
                    <div className="py-3 flex items-center justify-between gap-4">
                      <button
                        onClick={() => togglePreview(r.id)}
                        className={[
                          'text-sm transition-colors text-left',
                          active ? 'text-accent-600' : 'text-ink-700 hover:text-accent-600'
                        ].join(' ')}
                      >
                        {formatDateTime(r.createdAt)}
                      </button>
                      <button
                        onClick={() => revert(r.id)}
                        className="text-xs text-accent-600 hover:text-accent-500 shrink-0"
                      >
                        Revert
                      </button>
                    </div>
                    {i < revisions.length - 1 && <Divider />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
