import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openArchive, type Archive } from './archive'
import { findFfmpeg } from './ffmpeg'

const ffmpegPath = findFfmpeg()

const UUID_NAME = (ext: string): RegExp =>
  new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\${ext}$`)

/** Lists the top-level box types of an MP4/MOV file, in file order. */
function topLevelBoxes(file: Buffer): string[] {
  const types: string[] = []
  let offset = 0
  while (offset + 8 <= file.length) {
    let size = file.readUInt32BE(offset)
    const type = file.toString('latin1', offset + 4, offset + 8)
    if (size === 1) size = Number(file.readBigUInt64BE(offset + 8))
    if (size === 0) size = file.length - offset
    types.push(type)
    offset += size
  }
  return types
}

let workDir: string
let mediaDir: string
let archive: Archive

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'media-test-'))
  mediaDir = join(workDir, 'media')
  archive = openArchive({ db: ':memory:', mediaDir })
})

afterEach(() => {
  archive.close()
  rmSync(workDir, { recursive: true, force: true })
})

function sourceFile(name: string, content: string | Buffer): string {
  const path = join(workDir, name)
  writeFileSync(path, content)
  return path
}

describe('media library import', () => {
  it('rejects an unsupported extension with a clear error', () => {
    const source = sourceFile('notes.txt', 'hello')

    expect(() => archive.media.import(source)).toThrow('Unsupported file type: .txt')
    expect(readdirSync(mediaDir)).toEqual([])
  })

  it('copies an image into the media folder under a UUID name with a lowercase extension', () => {
    const source = sourceFile('Holiday.JPG', 'jpeg bytes')

    const imported = archive.media.import(source)

    expect(imported.type).toBe('image')
    expect(imported.fileName).toMatch(UUID_NAME('.jpg'))
    expect(readdirSync(mediaDir)).toEqual([imported.fileName])
    expect(readFileSync(join(mediaDir, imported.fileName), 'utf8')).toBe('jpeg bytes')
  })

  it('copies a video unchanged when no ffmpeg is given', () => {
    const source = sourceFile('clip.MOV', 'not really a movie')

    const imported = archive.media.import(source)

    expect(imported.type).toBe('video')
    expect(imported.fileName).toMatch(UUID_NAME('.mov'))
    expect(readdirSync(mediaDir)).toEqual([imported.fileName])
    expect(readFileSync(join(mediaDir, imported.fileName), 'utf8')).toBe('not really a movie')
  })

  it.skipIf(!ffmpegPath)('remuxes a video so the moov atom comes before the media data', () => {
    const source = join(workDir, 'clip.mp4')
    execFileSync(
      ffmpegPath!,
      ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10', '-pix_fmt', 'yuv420p', source],
      { stdio: 'ignore' }
    )
    expect(topLevelBoxes(readFileSync(source)).indexOf('moov')).toBeGreaterThan(
      topLevelBoxes(readFileSync(source)).indexOf('mdat')
    )
    archive.close()
    archive = openArchive({ db: ':memory:', mediaDir, ffmpegPath })

    const imported = archive.media.import(source)

    const boxes = topLevelBoxes(readFileSync(join(mediaDir, imported.fileName)))
    expect(imported.type).toBe('video')
    expect(imported.fileName).toMatch(UUID_NAME('.mp4'))
    expect(boxes.indexOf('moov')).toBeGreaterThanOrEqual(0)
    expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'))
    expect(readdirSync(mediaDir)).toEqual([imported.fileName])
  })

  it('copies a video unchanged when the ffmpeg remux fails', () => {
    archive.close()
    archive = openArchive({ db: ':memory:', mediaDir, ffmpegPath: join(workDir, 'no-ffmpeg') })
    const source = sourceFile('clip.mp4', 'not really a movie')

    const imported = archive.media.import(source)

    expect(readdirSync(mediaDir)).toEqual([imported.fileName])
    expect(readFileSync(join(mediaDir, imported.fileName), 'utf8')).toBe('not really a movie')
  })

  it('leaves no partial remux output behind when ffmpeg fails midway', () => {
    // A stand-in ffmpeg that writes its output file (the last argument), then fails.
    const fakeFfmpeg = sourceFile('fake-ffmpeg', '#!/bin/sh\nfor last; do :; done\necho partial > "$last"\nexit 1\n')
    chmodSync(fakeFfmpeg, 0o755)
    archive.close()
    archive = openArchive({ db: ':memory:', mediaDir, ffmpegPath: fakeFfmpeg })
    const source = sourceFile('clip.mp4', 'not really a movie')

    const imported = archive.media.import(source)

    expect(readdirSync(mediaDir)).toEqual([imported.fileName])
    expect(readFileSync(join(mediaDir, imported.fileName), 'utf8')).toBe('not really a movie')
  })
})

describe('media library serve', () => {
  const MiB = 1024 * 1024

  function importBytes(name: string, content: string | Buffer): string {
    return archive.media.import(sourceFile(name, content)).fileName
  }

  function get(fileName: string, range?: string): Response {
    const headers: Record<string, string> = range ? { Range: range } : {}
    return archive.media.serve(new Request(`media://${encodeURIComponent(fileName)}`, { headers }))
  }

  it('returns 200 with the full content of a small file', async () => {
    const fileName = importBytes('photo.png', '0123456789')

    const response = get(fileName)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('0123456789')
    expect(response.headers.get('Content-Length')).toBe('10')
    expect(response.headers.get('Content-Range')).toBeNull()
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it.each([
    ['open-ended', 'bytes=2-', '23456789', 'bytes 2-9/10'],
    ['suffix', 'bytes=-3', '789', 'bytes 7-9/10'],
    ['bounded', 'bytes=2-4', '234', 'bytes 2-4/10'],
    ['suffix longer than the file', 'bytes=-20', '0123456789', 'bytes 0-9/10']
  ])('returns 206 for a %s range', async (_kind, range, body, contentRange) => {
    const fileName = importBytes('photo.png', '0123456789')

    const response = get(fileName, range)

    expect(response.status).toBe(206)
    expect(await response.text()).toBe(body)
    expect(response.headers.get('Content-Range')).toBe(contentRange)
    expect(response.headers.get('Content-Length')).toBe(String(body.length))
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('caps a large file at 8 MiB per response', async () => {
    const fileName = importBytes('clip.mp4', Buffer.alloc(9 * MiB, 7))

    const whole = get(fileName)
    const tail = get(fileName, `bytes=${MiB}-`)

    expect(whole.status).toBe(206)
    expect(whole.headers.get('Content-Range')).toBe(`bytes 0-${8 * MiB - 1}/${9 * MiB}`)
    expect((await whole.arrayBuffer()).byteLength).toBe(8 * MiB)
    expect(tail.status).toBe(206)
    expect(tail.headers.get('Content-Range')).toBe(`bytes ${MiB}-${9 * MiB - 1}/${9 * MiB}`)
    expect((await tail.arrayBuffer()).byteLength).toBe(8 * MiB)
  })

  it.each(['bytes=abc', 'bytes=-', 'items=0-1', 'bytes=0-1,4-5'])(
    'returns 416 for the malformed range %s',
    (range) => {
      const fileName = importBytes('photo.png', '0123456789')

      expect(get(fileName, range).status).toBe(416)
    }
  )

  it.each(['bytes=10-', 'bytes=5-2', 'bytes=-0'])(
    'returns 416 for the out-of-range range %s',
    (range) => {
      const fileName = importBytes('photo.png', '0123456789')

      const response = get(fileName, range)

      expect(response.status).toBe(416)
      expect(response.headers.get('Content-Range')).toBe('bytes */10')
    }
  )

  it('returns 404 for a missing file', () => {
    expect(get('missing.png').status).toBe(404)
  })

  it('returns 403 for an encoded path traversal', async () => {
    writeFileSync(join(workDir, 'secret.png'), 'outside the media folder')

    const response = archive.media.serve(new Request('media://..%2Fsecret.png'))

    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('outside the media folder')
  })

  it.each([
    ['photo.jpeg', 'image/jpeg'],
    ['photo.PNG', 'image/png'],
    ['photo.heic', 'image/heic'],
    ['clip.mov', 'video/quicktime'],
    ['clip.webm', 'video/webm'],
    ['clip.m4v', 'video/x-m4v']
  ])('sets the Content-Type of %s to %s', (name, mime) => {
    const fileName = importBytes(name, 'bytes')

    expect(get(fileName).headers.get('Content-Type')).toBe(mime)
  })
})
