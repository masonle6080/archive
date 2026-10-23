import { randomUUID } from 'crypto'
import { execFileSync } from 'child_process'
import { closeSync, copyFileSync, openSync, readSync, renameSync, rmSync, statSync } from 'fs'
import { extname, join, resolve, sep } from 'path'
import type { ImportedMedia, MediaType } from '../shared/types'

export interface MediaLibrary {
  /** Copies a file into the media folder under a new name. */
  import(sourcePath: string): ImportedMedia
  /** Answers a `media://<file name>` request from the media folder. */
  serve(request: Request): Response
}

const MEDIA_TYPES: Record<string, { type: MediaType; mime: string }> = {
  '.jpg': { type: 'image', mime: 'image/jpeg' },
  '.jpeg': { type: 'image', mime: 'image/jpeg' },
  '.png': { type: 'image', mime: 'image/png' },
  '.gif': { type: 'image', mime: 'image/gif' },
  '.webp': { type: 'image', mime: 'image/webp' },
  '.heic': { type: 'image', mime: 'image/heic' },
  '.avif': { type: 'image', mime: 'image/avif' },
  '.mp4': { type: 'video', mime: 'video/mp4' },
  '.mov': { type: 'video', mime: 'video/quicktime' },
  '.webm': { type: 'video', mime: 'video/webm' },
  '.m4v': { type: 'video', mime: 'video/x-m4v' }
}

// Cap how much of a file we read per request. Chromium's media pipeline
// issues concurrent/superseding range requests when scrubbing to find a
// moov atom at the end of a non-fast-start video, and Electron's
// protocol.handle has a cancellation race with long-lived streamed
// Response bodies on large files that corrupts those concurrent reads.
// Bounded synchronous reads (no live stream to race against) sidestep it.
const MEDIA_CHUNK_SIZE = 8 * 1024 * 1024

export function createMediaLibrary(mediaDir: string, ffmpegPath: string | null): MediaLibrary {
  // Electron's custom protocol handler (media://) can't satisfy the extra
  // range request Chromium's video pipeline needs to locate a moov atom that
  // trails the file — see electron/electron#38749. Cameras and screen
  // recorders commonly write the moov atom at the end, so remux with
  // +faststart (a fast, lossless container rewrite, no re-encoding) to move
  // it to the front. Falls back to a plain copy if ffmpeg isn't available.
  function importVideo(sourcePath: string, destPath: string): void {
    if (!ffmpegPath) {
      copyFileSync(sourcePath, destPath)
      return
    }

    const tempPath = `${destPath}.faststart-tmp${extname(destPath)}`
    try {
      execFileSync(
        ffmpegPath,
        ['-y', '-i', sourcePath, '-c', 'copy', '-movflags', '+faststart', tempPath],
        { stdio: 'ignore' }
      )
      renameSync(tempPath, destPath)
    } catch {
      rmSync(tempPath, { force: true })
      copyFileSync(sourcePath, destPath)
    }
  }

  function importMedia(sourcePath: string): ImportedMedia {
    const ext = extname(sourcePath)
    const type = MEDIA_TYPES[ext.toLowerCase()]?.type
    if (!type) {
      throw new Error(`Unsupported file type: ${ext || '(no extension)'}`)
    }

    const fileName = `${randomUUID()}${ext.toLowerCase()}`
    const destPath = join(mediaDir, fileName)

    if (type === 'video') {
      importVideo(sourcePath, destPath)
    } else {
      copyFileSync(sourcePath, destPath)
    }

    return { fileName, type }
  }

  function serve(request: Request): Response {
    const url = new URL(request.url)
    const fileName = decodeURIComponent(url.hostname)
    const root = resolve(mediaDir)
    const filePath = resolve(root, fileName)

    if (filePath !== root && !filePath.startsWith(root + sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(filePath)
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const contentType =
      MEDIA_TYPES[extname(filePath).toLowerCase()]?.mime ?? 'application/octet-stream'
    const range = request.headers.get('range')

    let start = 0
    let end = stat.size - 1
    let partial = false

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) {
        return new Response('Invalid range', { status: 416 })
      }
      // A suffix longer than the file means the whole file (RFC 9110 §14.1.2).
      start = match[1] ? parseInt(match[1], 10) : Math.max(0, stat.size - parseInt(match[2], 10))
      end = match[2] && match[1] ? parseInt(match[2], 10) : stat.size - 1
      if (start >= stat.size || end >= stat.size || start > end) {
        return new Response('Range not satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` }
        })
      }
      partial = true
    }

    if (end - start + 1 > MEDIA_CHUNK_SIZE) {
      end = start + MEDIA_CHUNK_SIZE - 1
      partial = true
    }

    const length = end - start + 1
    const buffer = Buffer.alloc(length)
    const fd = openSync(filePath, 'r')
    try {
      readSync(fd, buffer, 0, length, start)
    } finally {
      closeSync(fd)
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    }
    if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`

    return new Response(buffer, { status: partial ? 206 : 200, headers })
  }

  return { import: importMedia, serve }
}
