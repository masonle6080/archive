import { afterEach, describe, expect, it } from 'vitest'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { useArchiveFixture } from './archive-fixture'
import { startMediaServer, type MediaServer } from './media-server'

const fx = useArchiveFixture()
let server: MediaServer | null = null

afterEach(async () => {
  await server?.close()
  server = null
})

/** Imports a 10-byte image and starts a server over the archive's media library. */
async function serveOneFile(): Promise<{ fileName: string; url: string }> {
  const source = join(fx.workDir, 'photo.png')
  writeFileSync(source, '0123456789')
  const { fileName } = fx.archive.media.import(source)
  server = await startMediaServer(fx.archive.media.serve)
  return { fileName, url: server.baseUrl + encodeURIComponent(fileName) }
}

describe('media server', () => {
  it('listens on the loopback address only, under a secret path', async () => {
    await serveOneFile()

    expect(server!.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]{36}\/$/)
  })

  it('serves a whole file with the media library headers', async () => {
    const { url } = await serveOneFile()

    const res = await fetch(url)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(await res.text()).toBe('0123456789')
  })

  it('passes the Range header through, so the player can seek', async () => {
    const { url } = await serveOneFile()

    const res = await fetch(url, { headers: { Range: 'bytes=4-6' } })

    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 4-6/10')
    expect(await res.text()).toBe('456')
  })

  it('answers HEAD with headers and no body', async () => {
    const { url } = await serveOneFile()

    const res = await fetch(url, { method: 'HEAD' })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('10')
    expect(await res.text()).toBe('')
  })

  it('refuses requests without the secret path', async () => {
    const { fileName } = await serveOneFile()
    const origin = new URL(server!.baseUrl).origin

    expect((await fetch(`${origin}/${fileName}`)).status).toBe(404)
    expect((await fetch(`${origin}/not-the-token/${fileName}`)).status).toBe(404)
  })

  it('keeps the media library path checks', async () => {
    await serveOneFile()

    expect((await fetch(server!.baseUrl + 'missing.png')).status).toBe(404)
    expect((await fetch(server!.baseUrl + '..%2Fsecret.png')).status).toBe(403)
  })

  it('refuses methods other than GET and HEAD', async () => {
    const { url } = await serveOneFile()

    expect((await fetch(url, { method: 'POST' })).status).toBe(405)
  })
})
