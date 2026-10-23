import { randomUUID } from 'crypto'
import { execFileSync } from 'child_process'
import { copyFileSync, existsSync, renameSync } from 'fs'
import { extname, join } from 'path'
import { getMediaDir } from './db'
import type { ImportedMedia, MediaType } from '../shared/types'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v'])

// GUI-launched apps on macOS don't inherit the shell's PATH, so a plain
// `ffmpeg` lookup misses Homebrew installs. Check common install locations
// before falling back to PATH resolution.
const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']

let cachedFfmpegPath: string | null | undefined

function findFfmpeg(): string | null {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath
  for (const candidate of FFMPEG_CANDIDATES) {
    try {
      if (candidate.startsWith('/') && !existsSync(candidate)) continue
      execFileSync(candidate, ['-version'], { stdio: 'ignore' })
      cachedFfmpegPath = candidate
      return cachedFfmpegPath
    } catch {
      continue
    }
  }
  cachedFfmpegPath = null
  return null
}

function typeForExtension(ext: string): MediaType | null {
  const lower = ext.toLowerCase()
  if (IMAGE_EXTENSIONS.has(lower)) return 'image'
  if (VIDEO_EXTENSIONS.has(lower)) return 'video'
  return null
}

// Electron's custom protocol handler (media://) can't satisfy the extra
// range request Chromium's video pipeline needs to locate a moov atom that
// trails the file — see electron/electron#38749. Cameras and screen
// recorders commonly write the moov atom at the end, so remux with
// +faststart (a fast, lossless container rewrite, no re-encoding) to move
// it to the front. Falls back to a plain copy if ffmpeg isn't available.
function importVideo(sourcePath: string, destPath: string): void {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) {
    copyFileSync(sourcePath, destPath)
    return
  }

  const tempPath = `${destPath}.faststart-tmp${extname(destPath)}`
  try {
    execFileSync(
      ffmpeg,
      ['-y', '-i', sourcePath, '-c', 'copy', '-movflags', '+faststart', tempPath],
      { stdio: 'ignore' }
    )
    renameSync(tempPath, destPath)
  } catch {
    copyFileSync(sourcePath, destPath)
  }
}

export function importMedia(sourcePath: string): ImportedMedia {
  const ext = extname(sourcePath)
  const type = typeForExtension(ext)
  if (!type) {
    throw new Error(`Unsupported file type: ${ext || '(no extension)'}`)
  }

  const fileName = `${randomUUID()}${ext.toLowerCase()}`
  const destPath = join(getMediaDir(), fileName)

  if (type === 'video') {
    importVideo(sourcePath, destPath)
  } else {
    copyFileSync(sourcePath, destPath)
  }

  return { fileName, type }
}
